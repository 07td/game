import { useEffect, useMemo, useRef } from "react";

import { ObjModelLoader } from "@rs-map-viewer/rs/config/objtype/ObjModelLoader";
import { HSL_RGB_MAP } from "@rs-map-viewer/rs/util/ColorUtil";
import { MapViewer } from "../lib/mapviewer/MapViewer";

const CANNON_OBJECT_ID = 32204;

type CannonModelCanvasProps = {
    mapViewer: MapViewer;
    firingPhase: number;
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

export function CannonModelCanvas({ mapViewer, firingPhase }: CannonModelCanvasProps): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const objModelLoader = useMemo(
        () =>
            new ObjModelLoader(
                mapViewer.objTypeLoader,
                mapViewer.loaderFactory.getModelLoader(),
                mapViewer.textureLoader,
            ),
        [mapViewer],
    );
    const model = useMemo(() => objModelLoader.getModel(CANNON_OBJECT_ID, 1), [objModelLoader]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !model) {
            return;
        }

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

        const recoil = firingPhase > 0 ? Math.sin(firingPhase * Math.PI) * 8 : 0;
        const yaw = -0.9 + firingPhase * 0.2;
        const pitch = -0.42;
        const scale = (Math.min(width, height) * 0.42) / maxExtent;

        const vertices: ProjectedPoint[] = new Array(model.verticesCount);
        for (let i = 0; i < model.verticesCount; i++) {
            const point = {
                x: model.verticesX[i] - centerX,
                y: model.verticesY[i] - centerY - recoil * (i % 7 === 0 ? 0.5 : 0),
                z: model.verticesZ[i] - centerZ,
            };
            const rotated = rotatePoint(point, yaw, pitch);
            const perspective = 1 / Math.max(0.35, 1 + rotated.z / 420);
            vertices[i] = {
                x: width * 0.5 + rotated.x * scale * perspective,
                y: height * 0.65 + rotated.y * scale * perspective,
                z: rotated.z,
            };
        }

        const faces: ProjectedFace[] = [];
        for (let i = 0; i < model.faceCount; i++) {
            const ia = model.indices1[i];
            const ib = model.indices2[i];
            const ic = model.indices3[i];
            const a = vertices[ia];
            const b = vertices[ib];
            const c = vertices[ic];
            const avgZ = (a.z + b.z + c.z) / 3;
            const hsl = model.faceColors1[i] > 0 ? model.faceColors1[i] : model.faceColors[i];
            const color = HSL_RGB_MAP[(hsl >> 7) & 0x1ff];
            faces.push({ a, b, c, avgZ, color, alpha: model.faceAlphas?.[i] ?? 0 });
        }

        faces.sort((lhs, rhs) => rhs.avgZ - lhs.avgZ);

        ctx.save();
        ctx.translate(0.5, 0.5);

        const shadowWidth = Math.max(22, (model.maxX - model.minX) * 0.16);
        const shadowHeight = Math.max(10, (model.maxZ - model.minZ) * 0.08);
        ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
        ctx.beginPath();
        ctx.ellipse(width * 0.5, height * 0.79, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
        ctx.fill();

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
            ctx.lineWidth = 0.8;
            ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
            ctx.stroke();
        }

        if (firingPhase > 0.82) {
            ctx.fillStyle = "rgba(255, 232, 128, 0.88)";
            ctx.beginPath();
            ctx.arc(width * 0.56, height * 0.47, 4 + (firingPhase - 0.82) * 42, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }, [model, firingPhase]);

    return <canvas ref={canvasRef} className="td-cannon-model" width={128} height={128} />;
}
