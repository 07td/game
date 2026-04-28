import { NpcType } from "../../../rs/config/npctype/NpcType";
import { SeqTypeLoader } from "../../../rs/config/seqtype/SeqTypeLoader";
import { SeqFrameLoader } from "../../../rs/model/seq/SeqFrameLoader";
import { BLOCKED_STATEGY, NORMAL_STRATEGY } from "../../../rs/pathfinder/CollisionStrategy";
import { Pathfinder } from "../../../rs/pathfinder/Pathfinder";
import { ExactRouteStrategy } from "../../../rs/pathfinder/RouteStrategy";
import { CollisionFlag } from "../../../rs/pathfinder/flag/CollisionFlag";
import { CollisionMap } from "../../../rs/scene/CollisionMap";
import { clamp } from "../../../util/MathUtil";
import { AnimationFrames } from "../AnimationFrames";

export enum MovementType {
    CRAWL = 0,
    WALK = 1,
    RUN = 2,
}

const routeStrategy = new ExactRouteStrategy();

const DIRECTION_ROTATIONS = [768, 1024, 1280, 512, 1536, 256, 0, 1792];

export class Npc {
    rotation: number = 0;
    orientation: number = 0;

    pathX: number[] = new Array(10);
    pathY: number[] = new Array(10);
    pathMovementType: MovementType[] = new Array(10);
    pathLength: number = 0;

    serverPathX: number[] = new Array(25);
    serverPathY: number[] = new Array(25);
    serverPathMovementType: MovementType[] = new Array(25);
    serverPathLength: number = 0;

    x: number;
    y: number;

    movementSeqId: number = -1;
    movementFrame: number = 0;
    movementFrameTick: number = 0;
    movementLoop: number = 0;

    tdEnemySlot: number = -1;
    tdActive: boolean = false;
    tdCompleted: boolean = false;
    tdSpawnDelayTicks: number = 0;
    tdRouteIndex: number = 0;
    tdMoveClientTicks: number = 0;
    tdRoute?: Array<{ x: number; y: number }>;
    tdEnemyId?: string;
    tdAttackSeqId: number = -1;
    tdCombatActive: boolean = false;
    tdCombatTargetX?: number;
    tdCombatTargetY?: number;
    tdLocalSpeakerId?: string;
    tdStatic: boolean = false;
    tdWanderRadius: number = 0;
    tdWanderCooldownTicks: number = (Math.random() * 40) | 0;

    constructor(
        readonly spawnX: number,
        readonly spawnY: number,
        readonly level: number,
        readonly idleAnim: AnimationFrames,
        readonly walkAnim: AnimationFrames | undefined,
        attackAnim: AnimationFrames | undefined,
        readonly npcType: NpcType,
        readonly idleSeqId: number,
        readonly walkSeqId: number,
        attackSeqId: number = -1,
    ) {
        this.attackAnim = attackAnim;
        this.attackSeqId = attackSeqId;
        this.rotation = DIRECTION_ROTATIONS[npcType.spawnDirection];

        this.pathX[0] = clamp(spawnX, 0, 64 - npcType.size);
        this.pathY[0] = clamp(spawnY, 0, 64 - npcType.size);

        this.x = this.pathX[0] * 128 + npcType.size * 64;
        this.y = this.pathY[0] * 128 + npcType.size * 64;
    }

    attackAnim: AnimationFrames | undefined;
    attackSeqId: number;

    getSize(): number {
        return this.npcType.size;
    }

    private getTdRouteAnchor(tileX: number, tileY: number, size: number): { x: number; y: number } {
        const offset = Math.floor(size / 2);
        return {
            x: clamp(tileX - offset, 0, 64 - size),
            y: clamp(tileY - offset, 0, 64 - size),
        };
    }

