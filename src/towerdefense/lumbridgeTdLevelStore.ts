import { WaveConfig, WaveEnemyConfig } from "./lumbridgeTd";
import { LumbridgeTdRoutePoint } from "./lumbridgeTdRoute";
import {
    getDefaultLumbridgeTdPads,
    LumbridgeTdPad,
    sanitizeLumbridgeTdPads,
} from "./lumbridgeTdPads";

const LUMBRIDGE_TD_LEVEL_STORE_KEY = "gielinor-td:levels:v1";

export type LumbridgeTdLevelDefinition = {
    route: LumbridgeTdRoutePoint[];
    pads: LumbridgeTdPad[];
    waveConfigs: Record<number, WaveConfig>;
};

export type LumbridgeTdSavedLevel = LumbridgeTdLevelDefinition & {
    id: string;
    name: string;
    updatedAt: number;
};

function getLevelStorage(): Storage | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }

    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

function clampRouteTileValue(value: number): number {
    return Math.max(0, Math.min(63, value | 0));
}

function sanitizeRoute(route: unknown): LumbridgeTdRoutePoint[] {
    if (!Array.isArray(route)) {
        return [];
    }

    return route
        .filter(
            (point): point is LumbridgeTdRoutePoint =>
                point !== null &&
                typeof point === "object" &&
                typeof point.x === "number" &&
                typeof point.y === "number",
        )
        .map((point) => ({
            x: clampRouteTileValue(point.x),
            y: clampRouteTileValue(point.y),
        }));
}

function sanitizePads(pads: unknown): LumbridgeTdPad[] {
    return sanitizeLumbridgeTdPads(pads);
}

function sanitizeWaveEnemyConfig(enemy: unknown): WaveEnemyConfig | undefined {
    if (!enemy || typeof enemy !== "object") {
        return undefined;
    }

    const candidate = enemy as Partial<WaveEnemyConfig>;
    if (typeof candidate.archetypeName !== "string") {
        return undefined;
    }

    return {
        archetypeName: candidate.archetypeName,
        npcId: typeof candidate.npcId === "number" ? candidate.npcId : undefined,
        color: typeof candidate.color === "string" ? candidate.color : undefined,
        outline: typeof candidate.outline === "string" ? candidate.outline : undefined,
        baseHp: typeof candidate.baseHp === "number" ? candidate.baseHp : undefined,
        baseSpeed: typeof candidate.baseSpeed === "number" ? candidate.baseSpeed : undefined,
        baseReward: typeof candidate.baseReward === "number" ? candidate.baseReward : undefined,
        count: typeof candidate.count === "number" ? candidate.count : 1,
        hpMultiplier: typeof candidate.hpMultiplier === "number" ? candidate.hpMultiplier : 1,
        speedMultiplier:
            typeof candidate.speedMultiplier === "number" ? candidate.speedMultiplier : 1,
        rewardMultiplier:
            typeof candidate.rewardMultiplier === "number" ? candidate.rewardMultiplier : 1,
    };
}

function sanitizeWaveConfig(wave: number, config: unknown): WaveConfig | undefined {
    if (!config || typeof config !== "object") {
        return undefined;
    }

    const candidate = config as Partial<WaveConfig>;
    if (!Array.isArray(candidate.enemies)) {
        return undefined;
    }

    const enemies = candidate.enemies
        .map((enemy) => sanitizeWaveEnemyConfig(enemy))
        .filter((enemy): enemy is WaveEnemyConfig => !!enemy);

    return {
        wave,
        spawnIntervalMs:
            typeof candidate.spawnIntervalMs === "number" ? candidate.spawnIntervalMs : 900,
        enemies,
    };
}

function sanitizeWaveConfigs(waveConfigs: unknown): Record<number, WaveConfig> {
    if (!waveConfigs || typeof waveConfigs !== "object") {
        return {};
    }

    const entries = Object.entries(waveConfigs as Record<string, unknown>)
        .map(([key, config]) => {
            const wave = Number(key);
            if (!Number.isFinite(wave) || wave < 1) {
                return undefined;
            }

            const sanitized = sanitizeWaveConfig(Math.round(wave), config);
            if (!sanitized) {
                return undefined;
            }

            return [sanitized.wave, sanitized] as const;
        })
        .filter((entry): entry is readonly [number, WaveConfig] => !!entry);

    return Object.fromEntries(entries) as Record<number, WaveConfig>;
}

function sanitizeSavedLevel(level: unknown): LumbridgeTdSavedLevel | undefined {
    if (!level || typeof level !== "object") {
        return undefined;
    }

    const candidate = level as Partial<LumbridgeTdSavedLevel>;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
        return undefined;
    }

    return {
        id: candidate.id,
        name: candidate.name.trim() || "Untitled Level",
        route: sanitizeRoute(candidate.route),
        pads:
            candidate.pads === undefined
                ? getDefaultLumbridgeTdPads()
                : sanitizePads(candidate.pads),
        waveConfigs: sanitizeWaveConfigs(candidate.waveConfigs),
        updatedAt:
            typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
                ? candidate.updatedAt
                : Date.now(),
    };
}

function readSavedLevels(): LumbridgeTdSavedLevel[] {
    const storage = getLevelStorage();
    if (!storage) {
        return [];
    }

    try {
        const raw = storage.getItem(LUMBRIDGE_TD_LEVEL_STORE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((level) => sanitizeSavedLevel(level))
            .filter((level): level is LumbridgeTdSavedLevel => !!level)
            .sort((left, right) => right.updatedAt - left.updatedAt);
    } catch {
        return [];
    }
}

function writeSavedLevels(levels: readonly LumbridgeTdSavedLevel[]): void {
    const storage = getLevelStorage();
    if (!storage) {
        return;
    }

    try {
        storage.setItem(LUMBRIDGE_TD_LEVEL_STORE_KEY, JSON.stringify(levels));
    } catch {
        // Ignore write failures to keep the editor usable in restricted browsing modes.
    }
}

function generateSavedLevelId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `level-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listLumbridgeTdSavedLevels(): LumbridgeTdSavedLevel[] {
    return readSavedLevels();
}

export function saveLumbridgeTdLevel(
    name: string,
    level: LumbridgeTdLevelDefinition,
    existingId?: string,
): { savedLevel: LumbridgeTdSavedLevel; levels: LumbridgeTdSavedLevel[] } {
    const now = Date.now();
    const savedLevel: LumbridgeTdSavedLevel = {
        id: existingId ?? generateSavedLevelId(),
        name: name.trim() || "Untitled Level",
        route: sanitizeRoute(level.route),
        pads: sanitizePads(level.pads),
        waveConfigs: sanitizeWaveConfigs(level.waveConfigs),
        updatedAt: now,
    };

    const currentLevels = readSavedLevels().filter((levelEntry) => levelEntry.id !== savedLevel.id);
    const levels = [savedLevel, ...currentLevels].sort(
        (left, right) => right.updatedAt - left.updatedAt,
    );
    writeSavedLevels(levels);
    return { savedLevel, levels };
}

export function deleteLumbridgeTdSavedLevel(levelId: string): LumbridgeTdSavedLevel[] {
    const levels = readSavedLevels().filter((level) => level.id !== levelId);
    writeSavedLevels(levels);
    return levels;
}
