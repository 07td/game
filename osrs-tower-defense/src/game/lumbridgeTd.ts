import { LUMBRIDGE_TD_ENEMY_ARCHETYPES, LumbridgeTdEnemyArchetype } from "./lumbridgeTdEnemies";
import {
    emitLumbridgeTdEnemyRemoved,
    emitLumbridgeTdEnemySpawned,
    emitLumbridgeTdEnemyUpdated,
} from "./lumbridgeTdEvents";
import {
    LUMBRIDGE_TD_MAP_X,
    LUMBRIDGE_TD_MAP_Y,
    getLumbridgeTdRoute,
    localTileToRouteEditorPoint,
} from "./lumbridgeTdRoute";

export type ScreenPoint = {
    x: number;
    y: number;
};

export type WorldPoint = {
    x: number;
    y: number;
    z: number;
};

export type TowerKind = "bolt" | "mage" | "cannon";

export type TowerDefinition = {
    kind: TowerKind;
    name: string;
    cost: number;
    damage: number;
    cooldownMs: number;
    range: number;
    color: string;
};

export type TowerPad = {
    id: string;
    tileX: number;
    tileY: number;
    x: number;
    y: number;
};

export type Tower = {
    id: string;
    padId: string;
    kind: TowerKind;
    rotation: number;
    cooldownRemainingMs: number;
    world: WorldPoint;
};

export type Enemy = {
    id: string;
    archetype: EnemyArchetype;
    hp: number;
    maxHp: number;
    progress: number;
    speed: number;
    reward: number;
    damage: number;
};

export type EnemyArchetype = LumbridgeTdEnemyArchetype;

export { LUMBRIDGE_TD_ENEMY_ARCHETYPES };

export type Projectile = {
    id: string;
    kind: TowerKind;
    from: ScreenPoint;
    to: ScreenPoint;
    elapsedMs: number;
    durationMs: number;
    color: string;
};

export type LootType = "coins" | "runes" | "arrows" | "gem" | "bones" | "herbs";

export type LootItem = {
    type: LootType;
    name: string;
    quantity: number;
    value: number;
    rarity: number;
};

export type WaveSummary = {
    wave: number;
    enemiesKilled: number;
    goldEarned: number;
    lootCollected: LootItem[];
    completionBonus: number;
    totalValue: number;
};

export type LumbridgeTdState = {
    wave: number;
    gold: number;
    lives: number;
    selectedTower: TowerKind;
    towers: Tower[];
    enemies: Enemy[];
    projectiles: Projectile[];
    waveInProgress: boolean;
    waveSpawnCount: number;
    waveSpawned: number;
    nextSpawnInMs: number;
    gameOver: boolean;
    currentWaveLoot: LootItem[];
    waveSummary: WaveSummary | null;
    showWaveSummary: boolean;
    selectedEnemy: Enemy | null;
    showEnemyInfo: boolean;
};

const LOOT_TABLES: Record<string, LootItem[]> = {
    "Black dragon": [
        { type: "bones", name: "Dragon bones", quantity: 1, value: 25, rarity: 1.0 },
        { type: "coins", name: "Coins", quantity: 15, value: 15, rarity: 0.8 },
        { type: "gem", name: "Sapphire", quantity: 1, value: 50, rarity: 0.1 },
    ],
    Imp: [
        { type: "coins", name: "Coins", quantity: 8, value: 8, rarity: 0.7 },
        { type: "runes", name: "Fire rune", quantity: 3, value: 6, rarity: 0.4 },
    ],
    Spider: [
        { type: "coins", name: "Coins", quantity: 12, value: 12, rarity: 0.6 },
        { type: "herbs", name: "Grimy guam", quantity: 1, value: 8, rarity: 0.3 },
    ],
    "Hill Giant": [
        { type: "bones", name: "Big bones", quantity: 1, value: 15, rarity: 1.0 },
        { type: "coins", name: "Coins", quantity: 20, value: 20, rarity: 0.5 },
        { type: "gem", name: "Emerald", quantity: 1, value: 75, rarity: 0.05 },
    ],
    "Moss Giant": [
        { type: "bones", name: "Big bones", quantity: 1, value: 15, rarity: 1.0 },
        { type: "coins", name: "Coins", quantity: 30, value: 30, rarity: 0.6 },
        { type: "herbs", name: "Grimy tarromin", quantity: 1, value: 15, rarity: 0.2 },
        { type: "runes", name: "Nature rune", quantity: 2, value: 40, rarity: 0.1 },
    ],
    Demon: [
        { type: "coins", name: "Coins", quantity: 50, value: 50, rarity: 0.8 },
        { type: "runes", name: "Death rune", quantity: 1, value: 60, rarity: 0.3 },
        { type: "gem", name: "Ruby", quantity: 1, value: 120, rarity: 0.08 },
        { type: "gem", name: "Diamond", quantity: 1, value: 200, rarity: 0.02 },
    ],
};