    setTdLocalPosition(localX: number, localY: number): void {
        const size = this.npcType.size;
        const minCenter = size * 64;
        const maxCenter = (64 - size) * 128 + size * 64;
        const nextX = Math.round(clamp(localX, minCenter, maxCenter));
        const nextY = Math.round(clamp(localY, minCenter, maxCenter));

        if (nextX !== this.x || nextY !== this.y) {
            if (this.x < nextX) {
                if (this.y < nextY) {
                    this.orientation = 1280;
                } else if (this.y > nextY) {
                    this.orientation = 1792;
                } else {
                    this.orientation = 1536;
                }
            } else if (this.x > nextX) {
                if (this.y < nextY) {
                    this.orientation = 768;
                } else if (this.y > nextY) {
                    this.orientation = 256;
                } else {
                    this.orientation = 512;
                }
            } else if (this.y < nextY) {
                this.orientation = 1024;
            } else if (this.y > nextY) {
                this.orientation = 0;
            }
            this.tdMoveClientTicks = 4;
        }

        this.x = nextX;
        this.y = nextY;
        this.pathX[0] = clamp(Math.floor(this.x / 128 - size / 2), 0, 64 - size);
        this.pathY[0] = clamp(Math.floor(this.y / 128 - size / 2), 0, 64 - size);
        this.pathLength = 0;
        this.serverPathLength = 0;
    }

    canWalk(): boolean {
        if (this.npcType.cacheInfo.revision >= 508) {
            return (this.npcType.loginScreenProps & 0x2) > 0 && this.walkSeqId !== -1;
        }
        return this.walkSeqId !== -1 && this.walkSeqId !== this.idleSeqId;
    }

    setTdCombatState(active: boolean, targetX?: number, targetY?: number): void {
        const wasActive = this.tdCombatActive;
        this.tdCombatActive = active;
        if (active) {
            this.tdMoveClientTicks = 0;
            this.pathLength = 0;
            this.serverPathLength = 0;

            const combatSeqId =
                this.tdAttackSeqId !== -1
                    ? this.tdAttackSeqId
                    : this.attackSeqId !== -1
                    ? this.attackSeqId
                    : this.walkSeqId !== -1
                    ? this.walkSeqId
                    : this.idleSeqId;
            if (!wasActive && combatSeqId !== -1) {
                this.movementFrame = 0;
                this.movementFrameTick = 0;
                this.movementLoop = 0;
                this.movementSeqId = combatSeqId;
            }
        }
        this.tdCombatTargetX = active ? targetX : undefined;
        this.tdCombatTargetY = active ? targetY : undefined;
    }

    queuePathDir(dir: number, movementType: MovementType) {
        let x = this.pathX[0];
        let y = this.pathY[0];
        switch (dir) {
            case 0:
                x--;
                y++;
                break;
            case 1:
                y++;
                break;
            case 2:
                x++;
                y++;
                break;
            case 3:
                x--;
                break;
            case 4:
                x++;
                break;
            case 5:
                x--;
                y--;
                break;
            case 6:
                y--;
                break;
            case 7:
                x++;
                y--;
                break;
        }

        if (this.pathLength < 9) {
            this.pathLength++;
        }

        for (let i = this.pathLength; i > 0; i--) {
            this.pathX[i] = this.pathX[i - 1];
            this.pathY[i] = this.pathY[i - 1];
            this.pathMovementType[i] = this.pathMovementType[i - 1];
        }

        this.pathX[0] = clamp(x, 0, 64 - this.npcType.size - 1);
        this.pathY[0] = clamp(y, 0, 64 - this.npcType.size - 1);
        this.pathMovementType[0] = movementType;
    }

    queuePath(x: number, y: number, movementType: MovementType) {
        if (this.pathLength < 9) {
            this.pathLength++;
        }

        for (let i = this.pathLength; i > 0; i--) {
            this.pathX[i] = this.pathX[i - 1];
            this.pathY[i] = this.pathY[i - 1];
            this.pathMovementType[i] = this.pathMovementType[i - 1];
        }

        this.pathX[0] = clamp(x, 0, 64 - this.npcType.size - 1);
        this.pathY[0] = clamp(y, 0, 64 - this.npcType.size - 1);
        this.pathMovementType[0] = movementType;
    }

