import { Model } from "../../model/Model";
import { ModelLoader } from "../../model/ModelLoader";
import { SeqFrameLoader } from "../../model/seq/SeqFrameLoader";
import { SkeletalSeqLoader } from "../../model/skeletal/SkeletalSeqLoader";
import { TextureLoader } from "../../texture/TextureLoader";
import { SeqType } from "../seqtype/SeqType";
import { SeqTypeLoader } from "../seqtype/SeqTypeLoader";
import { SpotAnimTypeLoader } from "./SpotAnimTypeLoader";

export class SpotAnimModelLoader {
    modelCache: Map<number, Model> = new Map();

    constructor(
        readonly spotAnimTypeLoader: SpotAnimTypeLoader,
        readonly modelLoader: ModelLoader,
        readonly textureLoader: TextureLoader,
        readonly seqTypeLoader: SeqTypeLoader,
        readonly seqFrameLoader: SeqFrameLoader,
        readonly skeletalSeqLoader: SkeletalSeqLoader | undefined,
    ) {}

    getModel(id: number, frame: number = -1): Model | undefined {
        const spotAnim = this.spotAnimTypeLoader.load(id);
        if (spotAnim.modelId === undefined || spotAnim.modelId < 0) {
            return undefined;
        }

        let model = this.modelCache.get(id);
        if (!model) {
            const modelData = this.modelLoader.getModel(spotAnim.modelId);
            if (!modelData) {
                return undefined;
            }

            if (spotAnim.recolorFrom) {
                for (let i = 0; i < spotAnim.recolorFrom.length; i++) {
                    modelData.recolor(spotAnim.recolorFrom[i], spotAnim.recolorTo[i]);
                }
            }

            if (spotAnim.retextureFrom) {
                for (let i = 0; i < spotAnim.retextureFrom.length; i++) {
                    modelData.retexture(spotAnim.retextureFrom[i], spotAnim.retextureTo[i]);
                }
            }

            model = modelData.light(
                this.textureLoader,
                spotAnim.ambient + 64,
                spotAnim.contrast + 850,
                -30,
                -50,
                -30,
            );
            this.modelCache.set(id, model);
        }

        const hasScale = spotAnim.widthScale !== 128 || spotAnim.heightScale !== 128;
        const seqId = spotAnim.sequenceId;

        if (seqId !== -1 && frame !== -1) {
            const seqType = this.seqTypeLoader.load(seqId);
            model = this.transformSpotAnimModel(model, seqType, frame);
        } else if (hasScale || spotAnim.orientation !== 0) {
            model = Model.copyAnimated(model, true, true);
        }

        if (hasScale) {
            model.scale(spotAnim.widthScale, spotAnim.heightScale, spotAnim.widthScale);
        }

        switch (spotAnim.orientation & 0x3ff) {
            case 90:
                model.rotate90();
                break;
            case 180:
                model.rotate180();
                break;
            case 270:
                model.rotate270();
                break;
        }

        return model;
    }

    transformSpotAnimModel(model: Model, seqType: SeqType, frame: number): Model {
        if (seqType.isSkeletalSeq()) {
            const skeletalSeq = this.skeletalSeqLoader?.load(seqType.skeletalId);
            if (!skeletalSeq) {
                return Model.copyAnimated(model, true, true);
            }
            model = Model.copyAnimated(model, !skeletalSeq.hasAlphaTransform, true);
            model.animateSkeletal(skeletalSeq, frame);
            return model;
        }

        if (!seqType.frameIds || seqType.frameIds.length === 0) {
            return Model.copyAnimated(model, true, true);
        }

        const boundedFrame = Math.max(0, Math.min(frame, seqType.frameIds.length - 1));
        const seqFrame = this.seqFrameLoader.load(seqType.frameIds[boundedFrame]);
        if (!seqFrame) {
            return Model.copyAnimated(model, true, true);
        }

        model = Model.copyAnimated(
            model,
            !seqFrame.hasAlphaTransform,
            !seqFrame.hasColorTransform,
        );
        model.animate(seqFrame, undefined, seqType.op14);
        return model;
    }

    clearCache(): void {
        this.modelCache.clear();
    }
}
