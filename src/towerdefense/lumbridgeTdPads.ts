export type LumbridgeTdPadKind = "tower" | "barricade";

export type LumbridgeTdPad = {
    id: string;
    tileX: number;
    tileY: number;
    x: number;
    y: number;
    kind: LumbridgeTdPadKind;
};

export const LUMBRIDGE_TD_PADS_CHANGED = "lumbridge-td:pads-changed";
const LUMBRIDGE_TD_PADS_STORAGE_KEY = "gielinor-td:lumbridge-pads:v1";

const DEFAULT_LUMBRIDGE_TD_PADS: LumbridgeTdPad[] = [
    { id: "gate-west", tileX: 31, tileY: 10, x: 31.5 / 64, y: 1 - 10.5 / 64, kind: "tower" },
    { id: "fountain", tileX: 30, tileY: 16, x: 30.5 / 64, y: 1 - 16.5 / 64, kind: "tower" },
    {
        id: "courtyard-east",
        tileX: 35,
        tileY: 22,
        x: 35.5 / 64,
        y: 1 - 22.5 / 64,
        kind: "tower",
    },
    {
        id: "bridge-west",
        tileX: 44,
        tileY: 24,
        x: 44.5 / 64,
        y: 1 - 24.5 / 64,
        kind: "tower",
    },
    { id: "bridge-east", tileX: 52, tileY: 28, x: 52.5 / 64, y: 1 - 28.5 / 64, kind: "tower" },
    { id: "far-road", tileX: 55, tileY: 35, x: 58.5 / 64, y: 1 - 35.5 / 64, kind: "tower" },
    {
        id: "south-road-barricade",
        tileX: 55,
        tileY: 30,
        x: 55.5 / 64,
        y: 1 - 30.5 / 64,
        kind: "barricade",
    },
    {
        id: "bridge-barricade",
        tileX: 44,
        tileY: 23,
        x: 44.5 / 64,
        y: 1 - 23.5 / 64,
        kind: "barricade",
    },
    {
        id: "gate-barricade",
        tileX: 31,
        tileY: 12,
        x: 31.5 / 64,
        y: 1 - 12.5 / 64,
        kind: "barricade",
    },
];

function clampTileValue(value: number): number {
    return Math.max(0, Math.min(63, value | 0));
}

function clampNormalized(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function getPadMapX(tileX: number): number {
    return (tileX + 0.5) / 64;
}

function getPadMapY(tileY: number): number {
    return 1 - (tileY + 0.5) / 64;
}

function getPadStorage(): Storage | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }

    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

export function createLumbridgeTdPad(
    id: string,
    tileX: number,
    tileY: number,
    overrides?: Partial<Pick<LumbridgeTdPad, "x" | "y" | "kind">>,
): LumbridgeTdPad {
    const clampedTileX = clampTileValue(tileX);
    const clampedTileY = clampTileValue(tileY);

    return {
        id: id.trim() || "pad",
        tileX: clampedTileX,
        tileY: clampedTileY,
        x:
            typeof overrides?.x === "number"
                ? clampNormalized(overrides.x)
                : getPadMapX(clampedTileX),
        y:
            typeof overrides?.y === "number"
                ? clampNormalized(overrides.y)
                : getPadMapY(clampedTileY),
        kind: overrides?.kind === "barricade" ? "barricade" : "tower",
    };
}

export function sanitizeLumbridgeTdPad(pad: unknown): LumbridgeTdPad | undefined {
    if (!pad || typeof pad !== "object") {
        return undefined;
    }

    const candidate = pad as Partial<LumbridgeTdPad>;
    if (
        typeof candidate.id !== "string" ||
        typeof candidate.tileX !== "number" ||
        typeof candidate.tileY !== "number"
    ) {
        return undefined;
    }

    return createLumbridgeTdPad(candidate.id, candidate.tileX, candidate.tileY, {
        x: typeof candidate.x === "number" ? candidate.x : undefined,
        y: typeof candidate.y === "number" ? candidate.y : undefined,
        kind: candidate.kind === "barricade" ? "barricade" : "tower",
    });
}

export function sanitizeLumbridgeTdPads(pads: unknown): LumbridgeTdPad[] {
    if (!Array.isArray(pads)) {
        return [];
    }

    return pads
        .map((pad) => sanitizeLumbridgeTdPad(pad))
        .filter((pad): pad is LumbridgeTdPad => !!pad);
}

function loadStoredLumbridgeTdPads(): LumbridgeTdPad[] {
    const storage = getPadStorage();
    if (!storage) {
        return getDefaultLumbridgeTdPads();
    }

    try {
        const stored = storage.getItem(LUMBRIDGE_TD_PADS_STORAGE_KEY);
        if (!stored) {
            return getDefaultLumbridgeTdPads();
        }

        const parsed = JSON.parse(stored);
        return sanitizeLumbridgeTdPads(parsed);
    } catch {
        return getDefaultLumbridgeTdPads();
    }
}

function persistLumbridgeTdPads(pads: readonly LumbridgeTdPad[]): void {
    const storage = getPadStorage();
    if (!storage) {
        return;
    }

    try {
        storage.setItem(LUMBRIDGE_TD_PADS_STORAGE_KEY, JSON.stringify(pads));
    } catch {
        // Ignore persistence failures to keep the editor usable in restricted browsing modes.
    }
}

let lumbridgeTdPads: LumbridgeTdPad[] = loadStoredLumbridgeTdPads();

export function getDefaultLumbridgeTdPads(): LumbridgeTdPad[] {
    return DEFAULT_LUMBRIDGE_TD_PADS.map((pad) => ({ ...pad }));
}

export function getLumbridgeTdPads(): LumbridgeTdPad[] {
    return lumbridgeTdPads.map((pad) => ({ ...pad }));
}

export function setLumbridgeTdPads(pads: readonly LumbridgeTdPad[]): void {
    lumbridgeTdPads = sanitizeLumbridgeTdPads(pads);
    persistLumbridgeTdPads(lumbridgeTdPads);
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(
        new CustomEvent<LumbridgeTdPad[]>(LUMBRIDGE_TD_PADS_CHANGED, {
            detail: getLumbridgeTdPads(),
        }),
    );
}

export function resetLumbridgeTdPads(): void {
    setLumbridgeTdPads(getDefaultLumbridgeTdPads());
}