    updateMovement(seqTypeLoader: SeqTypeLoader, seqFrameLoader: SeqFrameLoader) {
        const previousMovementSeqId = this.movementSeqId;
        this.movementSeqId = this.idleSeqId;
        if (this.pathLength > 0) {
            const currX = this.x;
            const currY = this.y;
            const nextX = this.pathX[this.pathLength - 1] * 128 + this.npcType.size * 64;
            const nextY = this.pathY[this.pathLength - 1] * 128 + this.npcType.size * 64;

            if (currX < nextX) {
                if (currY < nextY) {
                    this.orientation = 1280;
                } else if (currY > nextY) {
                    this.orientation = 1792;
                } else {
                    this.orientation = 1536;
                }
            } else if (currX > nextX) {
                if (currY < nextY) {
                    this.orientation = 768;
                } else if (currY > nextY) {
                    this.orientation = 256;
                } else {
                    this.orientation = 512;
                }
            } else if (currY < nextY) {
                this.orientation = 1024;
            } else if (currY > nextY) {
                this.orientation = 0;
            }

            this.movementSeqId = this.walkSeqId;

            const movementType = this.pathMovementType[this.pathLength - 1];
            if (
                nextX - currX <= 256 &&
                nextX - currX >= -256 &&
                nextY - currY <= 256 &&
                nextY - currY >= -256
            ) {
                let movementSpeed = 4;

                if (this.npcType.isClickable) {
                    if (this.rotation !== this.orientation && this.npcType.rotationSpeed !== 0) {
                        movementSpeed = 2;
                    }
                    if (this.pathLength > 2) {
                        movementSpeed = 6;
                    }
                    if (this.pathLength > 3) {
                        movementSpeed = 8;
                    }
                } else {
                    if (this.pathLength > 1) {
                        movementSpeed = 6;
                    }
                    if (this.pathLength > 2) {
                        movementSpeed = 8;
                    }
                }

                if (movementType === MovementType.RUN) {
                    movementSpeed <<= 1;
                } else if (movementType === MovementType.CRAWL) {
                    movementSpeed >>= 1;
                }

                if (currX !== nextX || currY !== nextY) {
                    if (currX < nextX) {
                        this.x += movementSpeed;
                        if (this.x > nextX) {
                            this.x = nextX;
                        }
                    } else if (currX > nextX) {
                        this.x -= movementSpeed;
                        if (this.x < nextX) {
                            this.x = nextX;
                        }
                    }

                    if (currY < nextY) {
                        this.y += movementSpeed;
                        if (this.y > nextY) {
                            this.y = nextY;
                        }
                    } else if (currY > nextY) {
                        this.y -= movementSpeed;
                        if (this.y < nextY) {
                            this.y = nextY;
                        }
                    }
                }

                if (this.x === nextX && this.y === nextY) {
                    this.pathLength--;
                }
            } else {
                this.x = nextX;
                this.y = nextY;
                this.pathLength--;
            }
        }

        if (
            this.tdEnemySlot >= 0 &&
            this.tdEnemyId !== undefined &&
            this.tdMoveClientTicks > 0 &&
            this.walkSeqId !== -1
        ) {
            this.movementSeqId = this.walkSeqId;
            this.tdMoveClientTicks--;
        }

        if (this.tdCombatActive) {
            if (
                this.tdCombatTargetX !== undefined &&
                this.tdCombatTargetY !== undefined
            ) {
                const nextX = this.tdCombatTargetX;
                const nextY = this.tdCombatTargetY;
                if (this.x < nextX) {
                    if (this.y < nextY) {
                        this.orientation = 1280;
                    } else if (this.y > nextY) {
                        this.orientation = 1792;
                    } else {
                        this.orientation = 1536;
                    }
                } else if (this.x > nextX) {
                    if (this.y < nextY) {
                        this.orientation = 768;
                    } else if (this.y > nextY) {
                        this.orientation = 256;
                    } else {
                        this.orientation = 512;
                    }
                } else if (this.y < nextY) {
                    this.orientation = 1024;
                } else if (this.y > nextY) {
                    this.orientation = 0;
                }
            }

            const combatSeqId =
                this.tdAttackSeqId !== -1
                    ? this.tdAttackSeqId
                    : this.attackSeqId !== -1
                    ? this.attackSeqId
                    : this.walkSeqId !== -1
                    ? this.walkSeqId
                    : this.idleSeqId;
            if (combatSeqId !== -1 && previousMovementSeqId !== combatSeqId) {
                this.movementFrame = 0;
                this.movementFrameTick = 0;
                this.movementLoop = 0;
            }
            this.movementSeqId = combatSeqId;
        }

        const deltaRotation = (this.orientation - this.rotation) & 2047;
        if (deltaRotation !== 0) {
            const rotateDir = deltaRotation > 1024 ? -1 : 1;
            this.rotation += rotateDir * this.npcType.rotationSpeed;
            if (
                deltaRotation < this.npcType.rotationSpeed ||
                deltaRotation > 2048 - this.npcType.rotationSpeed
            ) {
                this.rotation = this.orientation;
            }

            this.rotation &= 2047;
        }

        this.updateMovementSeq(seqTypeLoader, seqFrameLoader);
    }

