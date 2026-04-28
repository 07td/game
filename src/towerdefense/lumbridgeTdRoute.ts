export type LumbridgeTdRoutePoint = {
    x: number;
    y: number;
};

export const LUMBRIDGE_TD_MAP_X = 50;
export const LUMBRIDGE_TD_MAP_Y = 50;
export const LUMBRIDGE_TD_ROUTE_CHANGED = "lumbridge-td:route-changed";
const LUMBRIDGE_TD_ROUTE_STORAGE_KEY = "gielinor-td:lumbridge-route:v1";

const DEFAULT_LUMBRIDGE_TD_ROUTE: LumbridgeTdRoutePoint[] = [
    { x: 59, y: 36 },
    { x: 57, y: 33 },
    { x: 55, y: 30 },
    { x: 53, y: 27 },
    { x: 50, y: 25 },
    { x: 47, y: 24 },
    { x: 44, y: 23 },
    { x: 41, y: 22 },
    { x: 38, y: 22 },
    { x: 35, y: 23 },
    { x: 33, y: 22 },
    { x: 32, y: 20 },
    { x: 31, y: 16 },
    { x: 31, y: 12 },
    { x: 31, y: 8 },
    { x: 31, y: 4 },
];

function clampRouteTileValue(value: number): number {
    return Math.max(0, Math.min(63, value | 0));
}

function sanitizeLumbridgeTdRoute(route: readonly LumbridgeTdRoutePoint[]): LumbridgeTdRoutePoint[] {
    return route.map((point) => ({
        x: clampRouteTileValue(point.x),
        y: clampRouteTileValue(point.y),
    }));
}

function getRouteStorage(): Storage | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }

    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

function loadStoredLumbridgeTdRoute(): LumbridgeTdRoutePoint[] {
    const storage = getRouteStorage();
    if (!storage) {
        return sanitizeLumbridgeTdRoute(DEFAULT_LUMBRIDGE_TD_ROUTE);
    }

    try {
        const stored = storage.getItem(LUMBRIDGE_TD_ROUTE_STORAGE_KEY);
        if (!stored) {
            return sanitizeLumbridgeTdRoute(DEFAULT_LUMBRIDGE_TD_ROUTE);
        }

        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            return sanitizeLumbridgeTdRoute(DEFAULT_LUMBRIDGE_TD_ROUTE);
        }

        const route = parsed
            .filter(
                (point): point is LumbridgeTdRoutePoint =>
                    point &&
                    typeof point === "object" &&
                    typeof point.x === "number" &&
                    typeof point.y === "number",
            )
            .map((point) => ({ x: point.x, y: point.y }));

        return route.length > 0
            ? sanitizeLumbridgeTdRoute(route)
            : sanitizeLumbridgeTdRoute(DEFAULT_LUMBRIDGE_TD_ROUTE);
    } catch {
        return sanitizeLumbridgeTdRoute(DEFAULT_LUMBRIDGE_TD_ROUTE);
    }
}

function persistLumbridgeTdRoute(route: readonly LumbridgeTdRoutePoint[]): void {
    const storage = getRouteStorage();
    if (!storage) {
        return;
    }

    try {
        storage.setItem(LUMBRIDGE_TD_ROUTE_STORAGE_KEY, JSON.stringify(route));
    } catch {
        // Ignore persistence failures so the editor remains usable in private browsing modes.
    }
}

let lumbridgeTdRoute: LumbridgeTdRoutePoint[] = loadStoredLumbridgeTdRoute();

export function getDefaultLumbridgeTdRoute(): LumbridgeTdRoutePoint[] {
    return sanitizeLumbridgeTdRoute(DEFAULT_LUMBRIDGE_TD_ROUTE);
}

export function getLumbridgeTdRoute(): LumbridgeTdRoutePoint[] {
    return lumbridgeTdRoute.map((point) => ({ ...point }));
}

export function setLumbridgeTdRoute(route: LumbridgeTdRoutePoint[]): void {
    lumbridgeTdRoute = sanitizeLumbridgeTdRoute(route);
    persistLumbridgeTdRoute(lumbridgeTdRoute);
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(
        new CustomEvent<LumbridgeTdRoutePoint[]>(LUMBRIDGE_TD_ROUTE_CHANGED, {
            detail: getLumbridgeTdRoute(),
        }),
    );
}

export function resetLumbridgeTdRoute(): void {
    setLumbridgeTdRoute(getDefaultLumbridgeTdRoute());
}

export function localTileToRouteEditorPoint(point: LumbridgeTdRoutePoint): { x: number; y: number } {
    return {
        x: (point.x + 0.5) / 64,
        y: 1 - (point.y + 0.5) / 64,
    };
}

export function routeEditorPointToLocalTile(x: number, y: number): LumbridgeTdRoutePoint {
    return {
        x: Math.max(0, Math.min(63, Math.floor(x * 64))),
        y: Math.max(0, Math.min(63, Math.floor((1 - y) * 64))),
    };
}
