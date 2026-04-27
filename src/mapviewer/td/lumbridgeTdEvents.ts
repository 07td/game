export const LUMBRIDGE_TD_START_WAVE = "lumbridge-td:start-wave";
export const LUMBRIDGE_TD_RESET = "lumbridge-td:reset";
export const LUMBRIDGE_TD_TOWERS_CHANGED = "lumbridge-td:towers-changed";
export const LUMBRIDGE_TD_ENEMY_SPAWNED = "lumbridge-td:enemy-spawned";
export const LUMBRIDGE_TD_ENEMY_UPDATED = "lumbridge-td:enemy-updated";
export const LUMBRIDGE_TD_ENEMY_REMOVED = "lumbridge-td:enemy-removed";
export const LUMBRIDGE_TD_ENEMY_SELECTED = "lumbridge-td:enemy-selected";

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
    padId: string;
    kind: string;
    rotation: number;
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
};

export function emitLumbridgeTdEnemyUpdated(detail: LumbridgeTdEnemyUpdateDetail): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_ENEMY_UPDATED, { detail }));
}

export function emitLumbridgeTdEnemyRemoved(enemyId: string): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_ENEMY_REMOVED, { detail: { id: enemyId } }));
}

export function emitLumbridgeTdEnemySelected(enemyId: string): void {
    window.dispatchEvent(new CustomEvent(LUMBRIDGE_TD_ENEMY_SELECTED, { detail: { id: enemyId } }));
}