    updateMovementSeq(seqTypeLoader: SeqTypeLoader, seqFrameLoader: SeqFrameLoader) {
        if (this.movementSeqId !== -1) {
            const seqType = seqTypeLoader.load(this.movementSeqId);
            if (!seqType.isSkeletalSeq() && seqType.frameIds) {
                this.movementFrameTick++;
                if (
                    this.movementFrame < seqType.frameIds.length &&
                    this.movementFrameTick >
                        seqType.getFrameLength(seqFrameLoader, this.movementFrame)
                ) {
                    this.movementFrameTick = 1;
                    this.movementFrame++;
                }

                if (this.movementFrame >= seqType.frameIds.length) {
                    if (seqType.frameStep > 0) {
                        this.movementFrame -= seqType.frameStep;
                        if (seqType.looping) {
                            this.movementLoop++;
                        }

                        if (
                            this.movementFrame < 0 ||
                            this.movementFrame >= seqType.frameIds.length ||
                            (seqType.looping && this.movementLoop >= seqType.maxLoops)
                        ) {
                            this.movementFrameTick = 0;
                            this.movementFrame = 0;
                            this.movementLoop = 0;
                        } else {
                            this.movementFrameTick = 0;
                            this.movementFrame = 0;
                        }
                    } else {
                        this.movementFrameTick = 0;
                        this.movementFrame = 0;
                    }
                }
            } else if (seqType.isSkeletalSeq()) {
                this.movementFrame++;
                const frameCount = seqType.getSkeletalDuration();
                if (this.movementFrame >= frameCount) {
                    if (seqType.frameStep > 0) {
                        this.movementFrame -= seqType.frameStep;
                        if (seqType.looping) {
                            this.movementLoop++;
                        }

                        if (
                            this.movementFrame < 0 ||
                            this.movementFrame >= seqType.frameIds.length ||
                            (seqType.looping && this.movementLoop >= seqType.maxLoops)
                        ) {
                            this.movementFrameTick = 0;
                            this.movementFrame = 0;
                            this.movementLoop = 0;
                        } else {
                            this.movementFrameTick = 0;
                            this.movementFrame = 0;
                        }
                    } else {
                        this.movementFrameTick = 0;
                        this.movementFrame = 0;
                    }
                }
            } else {
                this.movementSeqId = -1;
            }
        }
    }