function generateLoot(enemyName: string): LootItem[] {
    const lootTable = LOOT_TABLES[enemyName] || [];
    const drops: LootItem[] = [];

    for (const loot of lootTable) {
        if (Math.random() < loot.rarity) {
            drops.push({ ...loot });
        }
    }

    return drops;
}

function calculateWaveBonus(wave: number): number {
    return Math.round(50 + wave * 25 + Math.pow(wave, 1.5) * 10);
}

function getWaveArchetypes(wave: number): EnemyArchetype[] {
    if (wave <= 1) {
        return [LUMBRIDGE_TD_ENEMY_ARCHETYPES[1], LUMBRIDGE_TD_ENEMY_ARCHETYPES[2]];
    }
    if (wave === 2) {
        return [
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[1],
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[2],
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[3],
        ];
    }
    if (wave === 3) {
        return [
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[2],
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[3],
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[1],
        ];
    }
    if (wave === 4) {
        return [
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[2],
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[3],
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[4],
        ];
    }
    if (wave === 5) {
        return [
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[3],
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[4],
            LUMBRIDGE_TD_ENEMY_ARCHETYPES[5],
        ];
    }
    return [
        LUMBRIDGE_TD_ENEMY_ARCHETYPES[2],
        LUMBRIDGE_TD_ENEMY_ARCHETYPES[3],
        LUMBRIDGE_TD_ENEMY_ARCHETYPES[4],
        LUMBRIDGE_TD_ENEMY_ARCHETYPES[5],
    ];
}

export const LUMBRIDGE_PATH: ScreenPoint[] = [
    { x: 0.9, y: 0.96 },
    { x: 0.87, y: 0.88 },
    { x: 0.84, y: 0.81 },
    { x: 0.8, y: 0.69 },
    { x: 0.78, y: 0.57 },
    { x: 0.72, y: 0.5 },
    { x: 0.69, y: 0.42 },
    { x: 0.63, y: 0.42 },
    { x: 0.58, y: 0.48 },
    { x: 0.51, y: 0.56 },
    { x: 0.57, y: 0.64 },
    { x: 0.54, y: 0.72 },
    { x: 0.51, y: 0.83 },
    { x: 0.5, y: 0.95 },
];

export const LUMBRIDGE_PADS: TowerPad[] = [
    { id: "gate-west", tileX: 31, tileY: 10, x: 31.5 / 64, y: 1 - 10.5 / 64 },
    { id: "fountain", tileX: 30, tileY: 16, x: 30.5 / 64, y: 1 - 16.5 / 64 },
    { id: "courtyard-east", tileX: 35, tileY: 22, x: 35.5 / 64, y: 1 - 22.5 / 64 },
    { id: "bridge-west", tileX: 44, tileY: 24, x: 44.5 / 64, y: 1 - 24.5 / 64 },
    { id: "bridge-east", tileX: 52, tileY: 28, x: 52.5 / 64, y: 1 - 28.5 / 64 },
    { id: "far-road", tileX: 55, tileY: 35, x: 58.5 / 64, y: 1 - 35.5 / 64 },
];

