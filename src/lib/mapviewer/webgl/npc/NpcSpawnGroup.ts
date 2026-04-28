import { NpcSpawn } from "../../data/npc/NpcSpawn";
import { AnimationFrames } from "../AnimationFrames";

export type NpcSpawnGroup = {
    idleAnim: AnimationFrames;
    walkAnim: AnimationFrames | undefined;
    attackAnim?: AnimationFrames;
    attackSeqId?: number;
    spawns: NpcSpawn[];
};
