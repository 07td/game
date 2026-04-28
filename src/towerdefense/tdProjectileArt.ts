import { ObjModelLoader } from "@rs-map-viewer/rs/config/objtype/ObjModelLoader";
import { SpotAnimModelLoader } from "@rs-map-viewer/rs/config/spotanimtype/SpotAnimModelLoader";
import { Model } from "@rs-map-viewer/rs/model/Model";
import { HSL_RGB_MAP } from "@rs-map-viewer/rs/util/ColorUtil";

import { MapViewer } from "../lib/mapviewer/MapViewer";
import { MageTowerElement, Projectile, TowerKind } from "./lumbridgeTd";

type ProjectedPoint = {
    x: number;
    y: number;
    z: number;
};

type ProjectedFace = {
    a: ProjectedPoint;
    b: ProjectedPoint;
    c: ProjectedPoint;
    avgZ: number;
    color: number;
    alpha: number;
    textureId: number;
    uv?: [number, number, number, number, number, number];
};

type ProjectileArtDefinition = {
    kind: TowerKind;
    element?: MageTowerElement;
    source: "obj" | "spotanim";
    objNames?: string[];
    spotAnimId?: number;
    arcHeight: number;
    sizeTiles: number;
    glowColor?: string;
    yaw?: number;
    pitch?: number;
    roll?: number;
    zoom?: number;
};

type ProjectileArtSprite = {
    canvas: HTMLCanvasElement;
    sizeTiles: number;
    arcHeight: number;
    glowColor?: string;
};

const TEXTURE_SIZE = 128;
const textureCanvasCache = new WeakMap<object, Map<number, HTMLCanvasElement>>();

const PROJECTILE_ART: Record<TowerKind, ProjectileArtDefinition> = {
    bolt: {
        kind: "bolt",
        source: "obj",
        objNames: ["Bronze bolts", "Bronze arrow", "Iron arrow"],
        arcHeight: 0.24,
        sizeTiles: 0.52,
        glowColor: "rgba(240, 226, 122, 0.22)",
    },
    cannon: {
        kind: "cannon",
        source: "spotanim",
        spotAnimId: 53,
        arcHeight: 0.12,
        sizeTiles: 0.6,
        glowColor: "rgba(255, 143, 82, 0.28)",
        yaw: Math.PI * 0.1,
        pitch: Math.PI * 0.08,
        roll: 0,
        zoom: 2.05,
    },
};

const MAGE_PROJECTILE_ART: Record<MageTowerElement, ProjectileArtDefinition> = {
    air: {
        kind: "mage",
        element: "air",
        source: "spotanim",
        spotAnimId: 118,
        arcHeight: 0.46,
        sizeTiles: 0.78,
        glowColor: "rgba(181, 240, 255, 0.32)",
        yaw: Math.PI * 0.18,
        pitch: Math.PI * 0.14,
        roll: Math.PI * 0.1,
        zoom: 2.45,
    },
    water: {
        kind: "mage",
        element: "water",
        source: "spotanim",
        spotAnimId: 121,
        arcHeight: 0.46,
        sizeTiles: 0.8,
        glowColor: "rgba(112, 191, 255, 0.34)",
        yaw: Math.PI * 0.18,
        pitch: Math.PI * 0.14,
        roll: Math.PI * 0.1,
        zoom: 2.45,
    },
    earth: {
        kind: "mage",
        element: "earth",
        source: "spotanim",
        spotAnimId: 124,
        arcHeight: 0.42,
        sizeTiles: 0.82,
        glowColor: "rgba(195, 163, 96, 0.3)",
        yaw: Math.PI * 0.18,
        pitch: Math.PI * 0.14,
        roll: Math.PI * 0.1,
        zoom: 2.45,
    },
    fire: {
        kind: "mage",
        element: "fire",
        source: "spotanim",
        spotAnimId: 127,
        arcHeight: 0.5,
        sizeTiles: 0.84,
        glowColor: "rgba(255, 118, 74, 0.34)",
        yaw: Math.PI * 0.18,
        pitch: Math.PI * 0.14,
        roll: Math.PI * 0.1,
        zoom: 2.45,
    },
};

function rgbToCss(rgb: number): string {
    return `#${rgb.toString(16).padStart(6, "0")}`;
}