export const TOWER_DEFS: Record<TowerKind, TowerDefinition> = {
    bolt: {
        kind: "bolt",
        name: "Crossbow Tower",
        cost: 30,
        damage: 18,
        cooldownMs: 650,
        range: 0.11,
        color: "#f0e27a",
    },
    mage: {
        kind: "mage",
        name: "Wizard Tower",
        cost: 55,
        damage: 38,
        cooldownMs: 1200,
        range: 0.16,
        color: "#58e1ff",
    },
    cannon: {
        kind: "cannon",
        name: "Cannon Tower",
        cost: 80,
        damage: 62,
        cooldownMs: 1800,
        range: 0.13,
        color: "#ff8f52",
    },
};

function buildSegments(path: ScreenPoint[]) {
    const segments = [];
    let totalLength = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        segments.push({
            from,
            to,
            length,
            start: totalLength,
            end: totalLength + length,
        });
        totalLength += length;
    }

    return {
        totalLength,
        segments,
    };
}

export function samplePath(progress: number): ScreenPoint {
    const route = getLumbridgeTdRoute();
    const path =
        route.length >= 2
            ? route.map((point) => localTileToRouteEditorPoint(point))
            : LUMBRIDGE_PATH;
    const pathSegments = buildSegments(path);
    const clamped = Math.max(0, Math.min(progress, 1));
    const targetDistance = clamped * pathSegments.totalLength;

    for (const segment of pathSegments.segments) {
        if (targetDistance <= segment.end) {
            const localLength = targetDistance - segment.start;
            const t = segment.length === 0 ? 0 : localLength / segment.length;
            return {
                x: segment.from.x + (segment.to.x - segment.from.x) * t,
                y: segment.from.y + (segment.to.y - segment.from.y) * t,
            };
        }
    }

    return path[path.length - 1];
}

export function samplePathLocalTile(progress: number): ScreenPoint {
    const point = samplePath(progress);
    return {
        x: point.x * 64,
        y: (1 - point.y) * 64,
    };
}

export function samplePathWorldTile(progress: number): ScreenPoint {
    const local = samplePathLocalTile(progress);
    return {
        x: LUMBRIDGE_TD_MAP_X * 64 + local.x,
        y: LUMBRIDGE_TD_MAP_Y * 64 + local.y,
    };
}

export function createInitialLumbridgeTdState(): LumbridgeTdState {
    return {
        wave: 0,
        gold: 140,
        lives: 20,
        selectedTower: "bolt",
        towers: [],
        enemies: [],
        projectiles: [],
        waveInProgress: false,
        waveSpawnCount: 0,
        waveSpawned: 0,
        nextSpawnInMs: 0,
        gameOver: false,
        currentWaveLoot: [],
        waveSummary: null,
        showWaveSummary: false,
        selectedEnemy: null,
        showEnemyInfo: false,
    };
}

export function startWave(state: LumbridgeTdState): LumbridgeTdState {
    if (state.waveInProgress || state.gameOver) {
        return state;
    }

    const nextWave = state.wave + 1;
    return {
        ...state,
        wave: nextWave,
        waveInProgress: true,
        waveSpawnCount: 5 + nextWave * 2,
        waveSpawned: 0,
        nextSpawnInMs: 0,
    };
}

export function placeTower(
    state: LumbridgeTdState,
    padId: string,
    world: WorldPoint,
    rotation: number = 0,
): LumbridgeTdState {
    if (state.gameOver) {
        return state;
    }

    const existing = state.towers.find((tower) => tower.padId === padId);
    if (existing) {
        return state;
    }

    const def = TOWER_DEFS[state.selectedTower];
    if (state.gold < def.cost) {
        return state;
    }

    return {
        ...state,
        gold: state.gold - def.cost,
        towers: [
            ...state.towers,
            {
                id: `${padId}-${state.selectedTower}`,
                padId,
                kind: state.selectedTower,
                rotation: ((rotation % 4) + 4) % 4,
                cooldownRemainingMs: 0,
                world,
            },
        ],
    };
}

