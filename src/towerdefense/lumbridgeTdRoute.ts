export type LumbridgeTdRoutePoint = {
    x: number;
    y: number;
};

export const LUMBRIDGE_TD_MAP_X = 50;
export const LUMBRIDGE_TD_MAP_Y = 50;
export const LUMBRIDGE_TD_ROUTE_CHANGED = "lumbridge-td:route-changed";

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

let lumbridgeTdRoute: LumbridgeTdRoutePoint[] = DEFAULT_LUMBRIDGE_TD_ROUTE.map((point) => ({
    ...point,
}));

export function getDefaultLumbridgeTdRoute(): LumbridgeTdRoutePoint[] {
    return DEFAULT_LUMBRIDGE_TD_ROUTE.map((point) => ({ ...point }));
}

export function getLumbridgeTdRoute(): LumbridgeTdRoutePoint[] {
    return lumbridgeTdRoute.map((point) => ({ ...point }));
}

export function setLumbridgeTdRoute(route: LumbridgeTdRoutePoint[]): void {
    lumbridgeTdRoute = route.map((point) => ({
        x: Math.max(0, Math.min(63, point.x | 0)),
        y: Math.max(0, Math.min(63, point.y | 0)),
    }));
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
