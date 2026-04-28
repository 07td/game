import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { NpcModelLoader } from "../../src/rs/config/npctype/NpcModelLoader";
import { VarManager } from "../../src/rs/config/vartype/VarManager";
import { LUMBRIDGE_TD_ENEMY_ARCHETYPES } from "../../src/towerdefense/lumbridgeTdEnemies";
import { loadCache, loadCacheInfos, loadCacheList } from "./load-util";

const caches = loadCacheInfos();
const cacheList = loadCacheList(caches);
const cacheInfo = cacheList.latest;
const loadedCache = loadCache(cacheInfo);
const cacheSystem = CacheSystem.fromFiles(loadedCache.type, loadedCache.files);
const loaderFactory = getCacheLoaderFactory(cacheInfo, cacheSystem);

const npcTypeLoader = loaderFactory.getNpcTypeLoader();
const modelLoader = loaderFactory.getModelLoader();
const textureLoader = loaderFactory.getTextureLoader();
const seqTypeLoader = loaderFactory.getSeqTypeLoader();
const seqFrameLoader = loaderFactory.getSeqFrameLoader();
const skeletalSeqLoader = loaderFactory.getSkeletalSeqLoader();
const varManager = new VarManager(loaderFactory.getVarBitTypeLoader());

const npcModelLoader = new NpcModelLoader(
    npcTypeLoader,
    modelLoader,
    textureLoader,
    seqTypeLoader,
    seqFrameLoader,
    skeletalSeqLoader,
    varManager,
);

for (const archetype of LUMBRIDGE_TD_ENEMY_ARCHETYPES) {
    const attackSeqId = archetype.barricadeAttackSeqId ?? -1;
    const npcType = npcTypeLoader.load(archetype.npcId);
    console.log(`\n${archetype.name} npc=${archetype.npcId} attackSeq=${attackSeqId}`);
    if (attackSeqId === -1) {
        console.log("  no attack seq");
        continue;
    }

    const seqType = seqTypeLoader.load(attackSeqId);
    const frameCount = seqType?.frameIds?.length ?? 0;
    let builtCount = 0;
    const sample: string[] = [];

    for (let i = 0; i < frameCount; i++) {
        const model = npcModelLoader.getModel(npcType, attackSeqId, i);
        if (model) {
            builtCount++;
            if (sample.length < 5) {
                sample.push(`${i}:ok`);
            }
        } else if (sample.length < 5) {
            sample.push(`${i}:x`);
        }
    }

    console.log(`  frames=${frameCount} built=${builtCount} sample=${sample.join(" | ")}`);
}