export function selectTower(state: LumbridgeTdState, selectedTower: TowerKind): LumbridgeTdState {
    return {
        ...state,
        selectedTower,
    };
}

export function resetGame(): LumbridgeTdState {
    return createInitialLumbridgeTdState();
}

export function dismissWaveSummary(state: LumbridgeTdState): LumbridgeTdState {
    return {
        ...state,
        showWaveSummary: false,
        waveSummary: null,
    };
}

export function startWaveFromSummary(state: LumbridgeTdState): LumbridgeTdState {
    const dismissedState = dismissWaveSummary(state);
    return startWave(dismissedState);
}

export function selectEnemy(state: LumbridgeTdState, enemy: Enemy): LumbridgeTdState {
    return {
        ...state,
        selectedEnemy: enemy,
        showEnemyInfo: true,
    };
}

export function deselectEnemy(state: LumbridgeTdState): LumbridgeTdState {
    return {
        ...state,
        selectedEnemy: null,
        showEnemyInfo: false,
    };
}

export function tickLumbridgeTd(state: LumbridgeTdState, deltaMs: number): LumbridgeTdState {
    if (state.gameOver) {
        return state;
    }

    let nextState: LumbridgeTdState = {
        ...state,
        enemies: state.enemies.map((enemy) => ({ ...enemy })),
        towers: state.towers.map((tower) => ({ ...tower })),
        projectiles: state.projectiles
            .map((projectile) => ({
                ...projectile,
                elapsedMs: projectile.elapsedMs + deltaMs,
            }))
            .filter((projectile) => projectile.elapsedMs < projectile.durationMs),
    };

    if (nextState.waveInProgress) {
        nextState.nextSpawnInMs -= deltaMs;
        while (nextState.waveSpawned < nextState.waveSpawnCount && nextState.nextSpawnInMs <= 0) {
            const newEnemy = createEnemy(nextState.wave, nextState.waveSpawned);
            nextState.enemies.push(newEnemy);

            // Emit spawn event to create 3D NPC
            const worldPos = samplePathWorldTile(newEnemy.progress);
            emitLumbridgeTdEnemySpawned({
                id: newEnemy.id,
                npcId: newEnemy.archetype.npcId,
                name: newEnemy.archetype.name,
                x: worldPos.x,
                y: worldPos.y,
                level: Math.round(newEnemy.maxHp / 4), // Approximate level from HP
                hp: newEnemy.hp,
                maxHp: newEnemy.maxHp,
            });

            nextState.waveSpawned++;
            nextState.nextSpawnInMs += Math.max(320, 900 - nextState.wave * 35);
        }
    }

    for (const enemy of nextState.enemies) {
        enemy.progress += enemy.speed * (deltaMs / 1000);

        const worldPos = samplePathWorldTile(enemy.progress);
        emitLumbridgeTdEnemyUpdated({
            id: enemy.id,
            x: worldPos.x,
            y: worldPos.y,
            hp: enemy.hp,
            maxHp: enemy.maxHp,
        });
    }

    let leakedDamage = 0;
    const enemiesRemoved: string[] = [];
    nextState.enemies = nextState.enemies.filter((enemy) => {
        if (enemy.progress >= 1) {
            leakedDamage += enemy.damage;
            enemiesRemoved.push(enemy.id);
            emitLumbridgeTdEnemyRemoved(enemy.id);
            return false;
        }
        return true;
    });
    if (leakedDamage > 0) {
        nextState.lives = Math.max(0, nextState.lives - leakedDamage);
        if (nextState.lives === 0) {
            nextState.gameOver = true;
            nextState.waveInProgress = false;
        }
    }

    const pendingGold: number[] = [];

    for (const tower of nextState.towers) {
        tower.cooldownRemainingMs = Math.max(0, tower.cooldownRemainingMs - deltaMs);
        if (tower.cooldownRemainingMs > 0) {
            continue;
        }

        const towerDef = TOWER_DEFS[tower.kind];
        const pad = LUMBRIDGE_PADS.find((candidate) => candidate.id === tower.padId);
        if (!pad) {
            continue;
        }

        const target = getClosestEnemyInRange(nextState.enemies, pad, towerDef.range);
        if (!target) {
            continue;
        }

        target.hp -= towerDef.damage;
        tower.cooldownRemainingMs = towerDef.cooldownMs;
        nextState.projectiles.push({
            id: `${tower.id}-${target.id}-${Math.random().toString(36).slice(2, 8)}`,
            kind: tower.kind,
            from: { x: pad.x, y: pad.y },
            to: samplePath(target.progress),
            elapsedMs: 0,
            durationMs: 180,
            color: towerDef.color,
        });
    }

    let enemiesKilled = 0;
    nextState.enemies = nextState.enemies.filter((enemy) => {
        if (enemy.hp <= 0) {
            pendingGold.push(enemy.reward);
            const drops = generateLoot(enemy.archetype.name);
            nextState.currentWaveLoot.push(...drops);
            enemiesKilled++;
            enemiesRemoved.push(enemy.id);
            emitLumbridgeTdEnemyRemoved(enemy.id);
            return false;
        }
        return true;
    });
    if (pendingGold.length > 0) {
        nextState.gold += pendingGold.reduce((sum, reward) => sum + reward, 0);
    }

    if (
        nextState.waveInProgress &&
        nextState.waveSpawned >= nextState.waveSpawnCount &&
        nextState.enemies.length === 0
    ) {
        const completionBonus = calculateWaveBonus(nextState.wave);
        const lootValue = nextState.currentWaveLoot.reduce((sum, loot) => sum + loot.value, 0);

        nextState.waveSummary = {
            wave: nextState.wave,
            enemiesKilled: nextState.waveSpawnCount,
            goldEarned: pendingGold.reduce((sum, reward) => sum + reward, 0),
            lootCollected: [...nextState.currentWaveLoot],
            completionBonus,
            totalValue: lootValue + completionBonus,
        };

        nextState.gold += completionBonus;
        nextState.waveInProgress = false;
        nextState.nextSpawnInMs = 0;
        nextState.showWaveSummary = true;
        nextState.currentWaveLoot = [];
    }

    if (nextState.selectedEnemy && enemiesRemoved.includes(nextState.selectedEnemy.id)) {
        nextState.selectedEnemy = null;
        nextState.showEnemyInfo = false;
    }

    return nextState;
}