function hslToRgb(hsl: number): number {
    return HSL_RGB_MAP[hsl & 0xffff] || 1;
}

function averageRgb(...rgbs: number[]): number {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const rgb of rgbs) {
        r += (rgb >> 16) & 0xff;
        g += (rgb >> 8) & 0xff;
        b += rgb & 0xff;
    }
    const count = Math.max(1, rgbs.length);
    return (((r / count) & 0xff) << 16) | (((g / count) & 0xff) << 8) | ((b / count) & 0xff);
}

function liftRgb(rgb: number, amount: number): number {
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const nextR = Math.min(255, Math.round(r + (255 - r) * amount));
    const nextG = Math.min(255, Math.round(g + (255 - g) * amount));
    const nextB = Math.min(255, Math.round(b + (255 - b) * amount));
    return (nextR << 16) | (nextG << 8) | nextB;
}

function getTextureCanvas(mapViewer: MapViewer, textureId: number): HTMLCanvasElement {
    const loaderKey = mapViewer.textureLoader as unknown as object;
    let loaderCache = textureCanvasCache.get(loaderKey);
    if (!loaderCache) {
        loaderCache = new Map<number, HTMLCanvasElement>();
        textureCanvasCache.set(loaderKey, loaderCache);
    }

    const cached = loaderCache.get(textureId);
    if (cached) {
        return cached;
    }

    const texturePixels = mapViewer.textureLoader.getPixelsArgb(textureId, TEXTURE_SIZE, true, 1.0);
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        loaderCache.set(textureId, canvas);
        return canvas;
    }

    const imageData = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
    for (let i = 0; i < texturePixels.length; i++) {
        const pixel = texturePixels[i];
        imageData.data[i * 4] = (pixel >> 16) & 0xff;
        imageData.data[i * 4 + 1] = (pixel >> 8) & 0xff;
        imageData.data[i * 4 + 2] = pixel & 0xff;
        imageData.data[i * 4 + 3] = (pixel >>> 24) & 0xff;
    }
    ctx.putImageData(imageData, 0, 0);
    loaderCache.set(textureId, canvas);
    return canvas;
}

function normalizeUv(value: number): number {
    const wrapped = value - Math.floor(value);
    return wrapped < 0 ? wrapped + 1 : wrapped;
}

function triangleToTriangleTransform(
    src0: ProjectedPoint,
    src1: ProjectedPoint,
    src2: ProjectedPoint,
    dst0: ProjectedPoint,
    dst1: ProjectedPoint,
    dst2: ProjectedPoint,
): [number, number, number, number, number, number] | undefined {
    const det =
        src0.x * (src1.y - src2.y) +
        src1.x * (src2.y - src0.y) +
        src2.x * (src0.y - src1.y);
    if (Math.abs(det) < 1e-6) {
        return undefined;
    }

    const a =
        (dst0.x * (src1.y - src2.y) + dst1.x * (src2.y - src0.y) + dst2.x * (src0.y - src1.y)) /
        det;
    const c =
        (dst0.x * (src2.x - src1.x) + dst1.x * (src0.x - src2.x) + dst2.x * (src1.x - src0.x)) /
        det;
    const e =
        (dst0.x * (src1.x * src2.y - src2.x * src1.y) +
            dst1.x * (src2.x * src0.y - src0.x * src2.y) +
            dst2.x * (src0.x * src1.y - src1.x * src0.y)) /
        det;
    const b =
        (dst0.y * (src1.y - src2.y) + dst1.y * (src2.y - src0.y) + dst2.y * (src0.y - src1.y)) /
        det;
    const d =
        (dst0.y * (src2.x - src1.x) + dst1.y * (src0.x - src2.x) + dst2.y * (src1.x - src0.x)) /
        det;
    const f =
        (dst0.y * (src1.x * src2.y - src2.x * src1.y) +
            dst1.y * (src2.x * src0.y - src0.x * src2.y) +
            dst2.y * (src0.x * src1.y - src1.x * src0.y)) /
        det;

    return [a, b, c, d, e, f];
}

