import { useEffect, useMemo, useRef } from "react";

import { ObjModelLoader } from "@rs-map-viewer/rs/config/objtype/ObjModelLoader";
import { ObjType } from "@rs-map-viewer/rs/config/objtype/ObjType";
import { Model } from "@rs-map-viewer/rs/model/Model";
import { HSL_RGB_MAP } from "@rs-map-viewer/rs/util/ColorUtil";
import { MapViewer } from "../lib/mapviewer/MapViewer";

type TdLootItemCanvasProps = {
    mapViewer: MapViewer;
    itemName: string;
};

function findObjIdByName(mapViewer: MapViewer, itemName: string): number | undefined {
    const wanted = itemName.toLowerCase();
    const count = mapViewer.objTypeLoader.getCount();

    for (let objId = 0; objId < count; objId++) {
        const objType = mapViewer.objTypeLoader.load(objId);
        if (objType.name.toLowerCase() === wanted) {
            return objId;
        }
    }

    for (let objId = 0; objId < count; objId++) {
        const objType = mapViewer.objTypeLoader.load(objId);
        if (objType.name.toLowerCase().includes(wanted)) {
            return objId;
        }
    }

    return undefined;
}

function buildObjNameLookup(mapViewer: MapViewer): Map<string, number> {
    const lookup = new Map<string, number>();
    const count = mapViewer.objTypeLoader.getCount();

    for (let objId = 0; objId < count; objId++) {
        const name = mapViewer.objTypeLoader.load(objId).name.toLowerCase();
        if (!lookup.has(name)) {
            lookup.set(name, objId);
        }
    }

    return lookup;
}

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
    return ((r / count) << 16) | (((g / count) & 0xff) << 8) | ((b / count) & 0xff);
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

const TEXTURE_SIZE = 128;
const textureCanvasCache = new WeakMap<object, Map<number, HTMLCanvasElement>>();

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
    const src0 = {
        x: normalizeUv(u0) * TEXTURE_SIZE,
        y: normalizeUv(v0) * TEXTURE_SIZE,
        z: 0,
    };
    const src1 = {
        x: normalizeUv(u1) * TEXTURE_SIZE,
        y: normalizeUv(v1) * TEXTURE_SIZE,
        z: 0,
    };
    const src2 = {
        x: normalizeUv(u2) * TEXTURE_SIZE,
        y: normalizeUv(v2) * TEXTURE_SIZE,
        z: 0,
    };
    const dst0 = { ...face.a };
    const dst1 = { ...face.b };
    const dst2 = { ...face.c };
    const transform = triangleToTriangleTransform(src0, src1, src2, dst0, dst1, dst2);
    if (!transform) {
        return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dst0.x, dst0.y);
    ctx.lineTo(dst1.x, dst1.y);
    ctx.lineTo(dst2.x, dst2.y);
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

function drawLootModel(
    canvas: HTMLCanvasElement,
    mapViewer: MapViewer,
    model: Model,
    objType: ObjType,
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

    const yaw = objType.yan2d * (Math.PI / 1024);
    const pitch = objType.xan2d * (Math.PI / 1024);
    const roll = objType.zan2d * (Math.PI / 1024);
    const scale = (Math.min(width, height) * 2.25 * (objType.zoom2d / 2000)) / maxExtent;

    const vertices: ProjectedPoint[] = new Array(model.verticesCount);
    for (let i = 0; i < model.verticesCount; i++) {
        const rotated = rotatePoint(
            {
                x: model.verticesX[i] - centerX,
                y: model.verticesY[i] - centerY,
                z: model.verticesZ[i] - centerZ,
            },
            yaw,
            pitch,
        );
        const rolled = rotatePoint3d(rotated, 0, 0, roll);
        const perspective = 1 / Math.max(0.4, 1 + rolled.z / 520);
        vertices[i] = {
            x: width * 0.5 + rolled.x * scale * perspective + objType.offsetX2d + 0.5,
            y: height * 0.64 + rolled.y * scale * perspective - objType.offsetY2d - 0.5,
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
        const colorA = hslToRgb(hslA);
        const colorB = hslToRgb(hslB);
        const colorC = hslToRgb(hslC);
        faces.push({
            a,
            b,
            c,
            avgZ: (a.z + b.z + c.z) / 3,
            color: liftRgb(averageRgb(colorA, colorB, colorC), 0.08),
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
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.82, Math.max(6, width * 0.22), Math.max(2, height * 0.07), 0, 0, Math.PI * 2);
    ctx.fill();

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
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
        ctx.stroke();
    }
    ctx.restore();
}

export function TdLootItemCanvas({ mapViewer, itemName }: TdLootItemCanvasProps): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const objNameLookup = useMemo(() => buildObjNameLookup(mapViewer), [mapViewer]);
    const objModelLoader = useMemo(
        () =>
            new ObjModelLoader(
                mapViewer.objTypeLoader,
                mapViewer.loaderFactory.getModelLoader(),
                mapViewer.textureLoader,
            ),
        [mapViewer],
    );
    const objId = useMemo(() => {
        const exact = objNameLookup.get(itemName.toLowerCase());
        if (exact !== undefined) {
            return exact;
        }
        return findObjIdByName(mapViewer, itemName);
    }, [mapViewer, objNameLookup, itemName]);
    const objType = useMemo(() => {
        if (objId === undefined) {
            return undefined;
        }
        return mapViewer.objTypeLoader.load(objId);
    }, [mapViewer, objId]);
    const model = useMemo(() => {
        if (objId === undefined) {
            return undefined;
        }
        return objModelLoader.getModel(objId, 1);
    }, [objId, objModelLoader]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !model || !objType) {
            return;
        }
        drawLootModel(canvas, mapViewer, model, objType);
    }, [mapViewer, model, objType]);

    return <canvas ref={canvasRef} className="td-loot-icon" width={32} height={32} />;
}
