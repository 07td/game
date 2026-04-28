import type { MageTowerElement, TowerKind, WorldPoint } from "./lumbridgeTd";

export const LUMBRIDGE_TD_START_WAVE = "lumbridge-td:start-wave";
export const LUMBRIDGE_TD_RESET = "lumbridge-td:reset";
export const LUMBRIDGE_TD_TOWERS_CHANGED = "lumbridge-td:towers-changed";
export const LUMBRIDGE_TD_ENEMY_SPAWNED = "lumbridge-td:enemy-spawned";
export const LUMBRIDGE_TD_ENEMY_UPDATED = "lumbridge-td:enemy-updated";
export const LUMBRIDGE_TD_ENEMY_REMOVED = "lumbridge-td:enemy-removed";
export const LUMBRIDGE_TD_ENEMY_SELECTED = "lumbridge-td:enemy-selected";
export const LUMBRIDGE_TD_PROJECTILE_SPAWNED = "lumbridge-td:projectile-spawned";

export type LumbridgeTdStartWaveDetail = {
    wave: number;
    enemyCount: number;
};

export function emitLumbridgeTdStartWave(detail: LumbridgeTdStartWaveDetail): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_START_WAVE, { detail }));
}

export function emitLumbridgeTdReset(): void {
    window.dispatchEvent(new Event(LUMBRIDGE_TD_RESET));
}

export type LumbridgeTdTowerState = {
    id: string;
    padId: string;
    kind: string;
    level: number;
    rotation: number;
    hp?: number;
    maxHp?: number;
    world: {
        x: number;
        y: number;
        z: number;
    };
}[];

export function emitLumbridgeTdTowersChanged(detail: LumbridgeTdTowerState): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_TOWERS_CHANGED, { detail }));
}

export type LumbridgeTdEnemySpawnDetail = {
    id: string;
    npcId: number;
    name: string;
    x: number;
    y: number;
    level: number;
    hp: number;
    maxHp: number;
    barricadeAttackSeqId?: number;
};

export function emitLumbridgeTdEnemySpawned(detail: LumbridgeTdEnemySpawnDetail): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_ENEMY_SPAWNED, { detail }));
}

export type LumbridgeTdEnemyUpdateDetail = {
    id: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    attackingBarricade?: boolean;
    attackTargetX?: number;
    attackTargetY?: number;
};

export function emitLumbridgeTdEnemyUpdated(detail: LumbridgeTdEnemyUpdateDetail): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_ENEMY_UPDATED, { detail }));
}

export type LumbridgeTdEnemyRemovedDetail = {
    id: string;
    reason?: "leak" | "defeated";
};

export function emitLumbridgeTdEnemyRemoved(detail: LumbridgeTdEnemyRemovedDetail | string): void {
    const normalized = typeof detail === "string" ? { id: detail } : detail;
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_ENEMY_REMOVED, { detail: normalized }));
}

export function emitLumbridgeTdEnemySelected(enemyId: string): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_ENEMY_SELECTED, { detail: { id: enemyId } }));
}

export type LumbridgeTdProjectileSpawnDetail = {
    id: string;
    kind: TowerKind;
    element?: MageTowerElement;
    sourceTowerId: string;
    targetEnemyId: string;
    fromWorld: WorldPoint;
    toWorld: WorldPoint;
    durationMs: number;
    firedAtMs: number;
};

export function emitLumbridgeTdProjectileSpawned(detail: LumbridgeTdProjectileSpawnDetail): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_PROJECTILE_SPAWNED, { detail }));
}
