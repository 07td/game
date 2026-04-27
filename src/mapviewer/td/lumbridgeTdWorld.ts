import { mat4, vec3, vec4 } from "gl-matrix";

import { MapViewer } from "../MapViewer";
import { WebGLMapSquare } from "../webgl/WebGLMapSquare";
import { TowerPad, WorldPoint } from "./lumbridgeTd";
import { LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y } from "./lumbridgeTdRoute";

function getCanvasSize(mapViewer: MapViewer): { width: number; height: number } {
    const canvas = mapViewer.renderer.canvas;
    return {
        width: canvas.clientWidth > 0 ? canvas.clientWidth : canvas.width,
        height: canvas.clientHeight > 0 ? canvas.clientHeight : canvas.height,
    };
}

function sampleTerrainHeight(mapViewer: MapViewer, worldX: number, worldZ: number): number | undefined {
    const mapX = Math.floor(worldX / 64);
    const mapY = Math.floor(worldZ / 64);
    const map = mapViewer.renderer.mapManager.getMap(mapX, mapY);
    if (!(map instanceof WebGLMapSquare)) {
        return undefined;
    }

    const localX = worldX - mapX * 64;
    const localY = worldZ - mapY * 64;
    const tileX = Math.floor(localX);
    const tileY = Math.floor(localY);
    const fracX = localX - tileX;
    const fracY = localY - tileY;

    const h00 = map.getTileHeight(0, tileX, tileY);
    const h10 = map.getTileHeight(0, tileX + 1, tileY);
    const h01 = map.getTileHeight(0, tileX, tileY + 1);
    const h11 = map.getTileHeight(0, tileX + 1, tileY + 1);

    const h0 = h00 + (h10 - h00) * fracX;
    const h1 = h01 + (h11 - h01) * fracX;
    return -(h0 + (h1 - h0) * fracY) / 16 + 0.02;
}

function screenPointToWorldRay(
    mapViewer: MapViewer,
    normalizedX: number,
    normalizedY: number,
): { origin: vec3; direction: vec3 } | undefined {
    const inverseViewProj = mat4.create();
    if (!mat4.invert(inverseViewProj, mapViewer.camera.viewProjMatrix)) {
        return undefined;
    }

    const ndcX = normalizedX * 2 - 1;
    const ndcY = 1 - normalizedY * 2;
    const nearClip = vec4.fromValues(ndcX, ndcY, -1, 1);
    const farClip = vec4.fromValues(ndcX, ndcY, 1, 1);

    vec4.transformMat4(nearClip, nearClip, inverseViewProj);
    vec4.transformMat4(farClip, farClip, inverseViewProj);

    if (nearClip[3] === 0 || farClip[3] === 0) {
        return undefined;
    }

    const origin = vec3.fromValues(
        nearClip[0] / nearClip[3],
        nearClip[1] / nearClip[3],
        nearClip[2] / nearClip[3],
    );
    const farPoint = vec3.fromValues(
        farClip[0] / farClip[3],
        farClip[1] / farClip[3],
        farClip[2] / farClip[3],
    );
    const direction = vec3.create();
    vec3.subtract(direction, farPoint, origin);
    vec3.normalize(direction, direction);

    return { origin, direction };
}

function pointAtDistance(origin: vec3, direction: vec3, distance: number): vec3 {
    return vec3.fromValues(
        origin[0] + direction[0] * distance,
        origin[1] + direction[1] * distance,
        origin[2] + direction[2] * distance,
    );
}

export function getLumbridgePadWorldAnchor(
    mapViewer: MapViewer,
    pad: TowerPad,
): WorldPoint | undefined {
    if (Number.isFinite(pad.tileX) && Number.isFinite(pad.tileY)) {
        const worldX = LUMBRIDGE_TD_MAP_X * 64 + pad.tileX + 0.5;
        const worldZ = LUMBRIDGE_TD_MAP_Y * 64 + pad.tileY + 0.5;
        const terrain = sampleTerrainHeight(mapViewer, worldX, worldZ);
        if (terrain === undefined) {
            return undefined;
        }
        return {
            x: worldX,
            y: terrain,
            z: worldZ,
        };
    }

    const ray = screenPointToWorldRay(mapViewer, pad.x, pad.y);
    if (!ray) {
        return undefined;
    }

    const maxDistance = 2048;
    const step = 4;
    let previousDistance = 0;
    let previousPoint = pointAtDistance(ray.origin, ray.direction, previousDistance);
    let previousTerrain = sampleTerrainHeight(mapViewer, previousPoint[0], previousPoint[2]);
    if (previousTerrain === undefined) {
        previousTerrain = -Infinity;
    }

    for (let distance = step; distance <= maxDistance; distance += step) {
        const point = pointAtDistance(ray.origin, ray.direction, distance);
        const terrain = sampleTerrainHeight(mapViewer, point[0], point[2]);
        if (terrain === undefined) {
            previousDistance = distance;
            previousPoint = point;
            previousTerrain = -Infinity;
            continue;
        }

        if (point[1] <= terrain) {
            let low = previousDistance;
            let high = distance;
            for (let i = 0; i < 8; i++) {
                const mid = (low + high) * 0.5;
                const midPoint = pointAtDistance(ray.origin, ray.direction, mid);
                const midTerrain = sampleTerrainHeight(mapViewer, midPoint[0], midPoint[2]);
                if (midTerrain !== undefined && midPoint[1] <= midTerrain) {
                    high = mid;
                } else {
                    low = mid;
                }
            }
            const hit = pointAtDistance(ray.origin, ray.direction, high);
            const hitTerrain = sampleTerrainHeight(mapViewer, hit[0], hit[2]) ?? terrain;
            return {
                x: hit[0],
                y: hitTerrain,
                z: hit[2],
            };
        }

        previousDistance = distance;
        previousPoint = point;
        previousTerrain = terrain;
    }

    return {
        x: previousPoint[0],
        y: previousTerrain + 0.02,
        z: previousPoint[2],
    };
}