    updateServerMovement(
        pathfinder: Pathfinder,
        borderSize: number,
        collisionMaps: CollisionMap[],
    ) {
        if (this.tdStatic) {
            return;
        }

        if (this.tdEnemySlot >= 0) {
            return;
        }

        if (this.tdRoute) {
            if (this.tdCompleted) {
                return;
            }

            const collisionMap = collisionMaps[this.level];
            const size = this.getSize();

            if (!this.tdActive) {
                if (this.tdSpawnDelayTicks > 0) {
                    this.tdSpawnDelayTicks--;
                    return;
                }

                this.tdActive = true;
                this.tdRouteIndex = 0;
                this.pathLength = 0;
                this.serverPathLength = 0;

                const start = this.tdRoute[0];
                const startAnchor = this.getTdRouteAnchor(start.x, start.y, size);
                this.pathX[0] = startAnchor.x;
                this.pathY[0] = startAnchor.y;
                this.x = startAnchor.x * 128 + size * 64;
                this.y = startAnchor.y * 128 + size * 64;
            }

            if (this.pathLength === 0 && this.serverPathLength === 0) {
                if (this.tdRouteIndex >= this.tdRoute.length - 1) {
                    this.tdCompleted = true;
                    this.tdActive = false;
                    return;
                }

                const currX = this.pathX[0];
                const currY = this.pathY[0];
                const next = this.tdRoute[this.tdRouteIndex + 1];
                const nextAnchor = this.getTdRouteAnchor(next.x, next.y, size);

                routeStrategy.approxDestX = nextAnchor.x;
                routeStrategy.approxDestY = nextAnchor.y;
                routeStrategy.destSizeX = size;
                routeStrategy.destSizeY = size;

                let steps = pathfinder.findPath(
                    currX,
                    currY,
                    size,
                    this.level,
                    routeStrategy,
                    NORMAL_STRATEGY,
                    CollisionFlag.BLOCK_NPCS,
                    true,
                );
                if (steps > 24) {
                    steps = 24;
                }
                if (steps <= 0) {
                    this.tdCompleted = true;
                    this.tdActive = false;
                    return;
                }

                for (let s = 0; s < steps; s++) {
                    this.serverPathX[s] = pathfinder.bufferX[s];
                    this.serverPathY[s] = pathfinder.bufferY[s];
                    this.serverPathMovementType[s] = MovementType.WALK;
                }
                this.serverPathLength = steps;
                this.tdRouteIndex++;
            }

            if (this.serverPathLength > 0) {
                const currX = this.pathX[0];
                const currY = this.pathY[0];
                const targetX = this.serverPathX[this.serverPathLength - 1];
                const targetY = this.serverPathY[this.serverPathLength - 1];
                const deltaX = clamp(targetX - currX, -1, 1);
                const deltaY = clamp(targetY - currY, -1, 1);
                const nextX = currX + deltaX;
                const nextY = currY + deltaY;

                let canMove = true;
                exitTd: for (let flagX = nextX; flagX < nextX + size; flagX++) {
                    for (let flagY = nextY; flagY < nextY + size; flagY++) {
                        if (
                            collisionMap.hasFlag(
                                flagX + borderSize,
                                flagY + borderSize,
                                CollisionFlag.BLOCK_NPCS,
                            )
                        ) {
                            canMove = false;
                            break exitTd;
                        }
                    }
                }

                if (canMove) {
                    this.queuePath(nextX, nextY, MovementType.WALK);
                }

                if (nextX === targetX && nextY === targetY) {
                    this.serverPathLength--;
                }
            }

            return;
        }

        if (this.tdLocalSpeakerId && this.tdWanderRadius > 0) {
            const collisionMap = collisionMaps[this.level];

            if (this.pathLength === 0 && this.serverPathLength === 0) {
                if (this.tdWanderCooldownTicks > 0) {
                    this.tdWanderCooldownTicks--;
                } else if (this.canWalk()) {
                    const planned = this.planWanderPath(
                        pathfinder,
                        borderSize,
                        collisionMap,
                        this.tdWanderRadius,
                        6,
                    );
                    this.tdWanderCooldownTicks = planned
                        ? 10 + ((Math.random() * 20) | 0)
                        : 18 + ((Math.random() * 32) | 0);
                }
            }

            this.followServerPath(borderSize, collisionMap);
            return;
        }

        const collisionMap = collisionMaps[this.level];

        if (this.canWalk() && Math.random() < 0.1) {
            this.planWanderPath(pathfinder, borderSize, collisionMap, 5);
        }

        this.followServerPath(borderSize, collisionMap);
    }

    getAnimationFrames(): AnimationFrames {
        const activeAttackSeqId = this.tdAttackSeqId !== -1 ? this.tdAttackSeqId : this.attackSeqId;
        if (
            this.attackAnim &&
            activeAttackSeqId !== -1 &&
            this.movementSeqId === activeAttackSeqId
        ) {
            return this.attackAnim;
        }
        return this.walkAnim && this.movementSeqId === this.walkSeqId
            ? this.walkAnim
            : this.idleAnim;
    }

