import { LUMBRIDGE_TD_ENEMY_ARCHETYPES, LumbridgeTdEnemyArchetype } from "./lumbridgeTdEnemies";
import {
    emitLumbridgeTdEnemyRemoved,
    emitLumbridgeTdEnemySpawned,
    emitLumbridgeTdEnemyUpdated,
    emitLumbridgeTdProjectileSpawned,
} from "./lumbridgeTdEvents";
import { LumbridgeTdPad, LumbridgeTdPadKind, getLumbridgeTdPads } from "./lumbridgeTdPads";
import {
    LUMBRIDGE_TD_MAP_X,
    LUMBRIDGE_TD_MAP_Y,
    getDefaultLumbridgeTdRoute,
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

export type TowerKind = "bolt" | "mage" | "cannon" | "barricade";
export type MageTowerElement = "air" | "water" | "earth" | "fire";

export type TowerDefinition = {
    kind: TowerKind;
    padKind: LumbridgeTdPadKind;
    name: string;
    cost: number;
    damage: number;
    cooldownMs: number;
    range: number;
    color: string;
    upgradable?: boolean;
    maxHp?: number;
};

export type TowerPad = LumbridgeTdPad;

export type Tower = {
    id: string;
    padId: string;
    kind: TowerKind;
    level: number;
    rotation: number;
    cooldownRemainingMs: number;
    world: WorldPoint;
    hp?: number;
    maxHp?: number;
};

export type TowerStats = {
    damage: number;
    cooldownMs: number;
    range: number;
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
    element?: MageTowerElement;
    sourceTowerId: string;
    targetEnemyId: string;
    damage: number;
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

export type WaveEnemyConfig = {
    archetypeName: string;
    npcId?: number;
    color?: string;
    outline?: string;
    baseHp?: number;
    baseSpeed?: number;
    baseReward?: number;
    count: number;
    hpMultiplier: number;
    speedMultiplier: number;
    rewardMultiplier: number;
};

export type WaveConfig = {
    wave: number;
    spawnIntervalMs: number;
    enemies: WaveEnemyConfig[];
};

const CANNON_TOWER_LOC_ID = 11868;

const MAGE_TOWER_LEVEL_NAMES = [
    "Obelisk of Air",
    "Obelisk of Water",
    "Obelisk of Earth",
    "Obelisk of Fire",
] as const;

const MAGE_TOWER_LEVEL_ELEMENTS: MageTowerElement[] = ["air", "water", "earth", "fire"];
const MAGE_TOWER_LEVEL_LOC_IDS = [2152, 2151, 2150, 2153] as const;

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
    selectedTowerId: string | null;
    showTowerInfo: boolean;
    waveConfigs: Record<number, WaveConfig>;
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

export function createDefaultWaveConfig(wave: number): WaveConfig {
    const waveArchetypes = getWaveArchetypes(wave);
    const totalCount = 5 + wave * 2;
    const enemies = waveArchetypes.map((archetype) => ({
        ...createWaveEnemyConfigFromArchetype(archetype),
        count: 0,
    }));

    for (let index = 0; index < totalCount; index++) {
        enemies[index % enemies.length].count++;
    }

    return {
        wave,
        spawnIntervalMs: Math.max(320, 900 - wave * 35),
        enemies,
    };
}

export function getWaveConfig(state: LumbridgeTdState, wave: number): WaveConfig {
    return state.waveConfigs[wave] ?? createDefaultWaveConfig(wave);
}

export function getWaveEnemyCount(config: WaveConfig): number {
    return config.enemies.reduce((sum, enemy) => sum + enemy.count, 0);
}

export function updateWaveConfig(
    state: LumbridgeTdState,
    wave: number,
    config: WaveConfig,
): LumbridgeTdState {
    const sanitizedConfig = sanitizeWaveConfig({ ...config, wave });
    return {
        ...state,
        waveConfigs: {
            ...state.waveConfigs,
            [wave]: sanitizedConfig,
        },
    };
}

export function resetWaveConfig(state: LumbridgeTdState, wave: number): LumbridgeTdState {
    const nextWaveConfigs = { ...state.waveConfigs };
    delete nextWaveConfigs[wave];
    return {
        ...state,
        waveConfigs: nextWaveConfigs,
    };
}

function sanitizeWaveConfig(config: WaveConfig): WaveConfig {
    const seen = new Set<string>();
    const enemies = config.enemies
        .map((enemy) => normalizeWaveEnemyConfig(enemy))
        .filter((enemy): enemy is WaveEnemyConfig => !!enemy)
        .filter((enemy) => {
            const key = getWaveEnemyKey(enemy);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });

    return {
        wave: Math.max(1, Math.round(config.wave)),
        spawnIntervalMs: Math.max(120, Math.min(3000, Math.round(config.spawnIntervalMs))),
        enemies,
    };
}

function clampMultiplier(value: number): number {
    return Number(Math.max(0.1, Math.min(10, value || 1)).toFixed(2));
}

function clampBaseSpeed(value: number): number {
    return Number(Math.max(0.01, Math.min(0.25, value || 0.05)).toFixed(3));
}

function clampPositiveInt(value: number, fallback: number, max: number): number {
    const numeric = Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.max(1, Math.min(max, numeric));
}

function getWaveEnemyKey(enemy: Pick<WaveEnemyConfig, "npcId" | "archetypeName">): string {
    return enemy.npcId ? `npc:${enemy.npcId}` : `name:${enemy.archetypeName.toLowerCase()}`;
}

function getKnownEnemyArchetype(
    enemy: Pick<WaveEnemyConfig, "npcId" | "archetypeName">,
): EnemyArchetype | undefined {
    return LUMBRIDGE_TD_ENEMY_ARCHETYPES.find(
        (archetype) =>
            (enemy.npcId !== undefined && archetype.npcId === enemy.npcId) ||
            archetype.name === enemy.archetypeName,
    );
}

function hashString(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
        hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}

function toHexChannel(value: number): string {
    return Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0");
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
    const h = ((hue % 360) + 360) % 360;
    const s = Math.max(0, Math.min(1, saturation));
    const l = Math.max(0, Math.min(1, lightness));
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const segment = h / 60;
    const second = chroma * (1 - Math.abs((segment % 2) - 1));
    let red = 0;
    let green = 0;
    let blue = 0;

    if (segment >= 0 && segment < 1) {
        red = chroma;
        green = second;
    } else if (segment < 2) {
        red = second;
        green = chroma;
    } else if (segment < 3) {
        green = chroma;
        blue = second;
    } else if (segment < 4) {
        green = second;
        blue = chroma;
    } else if (segment < 5) {
        red = second;
        blue = chroma;
    } else {
        red = chroma;
        blue = second;
    }

    const match = l - chroma / 2;
    return `#${toHexChannel((red + match) * 255)}${toHexChannel(
        (green + match) * 255,
    )}${toHexChannel((blue + match) * 255)}`;
}

function darkenHex(hex: string, amount: number): string {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6) {
        return "#333333";
    }

    const scale = Math.max(0, Math.min(1, 1 - amount));
    const red = parseInt(normalized.slice(0, 2), 16) * scale;
    const green = parseInt(normalized.slice(2, 4), 16) * scale;
    const blue = parseInt(normalized.slice(4, 6), 16) * scale;
    return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function getGeneratedEnemyColor(npcId: number, name: string): string {
    const hash = hashString(`${npcId}:${name}`);
    return hslToHex(hash % 360, 0.5, 0.55);
}

function estimateBaseHp(level: number): number {
    return clampPositiveInt(Math.max(30, level * 6), 90, 5000);
}

function estimateBaseSpeed(level: number): number {
    return clampBaseSpeed(0.074 - Math.min(100, Math.max(1, level)) * 0.00035);
}

function estimateBaseReward(level: number): number {
    return clampPositiveInt(Math.max(5, level), 15, 5000);
}

function normalizeWaveEnemyConfig(enemy: WaveEnemyConfig): WaveEnemyConfig | undefined {
    const known = getKnownEnemyArchetype(enemy);
    const npcId = clampPositiveInt(enemy.npcId ?? known?.npcId ?? 1, 1, 100000);
    const archetypeName = (enemy.archetypeName || known?.name || `NPC ${npcId}`).trim();
    const color = enemy.color ?? known?.color ?? getGeneratedEnemyColor(npcId, archetypeName);
    const outline = enemy.outline ?? known?.outline ?? darkenHex(color, 0.5);

    if (!archetypeName) {
        return undefined;
    }

    return {
        archetypeName,
        npcId,
        color,
        outline,
        baseHp: clampPositiveInt(enemy.baseHp ?? known?.hp ?? 100, 100, 5000),
        baseSpeed: clampBaseSpeed(enemy.baseSpeed ?? known?.speed ?? 0.05),
        baseReward: clampPositiveInt(enemy.baseReward ?? known?.reward ?? 15, 15, 5000),
        count: Math.max(0, Math.min(99, Math.round(enemy.count))),
        hpMultiplier: clampMultiplier(enemy.hpMultiplier),
        speedMultiplier: clampMultiplier(enemy.speedMultiplier),
        rewardMultiplier: clampMultiplier(enemy.rewardMultiplier),
    };
}

export function createWaveEnemyConfigFromArchetype(archetype: EnemyArchetype): WaveEnemyConfig {
    return {
        archetypeName: archetype.name,
        npcId: archetype.npcId,
        color: archetype.color,
        outline: archetype.outline,
        baseHp: archetype.hp,
        baseSpeed: archetype.speed,
        baseReward: archetype.reward,
        count: 1,
        hpMultiplier: 1,
        speedMultiplier: 1,
        rewardMultiplier: 1,
    };
}

export function createWaveEnemyConfigFromNpc(
    npcId: number,
    name: string,
    level: number = 1,
): WaveEnemyConfig {
    const known = getKnownEnemyArchetype({ npcId, archetypeName: name });
    if (known) {
        return createWaveEnemyConfigFromArchetype(known);
    }

    const color = getGeneratedEnemyColor(npcId, name);
    return {
        archetypeName: name.trim() || `NPC ${npcId}`,
        npcId,
        color,
        outline: darkenHex(color, 0.5),
        baseHp: estimateBaseHp(level),
        baseSpeed: estimateBaseSpeed(level),
        baseReward: estimateBaseReward(level),
        count: 1,
        hpMultiplier: 1,
        speedMultiplier: 1,
        rewardMultiplier: 1,
    };
}

export function getWaveEnemyArchetype(enemy: WaveEnemyConfig): EnemyArchetype {
    const normalized = normalizeWaveEnemyConfig(enemy);
    if (!normalized) {
        return LUMBRIDGE_TD_ENEMY_ARCHETYPES[0];
    }

    return {
        name: normalized.archetypeName,
        npcId: normalized.npcId ?? LUMBRIDGE_TD_ENEMY_ARCHETYPES[0].npcId,
        color: normalized.color ?? LUMBRIDGE_TD_ENEMY_ARCHETYPES[0].color,
        outline: normalized.outline ?? LUMBRIDGE_TD_ENEMY_ARCHETYPES[0].outline,
        hp: normalized.baseHp ?? LUMBRIDGE_TD_ENEMY_ARCHETYPES[0].hp,
        speed: normalized.baseSpeed ?? LUMBRIDGE_TD_ENEMY_ARCHETYPES[0].speed,
        reward: normalized.baseReward ?? LUMBRIDGE_TD_ENEMY_ARCHETYPES[0].reward,
    };
}

export const TOWER_DEFS: Record<TowerKind, TowerDefinition> = {
    bolt: {
        kind: "bolt",
        padKind: "tower",
        name: "Ranged Tower",
        cost: 30,
        damage: 18,
        cooldownMs: 650,
        range: 0.11,
        color: "#f0e27a",
    },
    mage: {
        kind: "mage",
        padKind: "tower",
        name: MAGE_TOWER_LEVEL_NAMES[0],
        cost: 55,
        damage: 38,
        cooldownMs: 1200,
        range: 0.16,
        color: "#58e1ff",
    },
    cannon: {
        kind: "cannon",
        padKind: "tower",
        name: "Dwarf Multicannon",
        cost: 80,
        damage: 62,
        cooldownMs: 1800,
        range: 0.13,
        color: "#ff8f52",
    },
    barricade: {
        kind: "barricade",
        padKind: "barricade",
        name: "Barricade",
        cost: 18,
        damage: 0,
        cooldownMs: 0,
        range: 0,
        color: "#b8924f",
        upgradable: false,
        maxHp: 240,
    },
};

export const TOWER_MAX_LEVEL = 4;

const BARRICADE_STOP_DISTANCE_TILES = 0.7;
const BARRICADE_DAMAGE_PER_ENEMY_DAMAGE = 12;

export function isBarricadeTowerKind(kind: TowerKind): boolean {
    return kind === "barricade";
}

export function getTowerPadKindForTowerKind(kind: TowerKind): LumbridgeTdPadKind {
    return isBarricadeTowerKind(kind) ? "barricade" : "tower";
}

export function isTowerPadCompatible(pad: TowerPad, towerKind: TowerKind): boolean {
    return pad.kind === getTowerPadKindForTowerKind(towerKind);
}

export function getTowerName(kind: TowerKind, level = 1): string {
    if (kind !== "mage") {
        return TOWER_DEFS[kind].name;
    }

    const normalizedLevel = Math.max(1, Math.min(level, MAGE_TOWER_LEVEL_NAMES.length));
    return MAGE_TOWER_LEVEL_NAMES[normalizedLevel - 1];
}

export function getMageTowerElement(level = 1): MageTowerElement {
    const normalizedLevel = Math.max(1, Math.min(level, MAGE_TOWER_LEVEL_ELEMENTS.length));
    return MAGE_TOWER_LEVEL_ELEMENTS[normalizedLevel - 1];
}

export function getTowerLocId(kind: TowerKind, level = 1): number | undefined {
    if (kind === "bolt") {
        return 1939;
    }
    if (kind === "cannon") {
        return CANNON_TOWER_LOC_ID;
    }
    if (kind === "mage") {
        const normalizedLevel = Math.max(1, Math.min(level, MAGE_TOWER_LEVEL_LOC_IDS.length));
        return MAGE_TOWER_LEVEL_LOC_IDS[normalizedLevel - 1];
    }
    return undefined;
}

export function getTowerStats(tower: Tower): TowerStats {
    const def = TOWER_DEFS[tower.kind];
    if (isBarricadeTowerKind(tower.kind)) {
        return {
            damage: 0,
            cooldownMs: 0,
            range: 0,
        };
    }
    const upgradeLevel = Math.max(0, tower.level - 1);
    return {
        damage: Math.round(def.damage * (1 + upgradeLevel * 0.38)),
        cooldownMs: Math.round(def.cooldownMs * Math.pow(0.86, upgradeLevel)),
        range: Number((def.range + upgradeLevel * 0.018).toFixed(3)),
    };
}

export function getTowerUpgradeCost(tower: Tower): number | undefined {
    if (tower.level >= TOWER_MAX_LEVEL || TOWER_DEFS[tower.kind].upgradable === false) {
        return undefined;
    }
    const def = TOWER_DEFS[tower.kind];
    return Math.round(def.cost * (0.75 + tower.level * 0.45));
}

type PathSegment = {
    from: ScreenPoint;
    to: ScreenPoint;
    length: number;
    start: number;
    end: number;
};

type PathSegments = {
    totalLength: number;
    segments: PathSegment[];
};

function getRoutePathPoints(): ScreenPoint[] {
    const route = getLumbridgeTdRoute();
    return (route.length >= 2 ? route : getDefaultLumbridgeTdRoute()).map((point) =>
        localTileToRouteEditorPoint(point),
    );
}

function buildSegments(path: ScreenPoint[]): PathSegments {
    const segments: PathSegment[] = [];
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
    const path = getRoutePathPoints();
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

function projectPointOntoPathProgress(point: ScreenPoint, pathSegments: PathSegments): number {
    if (pathSegments.totalLength <= 0 || pathSegments.segments.length === 0) {
        return 0;
    }

    let closestDistanceSq = Number.POSITIVE_INFINITY;
    let closestPathDistance = 0;

    for (const segment of pathSegments.segments) {
        const dx = segment.to.x - segment.from.x;
        const dy = segment.to.y - segment.from.y;
        const lengthSq = dx * dx + dy * dy;
        const t =
            lengthSq <= 1e-9
                ? 0
                : Math.max(
                      0,
                      Math.min(
                          1,
                          ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) /
                              lengthSq,
                      ),
                  );
        const projectedX = segment.from.x + dx * t;
        const projectedY = segment.from.y + dy * t;
        const distanceSq = (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2;
        if (distanceSq < closestDistanceSq) {
            closestDistanceSq = distanceSq;
            closestPathDistance = segment.start + segment.length * t;
        }
    }

    return closestPathDistance / pathSegments.totalLength;
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

function getTowerProjectileSourceWorld(tower: Tower): WorldPoint {
    const forwardDistance = tower.kind === "cannon" ? 0.16 : 0.3;
    const rotation = ((tower.rotation % 4) + 4) % 4;
    const offsets = [
        { x: 0, z: -forwardDistance },
        { x: forwardDistance, z: 0 },
        { x: 0, z: forwardDistance },
        { x: -forwardDistance, z: 0 },
    ];
    const offset = offsets[rotation] ?? offsets[0];
    const heightLift = tower.kind === "mage" ? 0.94 : tower.kind === "cannon" ? 0.56 : 0.58;

    return {
        x: tower.world.x + offset.x,
        y: tower.world.y - heightLift,
        z: tower.world.z + offset.z,
    };
}

function getBarricadeMaxHp(tower: Pick<Tower, "kind">): number {
    if (!isBarricadeTowerKind(tower.kind)) {
        return 0;
    }
    return TOWER_DEFS[tower.kind].maxHp ?? 0;
}

function getProjectileDurationMs(kind: TowerKind): number {
    switch (kind) {
        case "bolt":
            return 720;
        case "mage":
            return 1280;
        case "cannon":
            return 1880;
        case "barricade":
            return 0;
    }
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
        selectedTowerId: null,
        showTowerInfo: false,
        waveConfigs: {},
    };
}

export function startWave(state: LumbridgeTdState): LumbridgeTdState {
    if (state.waveInProgress || state.gameOver) {
        return state;
    }

    const nextWave = state.wave + 1;
    const waveConfig = getWaveConfig(state, nextWave);
    return {
        ...state,
        wave: nextWave,
        waveInProgress: true,
        waveSpawnCount: getWaveEnemyCount(waveConfig),
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

    const pad = getLumbridgeTdPads().find((candidate) => candidate.id === padId);
    if (!pad || !isTowerPadCompatible(pad, state.selectedTower)) {
        return state;
    }

    const def = TOWER_DEFS[state.selectedTower];
    if (state.gold < def.cost) {
        return state;
    }

    const barricadeHp = isBarricadeTowerKind(state.selectedTower)
        ? getBarricadeMaxHp({ kind: state.selectedTower })
        : undefined;

    return {
        ...state,
        gold: state.gold - def.cost,
        towers: [
            ...state.towers,
            {
                id: `${padId}-${state.selectedTower}`,
                padId,
                kind: state.selectedTower,
                level: 1,
                rotation: ((rotation % 4) + 4) % 4,
                cooldownRemainingMs: 0,
                world,
                hp: barricadeHp,
                maxHp: barricadeHp,
            },
        ],
        selectedTowerId: `${padId}-${state.selectedTower}`,
        showTowerInfo: true,
        selectedEnemy: null,
        showEnemyInfo: false,
    };
}

export function selectTower(state: LumbridgeTdState, selectedTower: TowerKind): LumbridgeTdState {
    return {
        ...state,
        selectedTower,
    };
}

export function selectPlacedTower(state: LumbridgeTdState, towerId: string): LumbridgeTdState {
    if (!state.towers.some((tower) => tower.id === towerId)) {
        return state;
    }
    return {
        ...state,
        selectedTowerId: towerId,
        showTowerInfo: true,
        selectedEnemy: null,
        showEnemyInfo: false,
    };
}

export function deselectTower(state: LumbridgeTdState): LumbridgeTdState {
    return {
        ...state,
        selectedTowerId: null,
        showTowerInfo: false,
    };
}

export function upgradeTower(state: LumbridgeTdState, towerId: string): LumbridgeTdState {
    if (state.gameOver) {
        return state;
    }

    const tower = state.towers.find((candidate) => candidate.id === towerId);
    if (!tower) {
        return state;
    }

    const upgradeCost = getTowerUpgradeCost(tower);
    if (upgradeCost === undefined || state.gold < upgradeCost) {
        return state;
    }

    return {
        ...state,
        gold: state.gold - upgradeCost,
        towers: state.towers.map((candidate) =>
            candidate.id === towerId ? { ...candidate, level: candidate.level + 1 } : candidate,
        ),
        selectedTowerId: towerId,
        showTowerInfo: true,
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
        selectedTowerId: null,
        showTowerInfo: false,
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

    const impactedProjectiles: Projectile[] = [];
    const activeProjectiles = state.projectiles
        .map((projectile) => ({
            ...projectile,
            elapsedMs: projectile.elapsedMs + deltaMs,
        }))
        .filter((projectile) => {
            if (projectile.elapsedMs >= projectile.durationMs) {
                impactedProjectiles.push(projectile);
                return false;
            }
            return true;
        });

    let nextState: LumbridgeTdState = {
        ...state,
        enemies: state.enemies.map((enemy) => ({ ...enemy })),
        towers: state.towers.map((tower) => ({ ...tower })),
        projectiles: activeProjectiles,
    };
    const padsById = new Map(getLumbridgeTdPads().map((pad) => [pad.id, pad] as const));

    if (nextState.waveInProgress) {
        nextState.nextSpawnInMs -= deltaMs;
        while (nextState.waveSpawned < nextState.waveSpawnCount && nextState.nextSpawnInMs <= 0) {
            const newEnemy = createEnemy(nextState, nextState.wave, nextState.waveSpawned);
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
                barricadeAttackSeqId: newEnemy.archetype.barricadeAttackSeqId,
            });

            nextState.waveSpawned++;
            nextState.nextSpawnInMs += getWaveConfig(nextState, nextState.wave).spawnIntervalMs;
        }
    }

    const pathSegments = buildSegments(getRoutePathPoints());
    const barricadeStopOffset =
        pathSegments.totalLength <= 0
            ? 0
            : BARRICADE_STOP_DISTANCE_TILES / 64 / pathSegments.totalLength;
    const activeBarricades = nextState.towers
        .filter(
            (tower): tower is Tower & { hp: number; maxHp: number } =>
                isBarricadeTowerKind(tower.kind) &&
                typeof tower.hp === "number" &&
                tower.hp > 0 &&
                typeof tower.maxHp === "number" &&
                tower.maxHp > 0,
        )
        .map((tower) => {
            const pad = padsById.get(tower.padId);
            if (!pad) {
                return undefined;
            }
            const routeProgress = projectPointOntoPathProgress(
                localTileToRouteEditorPoint({ x: pad.tileX, y: pad.tileY }),
                pathSegments,
            );
            return {
                towerId: tower.id,
                routeProgress,
                stopProgress: Math.max(0, routeProgress - barricadeStopOffset),
            };
        })
        .filter(
            (
                barricade,
            ): barricade is { towerId: string; routeProgress: number; stopProgress: number } =>
                !!barricade,
        )
        .sort((left, right) => left.routeProgress - right.routeProgress);
    const barricadeDamageByTowerId = new Map<string, number>();
    const blockedEnemiesById = new Map<string, Tower>();

    for (const enemy of nextState.enemies) {
        const progressDelta = enemy.speed * (deltaMs / 1000);
        if (progressDelta <= 0) {
            continue;
        }

        const attemptedProgress = enemy.progress + progressDelta;
        const blockingBarricade = activeBarricades.find(
            (barricade) =>
                barricade.routeProgress > enemy.progress + 1e-6 &&
                attemptedProgress >= barricade.stopProgress - 1e-6,
        );
        if (!blockingBarricade) {
            enemy.progress = attemptedProgress;
            continue;
        }

        enemy.progress = Math.min(attemptedProgress, blockingBarricade.stopProgress);
        if (attemptedProgress >= blockingBarricade.stopProgress - 1e-6) {
            const blockingTower = nextState.towers.find(
                (tower) => tower.id === blockingBarricade.towerId,
            );
            if (blockingTower) {
                blockedEnemiesById.set(enemy.id, blockingTower);
            }
            barricadeDamageByTowerId.set(
                blockingBarricade.towerId,
                (barricadeDamageByTowerId.get(blockingBarricade.towerId) ?? 0) +
                    Math.max(1, enemy.damage * BARRICADE_DAMAGE_PER_ENEMY_DAMAGE) *
                        (deltaMs / 1000),
            );
        }
    }

    let leakedDamage = 0;
    const enemiesRemoved: string[] = [];
    nextState.enemies = nextState.enemies.filter((enemy) => {
        if (enemy.progress >= 1) {
            leakedDamage += enemy.damage;
            enemiesRemoved.push(enemy.id);
            emitLumbridgeTdEnemyRemoved({ id: enemy.id, reason: "leak" });
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

    if (impactedProjectiles.length > 0 && nextState.enemies.length > 0) {
        const enemiesById = new Map(nextState.enemies.map((enemy) => [enemy.id, enemy] as const));
        for (const projectile of impactedProjectiles) {
            const target = enemiesById.get(projectile.targetEnemyId);
            if (!target) {
                continue;
            }
            target.hp -= projectile.damage;
        }
    }

    const destroyedTowerIds: string[] = [];
    if (barricadeDamageByTowerId.size > 0) {
        nextState.towers = nextState.towers.flatMap((tower) => {
            if (!isBarricadeTowerKind(tower.kind)) {
                return [tower];
            }

            const damage = barricadeDamageByTowerId.get(tower.id);
            if (damage === undefined) {
                return [tower];
            }

            const remainingHp = Math.max(0, (tower.hp ?? getBarricadeMaxHp(tower)) - damage);
            if (remainingHp <= 0) {
                destroyedTowerIds.push(tower.id);
                return [];
            }

            return [
                {
                    ...tower,
                    hp: remainingHp,
                },
            ];
        });
    }

    const pendingGold: number[] = [];

    for (const tower of nextState.towers) {
        if (isBarricadeTowerKind(tower.kind)) {
            continue;
        }
        tower.cooldownRemainingMs = Math.max(0, tower.cooldownRemainingMs - deltaMs);
        const pad = padsById.get(tower.padId);
        if (!pad) {
            continue;
        }

        const towerDef = TOWER_DEFS[tower.kind];
        const towerStats = getTowerStats(tower);
        const target = getClosestEnemyInRange(nextState.enemies, pad, towerStats.range);
        const targetWorld = target ? samplePathWorldTile(target.progress) : undefined;
        if (tower.cooldownRemainingMs > 0) {
            continue;
        }
        if (!target) {
            continue;
        }

        tower.cooldownRemainingMs = towerStats.cooldownMs;
        const projectileId = `${tower.id}-${target.id}-${Math.random().toString(36).slice(2, 8)}`;
        const projectileDurationMs = getProjectileDurationMs(tower.kind);
        const projectileElement =
            tower.kind === "mage" ? getMageTowerElement(tower.level) : undefined;
        emitLumbridgeTdProjectileSpawned({
            id: projectileId,
            kind: tower.kind,
            element: projectileElement,
            sourceTowerId: tower.id,
            targetEnemyId: target.id,
            fromWorld: getTowerProjectileSourceWorld(tower),
            toWorld: {
                x: targetWorld?.x ?? tower.world.x,
                y: 0,
                z: targetWorld?.y ?? tower.world.z,
            },
            durationMs: projectileDurationMs,
            firedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
        });
        nextState.projectiles.push({
            id: projectileId,
            kind: tower.kind,
            element: projectileElement,
            sourceTowerId: tower.id,
            targetEnemyId: target.id,
            damage: towerStats.damage,
            from: { x: pad.x, y: pad.y },
            to: samplePath(target.progress),
            elapsedMs: 0,
            durationMs: projectileDurationMs,
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
            emitLumbridgeTdEnemyRemoved({ id: enemy.id, reason: "defeated" });
            return false;
        }
        return true;
    });
    if (pendingGold.length > 0) {
        nextState.gold += pendingGold.reduce((sum, reward) => sum + reward, 0);
    }

    for (const enemy of nextState.enemies) {
        const worldPos = samplePathWorldTile(enemy.progress);
        const blockingBarricade = blockedEnemiesById.get(enemy.id);
        emitLumbridgeTdEnemyUpdated({
            id: enemy.id,
            x: worldPos.x,
            y: worldPos.y,
            hp: enemy.hp,
            maxHp: enemy.maxHp,
            attackingBarricade: !!blockingBarricade,
            attackTargetX: blockingBarricade?.world.x,
            attackTargetY: blockingBarricade?.world.z,
        });
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

    if (nextState.selectedTowerId && destroyedTowerIds.includes(nextState.selectedTowerId)) {
        nextState.selectedTowerId = null;
        nextState.showTowerInfo = false;
    }

    if (nextState.selectedEnemy && enemiesRemoved.includes(nextState.selectedEnemy.id)) {
        nextState.selectedEnemy = null;
        nextState.showEnemyInfo = false;
    }

    return nextState;
}

function createEnemy(state: LumbridgeTdState, wave: number, index: number): Enemy {
    const waveEnemy = getWaveEnemyEntry(getWaveConfig(state, wave), index);
    const archetype = getWaveEnemyArchetype(waveEnemy);
    const waveScale = 1 + (wave - 1) * 0.22;
    const mixScale = 1 + (index % Math.max(1, getWaveConfig(state, wave).enemies.length)) * 0.08;
    const hp = Math.round(archetype.hp * waveScale * mixScale * waveEnemy.hpMultiplier);

    return {
        id: `enemy-${wave}-${index}`,
        archetype,
        hp,
        maxHp: hp,
        progress: 0,
        speed:
            (archetype.speed + (wave - 1) * 0.0015 + (index % 4) * 0.0005) *
            waveEnemy.speedMultiplier,
        reward: Math.round(
            (archetype.reward + (wave - 1) * 2 + (index % 4)) * waveEnemy.rewardMultiplier,
        ),
        damage: 1,
    };
}

function getWaveEnemyEntry(config: WaveConfig, index: number): WaveEnemyConfig {
    let cursor = 0;
    for (const enemy of config.enemies) {
        cursor += enemy.count;
        if (index < cursor) {
            return enemy;
        }
    }
    return (
        config.enemies[0] ?? createWaveEnemyConfigFromArchetype(LUMBRIDGE_TD_ENEMY_ARCHETYPES[0])
    );
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