function createEnemy(wave: number, index: number): Enemy {
    const waveArchetypes = getWaveArchetypes(wave);
    const archetype = waveArchetypes[index % waveArchetypes.length];
    const waveScale = 1 + (wave - 1) * 0.22;
    const mixScale = 1 + (index % waveArchetypes.length) * 0.08;

    return {
        id: `enemy-${wave}-${index}`,
        archetype,
        hp: Math.round(archetype.hp * waveScale * mixScale),
        maxHp: Math.round(archetype.hp * waveScale * mixScale),
        progress: 0,
        speed: archetype.speed + (wave - 1) * 0.0015 + (index % waveArchetypes.length) * 0.0005,
        reward: archetype.reward + (wave - 1) * 2 + (index % waveArchetypes.length),
        damage: 1,
    };
}

function getClosestEnemyInRange(
    enemies: Enemy[],
    point: ScreenPoint,
    range: number,
): Enemy | undefined {
    let bestEnemy: Enemy | undefined;
    let bestProgress = -1;

    for (const enemy of enemies) {
        const enemyPoint = samplePath(enemy.progress);
        const distance = Math.hypot(enemyPoint.x - point.x, enemyPoint.y - point.y);
        if (distance > range) {
            continue;
        }
        if (enemy.progress > bestProgress) {
            bestEnemy = enemy;
            bestProgress = enemy.progress;
        }
    }

    return bestEnemy;
}