    private planWanderPath(
        pathfinder: Pathfinder,
        borderSize: number,
        collisionMap: CollisionMap,
        wanderRadius: number,
        attempts: number = 1,
    ): boolean {
        const size = this.getSize();
        const srcX = this.pathX[0];
        const srcY = this.pathY[0];
        const spawnX = this.spawnX;
        const spawnY = this.spawnY;

        pathfinder.setNpcFlags(srcX, srcY, spawnX, spawnY, wanderRadius, borderSize, collisionMap);

        let collisionStrategy = NORMAL_STRATEGY;
        if (collisionMap.hasFlag(spawnX + borderSize, spawnY + borderSize, CollisionFlag.FLOOR)) {
            collisionStrategy = BLOCKED_STATEGY;
        }

        for (let attempt = 0; attempt < attempts; attempt++) {
            const deltaX = Math.round(Math.random() * wanderRadius * 2 - wanderRadius);
            const deltaY = Math.round(Math.random() * wanderRadius * 2 - wanderRadius);
            const targetX = clamp(spawnX + deltaX, 0, 64 - size - 1);
            const targetY = clamp(spawnY + deltaY, 0, 64 - size - 1);
            if (targetX === srcX && targetY === srcY) {
                continue;
            }

            routeStrategy.approxDestX = targetX;
            routeStrategy.approxDestY = targetY;
            routeStrategy.destSizeX = size;
            routeStrategy.destSizeY = size;

            let steps = pathfinder.findPath(
                srcX,
                srcY,
                size,
                this.level,
                routeStrategy,
                collisionStrategy,
                CollisionFlag.BLOCK_NPCS,
                true,
            );
            if (steps <= 0) {
                continue;
            }

            if (steps > 24) {
                steps = 24;
            }
            for (let s = 0; s < steps; s++) {
                this.serverPathX[s] = pathfinder.bufferX[s];
                this.serverPathY[s] = pathfinder.bufferY[s];
                this.serverPathMovementType[s] = MovementType.WALK;
            }
            this.serverPathLength = steps;
            return true;
        }

        return false;
    }

    private followServerPath(borderSize: number, collisionMap: CollisionMap): void {
        if (this.serverPathLength <= 0) {
            return;
        }

        const size = this.getSize();
        const currX = this.pathX[0];
        const currY = this.pathY[0];
        const targetX = this.serverPathX[this.serverPathLength - 1];
        const targetY = this.serverPathY[this.serverPathLength - 1];
        const deltaX = clamp(targetX - currX, -1, 1);
        const deltaY = clamp(targetY - currY, -1, 1);
        const nextX = currX + deltaX;
        const nextY = currY + deltaY;

        for (let flagX = currX; flagX < currX + size; flagX++) {
            for (let flagY = currY; flagY < currY + size; flagY++) {
                collisionMap.unflag(flagX + borderSize, flagY + borderSize, CollisionFlag.BLOCK_NPCS);
            }
        }

        let canMove = true;
        exit: for (let flagX = nextX; flagX < nextX + size; flagX++) {
            for (let flagY = nextY; flagY < nextY + size; flagY++) {
                if (
                    collisionMap.hasFlag(
                        flagX + borderSize,
                        flagY + borderSize,
                        CollisionFlag.BLOCK_NPCS,
                    )
                ) {
                    canMove = false;
                    break exit;
                }
            }
        }

        const occupiedX = canMove ? nextX : currX;
        const occupiedY = canMove ? nextY : currY;
        for (let flagX = occupiedX; flagX < occupiedX + size; flagX++) {
            for (let flagY = occupiedY; flagY < occupiedY + size; flagY++) {
                collisionMap.flag(flagX + borderSize, flagY + borderSize, CollisionFlag.BLOCK_NPCS);
            }
        }

        if (canMove) {
            this.queuePath(nextX, nextY, MovementType.WALK);
        }

        if (nextX === targetX && nextY === targetY) {
            this.serverPathLength--;
        }
    }
}