function drawTexturedFace(
    ctx: CanvasRenderingContext2D,
    mapViewer: MapViewer,
    face: ProjectedFace,
): void {
    if (!face.uv) {
        return;
    }

    const textureCanvas = getTextureCanvas(mapViewer, face.textureId);
    const [u0, v0, u1, v1, u2, v2] = face.uv;
    const src0 = { x: normalizeUv(u0) * TEXTURE_SIZE, y: normalizeUv(v0) * TEXTURE_SIZE, z: 0 };
    const src1 = { x: normalizeUv(u1) * TEXTURE_SIZE, y: normalizeUv(v1) * TEXTURE_SIZE, z: 0 };
    const src2 = { x: normalizeUv(u2) * TEXTURE_SIZE, y: normalizeUv(v2) * TEXTURE_SIZE, z: 0 };
    const transform = triangleToTriangleTransform(src0, src1, src2, face.a, face.b, face.c);
    if (!transform) {
        return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(face.a.x, face.a.y);
    ctx.lineTo(face.b.x, face.b.y);
    ctx.lineTo(face.c.x, face.c.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(...transform);
    ctx.drawImage(textureCanvas, 0, 0);
    ctx.restore();
}

function rotatePoint(point: ProjectedPoint, yaw: number, pitch: number): ProjectedPoint {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    const x1 = point.x * cosYaw - point.z * sinYaw;
    const z1 = point.x * sinYaw + point.z * cosYaw;
    const y1 = point.y * cosPitch - z1 * sinPitch;
    const z2 = point.y * sinPitch + z1 * cosPitch;

    return { x: x1, y: y1, z: z2 };
}

function rotatePoint3d(
    point: ProjectedPoint,
    yaw: number,
    pitch: number,
    roll: number,
): ProjectedPoint {
    let next = rotatePoint(point, yaw, pitch);
    const cosRoll = Math.cos(roll);
    const sinRoll = Math.sin(roll);
    const x = next.x * cosRoll - next.y * sinRoll;
    const y = next.x * sinRoll + next.y * cosRoll;
    next = { x, y, z: next.z };
    return next;
}

function drawModelSprite(
    canvas: HTMLCanvasElement,
    mapViewer: MapViewer,
    model: Model,
    options: {
        yaw: number;
        pitch: number;
        roll: number;
        zoom: number;
        offsetX?: number;
        offsetY?: number;
        shadow?: boolean;
    },
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    model.calculateBounds();
    const centerX = (model.minX + model.maxX) / 2;
    const centerY = (model.minY + model.maxY) / 2;
    const centerZ = (model.minZ + model.maxZ) / 2;
    const maxExtent = Math.max(
        model.maxX - model.minX,
        model.maxY - model.minY,
        model.maxZ - model.minZ,
        1,
    );
    const scale = (Math.min(width, height) * options.zoom) / maxExtent;

    const vertices: ProjectedPoint[] = new Array(model.verticesCount);
    for (let i = 0; i < model.verticesCount; i++) {
        const rotated = rotatePoint(
            {
                x: model.verticesX[i] - centerX,
                y: model.verticesY[i] - centerY,
                z: model.verticesZ[i] - centerZ,
            },
            options.yaw,
            options.pitch,
        );
        const rolled = rotatePoint3d(rotated, 0, 0, options.roll);
        const perspective = 1 / Math.max(0.4, 1 + rolled.z / 520);
        vertices[i] = {
            x: width * 0.5 + rolled.x * scale * perspective + (options.offsetX ?? 0),
            y: height * 0.56 + rolled.y * scale * perspective + (options.offsetY ?? 0),
            z: rolled.z,
        };
    }

    const faces: ProjectedFace[] = [];
    for (let i = 0; i < model.faceCount; i++) {
        if (model.faceColors3[i] === -2) {
            continue;
        }
        const a = vertices[model.indices1[i]];
        const b = vertices[model.indices2[i]];
        const c = vertices[model.indices3[i]];
        const hslA = model.faceColors1[i] > 0 ? model.faceColors1[i] : model.faceColors[i];
        const hslB = model.faceColors2[i] > 0 ? model.faceColors2[i] : hslA;
        const hslC = model.faceColors3[i] > 0 ? model.faceColors3[i] : hslA;
        const textureId = model.faceTextures?.[i] ?? -1;
        faces.push({
            a,
            b,
            c,
            avgZ: (a.z + b.z + c.z) / 3,
            color: liftRgb(averageRgb(hslToRgb(hslA), hslToRgb(hslB), hslToRgb(hslC)), 0.08),
            alpha: model.faceAlphas?.[i] ?? 0,
            textureId,
            uv: model.uvs
                ? [
                      model.uvs[i * 6],
                      model.uvs[i * 6 + 1],
                      model.uvs[i * 6 + 2],
                      model.uvs[i * 6 + 3],
                      model.uvs[i * 6 + 4],
                      model.uvs[i * 6 + 5],
                  ]
                : undefined,
        });
    }

    faces.sort((lhs, rhs) => rhs.avgZ - lhs.avgZ);
    ctx.imageSmoothingEnabled = false;

    if (options.shadow !== false) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
        ctx.beginPath();
        ctx.ellipse(
            width * 0.5,
            height * 0.82,
            Math.max(4, width * 0.18),
            Math.max(2, height * 0.05),
            0,
            0,
            Math.PI * 2,
        );
        ctx.fill();
    }

    ctx.save();
    ctx.translate(0.5, 0.5);
    for (const face of faces) {
        ctx.beginPath();
        ctx.moveTo(face.a.x, face.a.y);
        ctx.lineTo(face.b.x, face.b.y);
        ctx.lineTo(face.c.x, face.c.y);
        ctx.closePath();
        ctx.globalAlpha = face.alpha > 0 ? Math.max(0.25, 1 - face.alpha / 255) : 1;
        if (face.textureId !== -1 && face.uv) {
            drawTexturedFace(ctx, mapViewer, face);
        } else {
            ctx.fillStyle = rgbToCss(face.color);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.lineWidth = 0.65;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
        ctx.stroke();
    }
    ctx.restore();
}

function getProjectileDefinition(
    projectile: Pick<Projectile, "kind" | "element">,
): ProjectileArtDefinition {
    if (projectile.kind === "mage") {
        return MAGE_PROJECTILE_ART[projectile.element ?? "air"];
    }
    return PROJECTILE_ART[projectile.kind];
}

export class TdProjectileArtCache {
    private readonly objModelLoader: ObjModelLoader;
    private readonly spotAnimModelLoader: SpotAnimModelLoader;
    private readonly objectSprites: Map<string, ProjectileArtSprite> = new Map();
    private readonly spotAnimSprites: Map<string, ProjectileArtSprite> = new Map();
    private readonly objNameLookup: Map<string, number>;

    constructor(readonly mapViewer: MapViewer) {
        this.objModelLoader = new ObjModelLoader(
            mapViewer.objTypeLoader,
            mapViewer.loaderFactory.getModelLoader(),
            mapViewer.textureLoader,
        );
        this.spotAnimModelLoader = new SpotAnimModelLoader(
            mapViewer.spotAnimTypeLoader,
            mapViewer.loaderFactory.getModelLoader(),
            mapViewer.textureLoader,
            mapViewer.seqTypeLoader,
            mapViewer.seqFrameLoader,
            mapViewer.loaderFactory.getSkeletalSeqLoader(),
        );
        this.objNameLookup = this.buildObjNameLookup();
    }

    getSprite(projectile: Projectile): ProjectileArtSprite | undefined {
        const def = getProjectileDefinition(projectile);
        if (def.source === "obj") {
            return this.getObjectSprite(def);
        }
        return this.getSpotAnimSprite(def, projectile);
    }

    private buildObjNameLookup(): Map<string, number> {
        const lookup = new Map<string, number>();
        const count = this.mapViewer.objTypeLoader.getCount();
        for (let objId = 0; objId < count; objId++) {
            const name = this.mapViewer.objTypeLoader.load(objId).name.toLowerCase();
            if (name !== "null" && !lookup.has(name)) {
                lookup.set(name, objId);
            }
        }
        return lookup;
    }

    private findObjId(names: readonly string[]): number | undefined {
        for (const name of names) {
            const exact = this.objNameLookup.get(name.toLowerCase());
            if (exact !== undefined) {
                return exact;
            }
        }

        const count = this.mapViewer.objTypeLoader.getCount();
        for (let objId = 0; objId < count; objId++) {
            const objType = this.mapViewer.objTypeLoader.load(objId);
            const lowered = objType.name.toLowerCase();
            if (names.some((name) => lowered.includes(name.toLowerCase()))) {
                return objId;
            }
        }

        return undefined;
    }

    private getObjectSprite(def: ProjectileArtDefinition): ProjectileArtSprite | undefined {
        const key = def.objNames?.join("|") ?? def.kind;
        const cached = this.objectSprites.get(key);
        if (cached) {
            return cached;
        }

        const objId = def.objNames ? this.findObjId(def.objNames) : undefined;
        if (objId === undefined) {
            return undefined;
        }

        const objType = this.mapViewer.objTypeLoader.load(objId);
        const model = this.objModelLoader.getModel(objId, 1);
        if (!model) {
            return undefined;
        }

        const canvas = document.createElement("canvas");
        canvas.width = 40;
        canvas.height = 40;
        drawModelSprite(canvas, this.mapViewer, model, {
            yaw: objType.yan2d * (Math.PI / 1024),
            pitch: objType.xan2d * (Math.PI / 1024),
            roll: objType.zan2d * (Math.PI / 1024),
            zoom: 2.25 * (objType.zoom2d / 2000),
            offsetX: objType.offsetX2d,
            offsetY: -objType.offsetY2d,
            shadow: false,
        });

        const sprite = {
            canvas,
            sizeTiles: def.sizeTiles,
            arcHeight: def.arcHeight,
            glowColor: def.glowColor,
        };
        this.objectSprites.set(key, sprite);
        return sprite;
    }

    private getSpotAnimSprite(
        def: ProjectileArtDefinition,
        projectile: Projectile,
    ): ProjectileArtSprite | undefined {
        if (def.spotAnimId === undefined) {
            return undefined;
        }

        const frame = this.getSpotAnimFrame(def.spotAnimId, projectile);
        const cacheKey = `${def.spotAnimId}:${frame}`;
        const cached = this.spotAnimSprites.get(cacheKey);
        if (cached) {
            return cached;
        }

        const model = this.spotAnimModelLoader.getModel(def.spotAnimId, frame);
        if (!model) {
            return undefined;
        }

        const canvas = document.createElement("canvas");
        canvas.width = projectile.kind === "mage" ? 52 : 42;
        canvas.height = projectile.kind === "mage" ? 52 : 42;
        drawModelSprite(canvas, this.mapViewer, model, {
            yaw: def.yaw ?? 0,
            pitch: def.pitch ?? 0,
            roll: def.roll ?? 0,
            zoom: def.zoom ?? 2.2,
            shadow: false,
        });

        const sprite = {
            canvas,
            sizeTiles: def.sizeTiles,
            arcHeight: def.arcHeight,
            glowColor: def.glowColor,
        };
        this.spotAnimSprites.set(cacheKey, sprite);
        return sprite;
    }

    private getSpotAnimFrame(spotAnimId: number, projectile: Projectile): number {
        const spotAnim = this.mapViewer.spotAnimTypeLoader.load(spotAnimId);
        if (spotAnim.sequenceId === -1) {
            return -1;
        }

        const seqType = this.mapViewer.seqTypeLoader.load(spotAnim.sequenceId);
        if (!seqType.frameIds || seqType.frameIds.length === 0 || seqType.isSkeletalSeq()) {
            return -1;
        }

        let totalTicks = 0;
        for (let i = 0; i < seqType.frameIds.length; i++) {
            totalTicks += Math.max(1, seqType.getFrameLength(this.mapViewer.seqFrameLoader, i));
        }
        if (totalTicks <= 0) {
            return 0;
        }

        let targetTick =
            ((projectile.elapsedMs / Math.max(1, projectile.durationMs)) * totalTicks) | 0;
        targetTick %= totalTicks;

        for (let frame = 0; frame < seqType.frameIds.length; frame++) {
            targetTick -= Math.max(1, seqType.getFrameLength(this.mapViewer.seqFrameLoader, frame));
            if (targetTick < 0) {
                return frame;
            }
        }

        return seqType.frameIds.length - 1;
    }
}

export function getProjectileArcHeight(projectile: Projectile): number {
    return getProjectileDefinition(projectile).arcHeight;
}
