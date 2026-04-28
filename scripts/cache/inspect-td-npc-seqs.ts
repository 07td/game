import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { LUMBRIDGE_TD_ENEMY_ARCHETYPES } from "../../src/towerdefense/lumbridgeTdEnemies";
import { loadCache, loadCacheInfos, loadCacheList } from "./load-util";

const caches = loadCacheInfos();
const cacheList = loadCacheList(caches);
const cacheInfo = cacheList.latest;
const loadedCache = loadCache(cacheInfo);
const cacheSystem = CacheSystem.fromFiles(loadedCache.type, loadedCache.files);
const loaderFactory = getCacheLoaderFactory(cacheInfo, cacheSystem);

const npcTypeLoader = loaderFactory.getNpcTypeLoader();
const basTypeLoader = loaderFactory.getBasTypeLoader();
const seqTypeLoader = loaderFactory.getSeqTypeLoader();

function formatSeq(seqId: number): string {
    if (seqId === -1 || seqId === 0xffff || Number.isNaN(seqId)) {
        return "-";
    }
    try {
        const seq = seqTypeLoader.load(seqId);
        return `${seqId} (${seq.frameIds?.length ?? 0}f${seq.looping ? ", loop" : ""})`;
    } catch {
        return `${seqId} (?)`;
    }
}

function logNeighborSeqs(label: string, centerSeqId: number): void {
    if (centerSeqId < 0) {
        return;
    }
    const parts: string[] = [];
    for (let seqId = Math.max(0, centerSeqId - 2); seqId <= centerSeqId + 4; seqId++) {
        try {
            const seq = seqTypeLoader.load(seqId);
            parts.push(`${seqId}:${seq.frameIds?.length ?? 0}${seq.looping ? "L" : ""}`);
        } catch {
            parts.push(`${seqId}:?`);
        }
    }
    console.log(`${label} neighbors ${parts.join(" | ")}`);
}

for (const archetype of LUMBRIDGE_TD_ENEMY_ARCHETYPES) {
    const npcType = npcTypeLoader.load(archetype.npcId);
    const basType = npcType.basTypeId !== -1 ? basTypeLoader.load(npcType.basTypeId) : undefined;

    console.log(`\n${archetype.name} npc=${archetype.npcId} bas=${npcType.basTypeId}`);
    console.log(
        [
            `npc idle=${formatSeq(npcType.idleSeqId)}`,
            `walk=${formatSeq(npcType.walkSeqId)}`,
            `turnL=${formatSeq(npcType.turnLeftSeqId)}`,
            `turnR=${formatSeq(npcType.turnRightSeqId)}`,
            `walkBack=${formatSeq(npcType.walkBackSeqId)}`,
            `walkLeft=${formatSeq(npcType.walkLeftSeqId)}`,
            `walkRight=${formatSeq(npcType.walkRightSeqId)}`,
            `run=${formatSeq(npcType.runSeqId)}`,
            `runBack=${formatSeq(npcType.runBackSeqId)}`,
            `runLeft=${formatSeq(npcType.runLeftSeqId)}`,
            `runRight=${formatSeq(npcType.runRightSeqId)}`,
            `crawl=${formatSeq(npcType.crawlSeqId)}`,
        ].join(" | "),
    );
    logNeighborSeqs("idle", npcType.idleSeqId);
    logNeighborSeqs("walk", npcType.walkSeqId);

    if (!basType) {
        continue;
    }

    console.log(
        [
            `bas idle=${formatSeq(basType.idleSeqId)}`,
            `walk=${formatSeq(basType.walkSeqId)}`,
            `crawl=${formatSeq(basType.crawlSeqId)}`,
            `crawlBack=${formatSeq(basType.crawlBackSeqId)}`,
            `crawlLeft=${formatSeq(basType.crawlLeftSeqId)}`,
            `crawlRight=${formatSeq(basType.crawlRightSeqId)}`,
            `run=${formatSeq(basType.runSeqId)}`,
            `runBack=${formatSeq(basType.runBackSeqId)}`,
            `runLeft=${formatSeq(basType.runLeftSeqId)}`,
            `runRight=${formatSeq(basType.runRightSeqId)}`,
        ].join(" | "),
    );
    console.log(
        [
            `idleLeft=${formatSeq(basType.idleLeftSeqId)}`,
            `idleRight=${formatSeq(basType.idleRightSeqId)}`,
            `walkBack=${formatSeq(basType.walkBackSeqId)}`,
            `walkLeft=${formatSeq(basType.walkLeftSeqId)}`,
            `walkRight=${formatSeq(basType.walkRightSeqId)}`,
            `op43=${formatSeq(basType.op43SeqId)}`,
            `op44=${formatSeq(basType.op44SeqId)}`,
            `op45=${formatSeq(basType.op45SeqId)}`,
            `op46=${formatSeq(basType.op46SeqId)}`,
            `op47=${formatSeq(basType.op47SeqId)}`,
            `op48=${formatSeq(basType.op48SeqId)}`,
            `op49=${formatSeq(basType.op49SeqId)}`,
            `op50=${formatSeq(basType.op50SeqId)}`,
            `op51=${formatSeq(basType.op51SeqId)}`,
        ].join(" | "),
    );
}
