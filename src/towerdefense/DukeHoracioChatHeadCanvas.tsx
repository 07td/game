import { useEffect, useMemo, useRef } from "react";

import { Model } from "@rs-map-viewer/rs/model/Model";
import { ModelData } from "@rs-map-viewer/rs/model/ModelData";
import { HSL_RGB_MAP } from "@rs-map-viewer/rs/util/ColorUtil";
import { MapViewer } from "../lib/mapviewer/MapViewer";

const DUKE_HORACIO_NPC_IDS = [815, 741];

type DukeHoracioChatHeadCanvasProps = {
    mapViewer: MapViewer;
};

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
};

function rgbToCss(rgb: number): string {
    return `#${rgb.toString(16).padStart(6, "0")}`;
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

function findDukeHoracioNpcId(mapViewer: MapViewer): number | undefined {
    for (const npcId of DUKE_HORACIO_NPC_IDS) {
        const npcType = mapViewer.npcTypeLoader.load(npcId);
        if (npcType.name === "Duke Horacio") {
            return npcId;
        }
    }

    const count = mapViewer.npcTypeLoader.getCount();
    for (let npcId = 0; npcId < count; npcId++) {
        const npcType = mapViewer.npcTypeLoader.load(npcId);
        if (npcType.name === "Duke Horacio") {
            return npcId;
        }
    }

    return undefined;
}

function loadDukeHoracioChatHeadModel(mapViewer: MapViewer): Model | undefined {
    const npcId = findDukeHoracioNpcId(mapViewer);
    if (npcId === undefined) {
        return undefined;
    }

    const npcType = mapViewer.npcTypeLoader.load(npcId);
    const modelIds =
        npcType.chatheadModelIds?.length > 0 ? npcType.chatheadModelIds : npcType.modelIds;
    if (!modelIds?.length) {
        return undefined;
    }

    const modelLoader = mapViewer.loaderFactory.getModelLoader();
    const models = modelIds
        .map((modelId) => modelLoader.getModel(modelId))
        .filter((model): model is ModelData => model !== undefined);
    if (models.length === 0) {
        return undefined;
    }

    const merged = ModelData.merge(models, models.length);
    if (npcType.recolorFrom) {
        for (let i = 0; i < npcType.recolorFrom.length; i++) {
            merged.recolor(npcType.recolorFrom[i], npcType.recolorTo[i]);
        }
    }
    if (npcType.retextureFrom) {
        for (let i = 0; i < npcType.retextureFrom.length; i++) {
            merged.retexture(npcType.retextureFrom[i], npcType.retextureTo[i]);
        }
    }

    return merged.light(
        mapViewer.textureLoader,
        npcType.ambient + 64,
        npcType.contrast * 5 + 850,
        -30,
        -50,
        -30,
    );
}

function drawChatHead(canvas: HTMLCanvasElement, model: Model): void {
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

    const yaw = 0.72;
    const pitch = -0.04;
    const scale = (Math.min(width, height) * 0.95) / maxExtent;

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
        const perspective = 1 / Math.max(0.42, 1 + rotated.z / 520);
        vertices[i] = {
            x: width * 0.44 + rotated.x * scale * perspective,
            y: height * 0.58 + rotated.y * scale * perspective,
            z: rotated.z,
        };
    }

    const clockwiseFaces: ProjectedFace[] = [];
    const counterClockwiseFaces: ProjectedFace[] = [];
    for (let i = 0; i < model.faceCount; i++) {
        if (model.faceColors3[i] === -2) {
            continue;
        }
        const a = vertices[model.indices1[i]];
        const b = vertices[model.indices2[i]];
        const c = vertices[model.indices3[i]];
        const signedArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        const hslA = model.faceColors1[i] > 0 ? model.faceColors1[i] : model.faceColors[i];
        const hslB = model.faceColors2[i] > 0 ? model.faceColors2[i] : hslA;
        const hslC = model.faceColors3[i] > 0 ? model.faceColors3[i] : hslA;
        const face = {
            a,
            b,
            c,
            avgZ: (a.z + b.z + c.z) / 3,
            color: liftRgb(averageRgb(hslToRgb(hslA), hslToRgb(hslB), hslToRgb(hslC)), 0.13),
            alpha: model.faceAlphas?.[i] ?? 0,
        };
        if (signedArea >= 0) {
            clockwiseFaces.push(face);
        } else {
            counterClockwiseFaces.push(face);
        }
    }

    const faces =
        clockwiseFaces.length >= counterClockwiseFaces.length
            ? clockwiseFaces
            : counterClockwiseFaces;
    faces.sort((lhs, rhs) => rhs.avgZ - lhs.avgZ);

    ctx.save();
    ctx.translate(0.5, 0.5);
    for (const face of faces) {
        ctx.beginPath();
        ctx.moveTo(face.a.x, face.a.y);
        ctx.lineTo(face.b.x, face.b.y);
        ctx.lineTo(face.c.x, face.c.y);
        ctx.closePath();

        ctx.fillStyle = rgbToCss(face.color);
        ctx.globalAlpha = face.alpha > 0 ? Math.max(0.25, 1 - face.alpha / 255) : 1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

export function DukeHoracioChatHeadCanvas({
    mapViewer,
}: DukeHoracioChatHeadCanvasProps): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const model = useMemo(() => loadDukeHoracioChatHeadModel(mapViewer), [mapViewer]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !model) {
            return;
        }
        drawChatHead(canvas, model);
    }, [model]);

    return <canvas ref={canvasRef} className="td-duke-chathead" width={140} height={140} />;
}
