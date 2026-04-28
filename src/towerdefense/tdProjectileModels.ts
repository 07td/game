import { ObjModelLoader } from "@rs-map-viewer/rs/config/objtype/ObjModelLoader";
import { SpotAnimModelLoader } from "@rs-map-viewer/rs/config/spotanimtype/SpotAnimModelLoader";
import { Model } from "@rs-map-viewer/rs/model/Model";

import { MapViewer } from "../lib/mapviewer/MapViewer";
import { MageTowerElement, Projectile, TowerKind } from "./lumbridgeTd";

export type TdProjectileDefinition = {
    kind: TowerKind;
    element?: MageTowerElement;
    source: "obj" | "spotanim";
    objNames?: string[];
    spotAnimId?: number;
    arcHeight: number;
    sourceLift: number;
    targetLift: number;
    worldScale: number;
    yawOffset: number;
};

const TD_PROJECTILE_DEFINITIONS: Record<TowerKind, TdProjectileDefinition> = {
    bolt: {
        kind: "bolt",
        source: "obj",
        objNames: ["Broad arrows", "Bronze fire arrow (lit)", "Bronze arrow", "Iron arrow"],
        arcHeight: 0.18,
        sourceLift: 0.62,
        targetLift: 0.32,
        worldScale: 168,
        yawOffset: 1024,
    },
    cannon: {
        kind: "cannon",
        source: "obj",
        objNames: ["Cannonball"],
        arcHeight: 0.08,
        sourceLift: 0.56,
        targetLift: 0.22,
        worldScale: 104,
        yawOffset: 0,
    },
};

const TD_MAGE_PROJECTILE_DEFINITIONS: Record<MageTowerElement, TdProjectileDefinition> = {
    air: {
        kind: "mage",
        element: "air",
        source: "spotanim",
        spotAnimId: 118,
        arcHeight: 0.28,
        sourceLift: 0.98,
        targetLift: 0.58,
        worldScale: 176,
        yawOffset: 0,
    },
    water: {
        kind: "mage",
        element: "water",
        source: "spotanim",
        spotAnimId: 121,
        arcHeight: 0.27,
        sourceLift: 0.98,
        targetLift: 0.58,
        worldScale: 176,
        yawOffset: 0,
    },
    earth: {
        kind: "mage",
        element: "earth",
        source: "spotanim",
        spotAnimId: 124,
        arcHeight: 0.24,
        sourceLift: 0.94,
        targetLift: 0.54,
        worldScale: 176,
        yawOffset: 0,
    },
    fire: {
        kind: "mage",
        element: "fire",
        source: "spotanim",
        spotAnimId: 127,
        arcHeight: 0.3,
        sourceLift: 1.02,
        targetLift: 0.6,
        worldScale: 176,
        yawOffset: 0,
    },
};

export function getTdProjectileDefinition(
    projectile: Pick<Projectile, "kind" | "element">,
): TdProjectileDefinition {
    if (projectile.kind === "mage") {
        return TD_MAGE_PROJECTILE_DEFINITIONS[projectile.element ?? "air"];
    }
    return TD_PROJECTILE_DEFINITIONS[projectile.kind];
}

export class TdProjectileModelCache {
    private readonly objModelLoader: ObjModelLoader;
    private readonly spotAnimModelLoader: SpotAnimModelLoader;
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

    getModel(
        projectile: Pick<Projectile, "kind" | "element">,
        elapsedMs: number,
        durationMs: number,
    ): Model | undefined {
        const definition = getTdProjectileDefinition(projectile);
        const baseModel =
            definition.source === "obj"
                ? this.getObjectModel(definition)
                : this.getSpotAnimModel(definition, elapsedMs, durationMs);
        if (!baseModel) {
            return undefined;
        }

        const model = Model.copyAnimated(baseModel, true, true);
        if (definition.worldScale !== 128) {
            model.scale(definition.worldScale, definition.worldScale, definition.worldScale);
        }
        return model;
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
            const lowered = this.mapViewer.objTypeLoader.load(objId).name.toLowerCase();
            if (names.some((name) => lowered.includes(name.toLowerCase()))) {
                return objId;
            }
        }

        return undefined;
    }

    private getObjectModel(definition: TdProjectileDefinition): Model | undefined {
        const objId = definition.objNames ? this.findObjId(definition.objNames) : undefined;
        if (objId === undefined) {
            return undefined;
        }
        return this.objModelLoader.getModel(objId, 1);
    }

    private getSpotAnimModel(
        definition: TdProjectileDefinition,
        elapsedMs: number,
        durationMs: number,
    ): Model | undefined {
        if (definition.spotAnimId === undefined) {
            return undefined;
        }
        const frame = this.getSpotAnimFrame(definition.spotAnimId, elapsedMs, durationMs);
        return this.spotAnimModelLoader.getModel(definition.spotAnimId, frame);
    }

    private getSpotAnimFrame(spotAnimId: number, elapsedMs: number, durationMs: number): number {
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

        let targetTick = ((elapsedMs / Math.max(1, durationMs)) * totalTicks) | 0;
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
