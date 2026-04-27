import Denque from "denque";
import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { folder } from "leva";
import { Schema } from "leva/dist/declarations/src/types";
import {
    DrawCall,
    Framebuffer,
    App as PicoApp,
    PicoGL,
    Program,
    Renderbuffer,
    Texture,
    Timer,
    UniformBuffer,
    VertexArray,
    VertexBuffer,
} from "picogl";

import { OsrsMenuEntry } from "../../components/rs/menu/OsrsMenu";
import { createTextureArray } from "../../picogl/PicoTexture";
import { MenuTargetType } from "../../rs/MenuEntry";
import { LocModelLoader } from "../../rs/config/loctype/LocModelLoader";
import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { Model } from "../../rs/model/Model";
import { Scene } from "../../rs/scene/Scene";
import { isTouchDevice, isWebGL2Supported, pixelRatio } from "../../util/DeviceUtil";
import { MapViewer } from "../MapViewer";
import { MapViewerRenderer } from "../MapViewerRenderer";
import { MapViewerRendererType, WEBGL } from "../MapViewerRenderers";
import {
    LUMBRIDGE_TD_ENEMY_REMOVED,
    LUMBRIDGE_TD_ENEMY_SELECTED,
    LUMBRIDGE_TD_ENEMY_SPAWNED,
    LUMBRIDGE_TD_ENEMY_UPDATED,
    LUMBRIDGE_TD_RESET,
    LUMBRIDGE_TD_START_WAVE,
    LUMBRIDGE_TD_TOWERS_CHANGED,
    LumbridgeTdEnemySpawnDetail,
    LumbridgeTdEnemyUpdateDetail,
    LumbridgeTdTowerState,
} from "../td/lumbridgeTdEvents";
import {
    LUMBRIDGE_TD_MAP_X,
    LUMBRIDGE_TD_MAP_Y,
    LUMBRIDGE_TD_ROUTE_CHANGED,
    LumbridgeTdRoutePoint,
    getLumbridgeTdRoute,
} from "../td/lumbridgeTdRoute";
import { AnimationFrames } from "./AnimationFrames";
import { DrawRange, NULL_DRAW_RANGE } from "./DrawRange";
import { InteractType } from "./InteractType";
import { Interactions } from "./Interactions";
import { WebGLMapSquare } from "./WebGLMapSquare";
import {
    ContourGroundType,
    DrawCommand,
    SceneBuffer,
    SceneModel,
    createModelInfoTextureData,
} from "./buffer/SceneBuffer";
import { SdMapData } from "./loader/SdMapData";
import { SdMapDataLoader } from "./loader/SdMapDataLoader";
import { SdMapLoaderInput } from "./loader/SdMapLoaderInput";
import { Npc } from "./npc/Npc";
import {
    FRAME_FXAA_PROGRAM,
    FRAME_PROGRAM,
    TD_ROUTE_PROGRAM,
    createMainProgram,
    createNpcProgram,
} from "./shaders/Shaders";

const MAX_TEXTURES = 2048;
const TEXTURE_SIZE = 128;

const INTERACT_BUFFER_COUNT = 2;
const INTERACTION_RADIUS = 5;

const TD_TOWER_LOC_IDS: Record<string, number> = {
    bolt: 1939,
    cannon: 1939,
    mage: 1939,
};
interface ColorRgb {
    r: number;
    g: number;
    b: number;
}

enum TextureFilterMode {
    DISABLED,
    BILINEAR,
    TRILINEAR,
    ANISOTROPIC_2X,
    ANISOTROPIC_4X,
    ANISOTROPIC_8X,
    ANISOTROPIC_16X,
}

function getMaxAnisotropy(mode: TextureFilterMode): number {
    switch (mode) {
        case TextureFilterMode.ANISOTROPIC_2X:
            return 2;
        case TextureFilterMode.ANISOTROPIC_4X:
            return 4;
        case TextureFilterMode.ANISOTROPIC_8X:
            return 8;
        case TextureFilterMode.ANISOTROPIC_16X:
            return 16;
        default:
            return 1;
    }
}

function optimizeAssumingFlatsHaveSameFirstAndLastData(gl: WebGL2RenderingContext) {
    const epv = gl.getExtension("WEBGL_provoking_vertex");
    if (epv) {
        epv.provokingVertexWEBGL(epv.FIRST_VERTEX_CONVENTION_WEBGL);
    }
}

export class WebGLMapViewerRenderer extends MapViewerRenderer<WebGLMapSquare> {
    type: MapViewerRendererType = WEBGL;

    dataLoader = new SdMapDataLoader();

    app!: PicoApp;
    gl!: WebGL2RenderingContext;

    timer!: Timer;

    hasMultiDraw: boolean = false;

    quadPositions?: VertexBuffer;
    quadArray?: VertexArray;

    // Shaders
    shadersPromise?: Promise<Program[]>;
    mainProgram?: Program;
    mainAlphaProgram?: Program;
    npcProgram?: Program;
    tdRouteProgram?: Program;
    tdCannonProgram?: Program;
    frameProgram?: Program;
    frameFxaaProgram?: Program;

    // Uniforms
    sceneUniformBuffer?: UniformBuffer;

    cameraPosUni: vec2 = vec2.fromValues(0, 0);
    resolutionUni: vec2 = vec2.fromValues(0, 0);

    // Framebuffers
    needsFramebufferUpdate: boolean = false;

    colorTarget?: Renderbuffer;
    interactTarget?: Renderbuffer;
    depthTarget?: Renderbuffer;
    framebuffer?: Framebuffer;

    textureColorTarget?: Texture;
    textureFramebuffer?: Framebuffer;

    interactColorTarget?: Texture;
    interactFramebuffer?: Framebuffer;

    // Textures
    textureFilterMode: TextureFilterMode = TextureFilterMode.ANISOTROPIC_16X;

    textureArray?: Texture;
    textureMaterials?: Texture;

    textureIds: number[] = [];
    loadedTextureIds: Set<number> = new Set();

    mapsToLoad: Denque<SdMapData> = new Denque();

    frameDrawCall?: DrawCall;
    frameFxaaDrawCall?: DrawCall;

    // Settings
    maxLevel: number = Scene.MAX_LEVELS - 1;

    skyColor: vec4 = vec4.fromValues(0, 0, 0, 1);
    fogDepth: number = 16;

    brightness: number = 1.0;
    colorBanding: number = 255;

    smoothTerrain: boolean = false;

    cullBackFace: boolean = true;

    msaaEnabled: boolean = false;
    fxaaEnabled: boolean = false;

    loadObjs: boolean = true;
    loadNpcs: boolean = true;

    // State
    lastClientTick: number = 0;
    lastTick: number = 0;

    interactions: Interactions[];
    hoveredMapIds: Set<number> = new Set();
    closestInteractIndices: Map<number, number[]> = new Map();
    interactBuffer?: Float32Array;

    npcRenderCount: number = 0;
    npcRenderData: Uint16Array = new Uint16Array(16 * 4);

    npcDataTextureBuffer: (Texture | undefined)[] = new Array(5);
    tdPendingSpawnCount: number = 0;
    tdEnemies: Map<string, LumbridgeTdEnemySpawnDetail> = new Map();
    tdRoutePositions?: VertexBuffer;
    tdRouteArray?: VertexArray;
    tdRouteDrawCall?: DrawCall;
    tdRouteVertexCount: number = 0;
    tdRouteDirty: boolean = true;
    tdCannonModel?: Model;
    tdTowerLocModelLoader?: LocModelLoader;
    tdCannonInterleavedBuffer?: VertexBuffer;
    tdCannonIndexBuffer?: any;
    tdCannonModelInfoTexture?: Texture;
    tdCannonVertexArray?: VertexArray;
    tdCannonIndexCount: number = 0;
    tdCannonDrawCall?: DrawCall;
    tdCannonGroundOffset: number = 0;
    tdCannonDirty: boolean = true;
    tdCannonPlacements: Array<{
        padId: string;
        world: vec3;
        kind: string;
        rotation: number;
    }> = [];

    constructor(public mapViewer: MapViewer) {
        super(mapViewer);
        this.interactions = new Array(INTERACT_BUFFER_COUNT);
        for (let i = 0; i < INTERACT_BUFFER_COUNT; i++) {
            this.interactions[i] = new Interactions(INTERACTION_RADIUS);
        }
    }

    static isSupported(): boolean {
        return isWebGL2Supported;
    }

    async init(): Promise<void> {
        await super.init();
        window.addEventListener(LUMBRIDGE_TD_START_WAVE, this.onTdStartWave as EventListener);
        window.addEventListener(LUMBRIDGE_TD_RESET, this.onTdReset);
        window.addEventListener(LUMBRIDGE_TD_ROUTE_CHANGED, this.onTdRouteChanged as EventListener);
        window.addEventListener(
            LUMBRIDGE_TD_TOWERS_CHANGED,
            this.onTdTowersChanged as EventListener,
        );
        window.addEventListener(LUMBRIDGE_TD_ENEMY_SPAWNED, this.onTdEnemySpawned as EventListener);
        window.addEventListener(LUMBRIDGE_TD_ENEMY_UPDATED, this.onTdEnemyUpdated as EventListener);
        window.addEventListener(LUMBRIDGE_TD_ENEMY_REMOVED, this.onTdEnemyRemoved as EventListener);

        this.app = PicoGL.createApp(this.canvas);
        this.gl = this.app.gl as WebGL2RenderingContext;

        // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_webgl_provoking_vertex_when_its_available
        optimizeAssumingFlatsHaveSameFirstAndLastData(this.gl);

        this.timer = this.app.createTimer();

        // hack to get the right multi draw extension for picogl
        const state: any = this.app.state;
        const ext = this.gl.getExtension("WEBGL_multi_draw");
        PicoGL.WEBGL_INFO.MULTI_DRAW_INSTANCED = ext;
        state.extensions.multiDrawInstanced = ext;

        this.hasMultiDraw = !!PicoGL.WEBGL_INFO.MULTI_DRAW_INSTANCED;

        this.mapViewer.workerPool.initLoader(this.dataLoader);

        this.gl.getExtension("EXT_float_blend");

        this.app.enable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.DEPTH_TEST);
        this.app.depthFunc(PicoGL.LEQUAL);
        this.app.enable(PicoGL.BLEND);
        this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);
        this.app.clearColor(0.0, 0.0, 0.0, 1.0);

        this.quadPositions = this.app.createVertexBuffer(
            PicoGL.FLOAT,
            2,
            new Float32Array([-1, 1, -1, -1, 1, -1, -1, 1, 1, -1, 1, 1]),
        );
        this.quadArray = this.app.createVertexArray().vertexAttributeBuffer(0, this.quadPositions);

        this.shadersPromise = this.initShaders();

        this.sceneUniformBuffer = this.app.createUniformBuffer([
            PicoGL.FLOAT_MAT4, // mat4 u_viewProjMatrix;
            PicoGL.FLOAT_MAT4, // mat4 u_viewMatrix;
            PicoGL.FLOAT_MAT4, // mat4 u_projectionMatrix;
            PicoGL.FLOAT_VEC4, // vec4 u_skyColor;
            PicoGL.FLOAT_VEC2, // vec2 u_cameraPos;
            PicoGL.FLOAT, // float u_renderDistance;
            PicoGL.FLOAT, // float u_fogDepth;
            PicoGL.FLOAT, // float u_currentTime;
            PicoGL.FLOAT, // float u_brightness;
            PicoGL.FLOAT, // float u_colorBanding;
            PicoGL.FLOAT, // float u_isNewTextureAnim;
        ]);

        this.initFramebuffers();

        this.initTextures();

        console.log("Renderer init");
    }

    onTdStartWave = (event: CustomEvent<{ enemyCount: number }>) => {
        // Disable old wave-based spawning - we now use individual enemy spawn events
        // this.tdPendingSpawnCount = event.detail.enemyCount;
    };

    onTdReset = () => {
        this.tdPendingSpawnCount = 0;
        this.tdEnemies.clear();
        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            this.resetTdEnemies(this.mapManager.visibleMaps[i]);
        }
    };

    onTdEnemySpawned = (event: CustomEvent<LumbridgeTdEnemySpawnDetail>) => {
        const enemy = event.detail;
        this.tdEnemies.set(enemy.id, { ...enemy });

        // Spawn the actual NPC in the map
        const tdMap = this.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
        if (tdMap) {
            if (!this.spawnTdNpc(tdMap, enemy)) {
                this.reloadTdMapForNpcPool(tdMap, enemy.npcId);
            }
        }
    };

    onTdEnemyUpdated = (event: CustomEvent<LumbridgeTdEnemyUpdateDetail>) => {
        const update = event.detail;
        const enemy = this.tdEnemies.get(update.id);
        if (enemy) {
            enemy.x = update.x;
            enemy.y = update.y;
            enemy.hp = update.hp;
            enemy.maxHp = update.maxHp;

            // Update the NPC position in the map
            const tdMap = this.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
            if (tdMap) {
                this.updateTdNpcPosition(tdMap, update);
            }
        }
    };

    onTdEnemyRemoved = (event: CustomEvent<{ id: string }>) => {
        const enemyId = event.detail.id;
        this.tdEnemies.delete(enemyId);

        // Remove the NPC from the map
        const tdMap = this.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
        if (tdMap) {
            this.removeTdNpc(tdMap, enemyId);
        }
    };

    onTdRouteChanged = (event: CustomEvent<LumbridgeTdRoutePoint[]>) => {
        const route = event.detail;
        const tdMap = this.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
        this.tdRouteDirty = true;
        if (!tdMap) {
            return;
        }
        for (const npc of tdMap.npcs) {
            if (!npc.tdRoute) {
                continue;
            }
            npc.tdRoute = route.map((point) => ({ ...point }));
        }
        this.resetTdEnemies(tdMap);
    };

    onTdTowersChanged = (event: CustomEvent<LumbridgeTdTowerState>) => {
        this.tdCannonPlacements = event.detail
            .filter((tower) => tower.world && TD_TOWER_LOC_IDS[tower.kind] !== undefined)
            .map((tower) => ({
                padId: tower.padId,
                kind: tower.kind,
                rotation: tower.rotation ?? 0,
                world: vec3.fromValues(tower.world.x, tower.world.y, tower.world.z),
            }));
        this.tdCannonDirty = true;
    };

    async initShaders(): Promise<Program[]> {
        const hasMultiDraw = this.hasMultiDraw;

        const programs = await this.app.createPrograms(
            createMainProgram(hasMultiDraw, false),
            createMainProgram(hasMultiDraw, true),
            createNpcProgram(hasMultiDraw, true),
            TD_ROUTE_PROGRAM,
            FRAME_PROGRAM,
            FRAME_FXAA_PROGRAM,
        );

        const [
            mainProgram,
            mainAlphaProgram,
            npcProgram,
            tdRouteProgram,
            frameProgram,
            frameFxaaProgram,
        ] = programs;
        this.mainProgram = mainProgram;
        this.mainAlphaProgram = mainAlphaProgram;
        this.npcProgram = npcProgram;
        this.tdRouteProgram = tdRouteProgram;
        this.frameProgram = frameProgram;
        this.frameFxaaProgram = frameFxaaProgram;

        this.frameDrawCall = this.app.createDrawCall(frameProgram, this.quadArray);
        this.frameFxaaDrawCall = this.app.createDrawCall(frameFxaaProgram, this.quadArray);

        return programs;
    }

    initFramebuffers(): void {
        this.initFramebuffer();

        this.textureColorTarget = this.app.createTexture2D(this.app.width, this.app.height, {
            minFilter: PicoGL.LINEAR,
            magFilter: PicoGL.LINEAR,
        });
        this.textureFramebuffer = this.app
            .createFramebuffer()
            .colorTarget(0, this.textureColorTarget);

        // Interact
        this.interactColorTarget = this.app.createTexture2D(this.app.width, this.app.height, {
            internalFormat: PicoGL.RGBA32F,
            type: PicoGL.FLOAT,
            minFilter: PicoGL.NEAREST,
            magFilter: PicoGL.NEAREST,
        });
        this.interactFramebuffer = this.app
            .createFramebuffer()
            .colorTarget(0, this.interactColorTarget);
    }

    initFramebuffer(): void {
        this.framebuffer?.delete();
        this.colorTarget?.delete();
        this.interactTarget?.delete();
        this.depthTarget?.delete();

        let samples = 0;
        if (this.msaaEnabled) {
            samples = this.gl.getParameter(PicoGL.MAX_SAMPLES);
        }

        this.colorTarget = this.app.createRenderbuffer(
            this.app.width,
            this.app.height,
            PicoGL.RGBA8,
            samples,
        );
        this.interactTarget = this.app.createRenderbuffer(
            this.app.width,
            this.app.height,
            PicoGL.RGBA32F,
            samples,
        );
        this.depthTarget = this.app.createRenderbuffer(
            this.app.width,
            this.app.height,
            PicoGL.DEPTH_COMPONENT24,
            samples,
        );
        this.framebuffer = this.app
            .createFramebuffer()
            .colorTarget(0, this.colorTarget)
            .colorTarget(1, this.interactTarget)
            .depthTarget(this.depthTarget);

        this.needsFramebufferUpdate = false;
    }

    override initCache(): void {
        super.initCache();
        if (this.app) {
            this.initTextures();
        }
        console.log("Renderer initCache", this.app);
    }

    initTextures(): void {
        const textureLoader = this.mapViewer.textureLoader;

        const allTextureIds = textureLoader.getTextureIds();

        this.textureIds = allTextureIds
            .filter((id) => textureLoader.isSd(id))
            .slice(0, MAX_TEXTURES - 1);

        this.initTextureArray();
        this.initMaterialsTexture();

        console.log("init textures", this.textureIds, allTextureIds.length);
    }

    initTextureArray() {
        if (this.textureArray) {
            this.textureArray.delete();
            this.textureArray = undefined;
        }
        this.loadedTextureIds.clear();

        console.time("load textures");

        const pixelCount = TEXTURE_SIZE * TEXTURE_SIZE;

        const textureCount = this.textureIds.length;
        const pixels = new Int32Array((textureCount + 1) * pixelCount);

        // White texture
        pixels.fill(0xffffffff, 0, pixelCount);

        const cacheInfo = this.mapViewer.loadedCache.info;

        let maxPreloadTextures = textureCount;
        // we should check if the texture loader is procedural instead
        if (cacheInfo.game === "runescape" && cacheInfo.revision >= 508) {
            maxPreloadTextures = 64;
        }

        for (let i = 0; i < Math.min(textureCount, maxPreloadTextures); i++) {
            const textureId = this.textureIds[i];
            try {
                const texturePixels = this.mapViewer.textureLoader.getPixelsArgb(
                    textureId,
                    TEXTURE_SIZE,
                    true,
                    1.0,
                );
                pixels.set(texturePixels, (i + 1) * pixelCount);
            } catch (e) {
                console.error("Failed loading texture", textureId, e);
            }
            this.loadedTextureIds.add(textureId);
        }

        this.textureArray = createTextureArray(
            this.app,
            new Uint8Array(pixels.buffer),
            TEXTURE_SIZE,
            TEXTURE_SIZE,
            textureCount + 1,
            {},
        );

        this.updateTextureFiltering();

        console.timeEnd("load textures");
    }

    updateTextureFiltering(): void {
        if (!this.textureArray) {
            throw new Error("Texture array is not initialized");
        }

        this.textureArray.bind(0);

        if (this.textureFilterMode === TextureFilterMode.DISABLED) {
            this.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MIN_FILTER,
                PicoGL.NEAREST,
            );
            this.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MAG_FILTER,
                PicoGL.NEAREST,
            );
        } else if (this.textureFilterMode === TextureFilterMode.BILINEAR) {
            this.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MIN_FILTER,
                PicoGL.LINEAR_MIPMAP_NEAREST,
            );
            this.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MAG_FILTER,
                PicoGL.LINEAR,
            );
        } else {
            this.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MIN_FILTER,
                PicoGL.LINEAR_MIPMAP_LINEAR,
            );
            this.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MAG_FILTER,
                PicoGL.LINEAR,
            );
        }

        const maxAnisotropy = Math.min(
            getMaxAnisotropy(this.textureFilterMode),
            PicoGL.WEBGL_INFO.MAX_TEXTURE_ANISOTROPY,
        );

        this.gl.texParameteri(
            PicoGL.TEXTURE_2D_ARRAY,
            PicoGL.TEXTURE_MAX_ANISOTROPY_EXT,
            maxAnisotropy,
        );
    }

    updateTextureArray(textures: Map<number, Int32Array>): void {
        if (!this.textureArray) {
            throw new Error("Texture array is not initialized");
        }
        let updatedCount = 0;
        for (const [id, pixels] of textures) {
            if (this.loadedTextureIds.has(id)) {
                continue;
            }
            const index = this.textureIds.indexOf(id) + 1;

            this.textureArray.bind(0);
            this.gl.texSubImage3D(
                PicoGL.TEXTURE_2D_ARRAY,
                0,
                0,
                0,
                index,
                TEXTURE_SIZE,
                TEXTURE_SIZE,
                1,
                PicoGL.RGBA,
                PicoGL.UNSIGNED_BYTE,
                new Uint8Array(pixels.buffer),
            );
            this.loadedTextureIds.add(id);
            updatedCount++;
        }
        if (updatedCount > 0) {
            this.gl.generateMipmap(PicoGL.TEXTURE_2D_ARRAY);
        }
    }

    initMaterialsTexture(): void {
        if (this.textureMaterials) {
            this.textureMaterials.delete();
            this.textureMaterials = undefined;
        }

        const textureCount = this.textureIds.length + 1;

        const data = new Int8Array(textureCount * 4);
        for (let i = 0; i < this.textureIds.length; i++) {
            const id = this.textureIds[i];
            try {
                const material = this.mapViewer.textureLoader.getMaterial(id);

                const index = (i + 1) * 4;
                data[index] = material.animU;
                data[index + 1] = material.animV;
                data[index + 2] = material.alphaCutOff * 255;
            } catch (e) {
                console.error("Failed loading texture", id, e);
            }
        }

        this.textureMaterials = this.app.createTexture2D(data, textureCount, 1, {
            minFilter: PicoGL.NEAREST,
            magFilter: PicoGL.NEAREST,
            internalFormat: PicoGL.RGBA8I,
        });
    }

    getControls(): Schema {
        return {
            "Max Level": {
                value: this.maxLevel,
                min: 0,
                max: 3,
                step: 1,
                onChange: (v: number) => {
                    this.setMaxLevel(v);
                },
            },
            Sky: {
                r: this.skyColor[0] * 255,
                g: this.skyColor[1] * 255,
                b: this.skyColor[2] * 255,
                onChange: (v: ColorRgb) => {
                    this.setSkyColor(v.r, v.g, v.b);
                },
            },
            "Fog Depth": {
                value: this.fogDepth,
                min: 0,
                max: 256,
                step: 8,
                onChange: (v: number) => {
                    this.fogDepth = v;
                },
            },
            Brightness: {
                value: 1,
                min: 0,
                max: 4,
                step: 1,
                onChange: (v: number) => {
                    this.brightness = 1.0 - v * 0.1;
                },
            },
            "Color Banding": {
                value: 50,
                min: 0,
                max: 100,
                step: 1,
                onChange: (v: number) => {
                    this.colorBanding = 255 - v * 2;
                },
            },
            "Texture Filtering": {
                value: this.textureFilterMode,
                options: {
                    Disabled: TextureFilterMode.DISABLED,
                    Bilinear: TextureFilterMode.BILINEAR,
                    Trilinear: TextureFilterMode.TRILINEAR,
                    "Anisotropic 2x": TextureFilterMode.ANISOTROPIC_2X,
                    "Anisotropic 4x": TextureFilterMode.ANISOTROPIC_4X,
                    "Anisotropic 8x": TextureFilterMode.ANISOTROPIC_8X,
                    "Anisotropic 16x": TextureFilterMode.ANISOTROPIC_16X,
                },
                onChange: (v: TextureFilterMode) => {
                    if (v === this.textureFilterMode) {
                        return;
                    }
                    this.textureFilterMode = v;
                    this.updateTextureFiltering();
                },
            },
            "Smooth Terrain": {
                value: this.smoothTerrain,
                onChange: (v: boolean) => {
                    this.setSmoothTerrain(v);
                },
            },
            "Cull Back-faces": {
                value: this.cullBackFace,
                onChange: (v: boolean) => {
                    this.cullBackFace = v;
                },
            },
            "Anti-Aliasing": folder(
                {
                    MSAA: {
                        value: this.msaaEnabled,
                        onChange: (v: boolean) => {
                            this.setMsaa(v);
                        },
                    },
                    FXAA: {
                        value: this.fxaaEnabled,
                        onChange: (v: boolean) => {
                            this.setFxaa(v);
                        },
                    },
                },
                { collapsed: true },
            ),
            Entity: folder(
                {
                    Items: {
                        value: this.loadObjs,
                        onChange: (v: boolean) => {
                            this.setLoadObjs(v);
                        },
                    },
                    Npcs: {
                        value: this.loadNpcs,
                        onChange: (v: boolean) => {
                            this.setLoadNpcs(v);
                        },
                    },
                },
                { collapsed: true },
            ),
        };
    }

    override async queueLoadMap(mapX: number, mapY: number): Promise<void> {
        const mapData = await this.mapViewer.workerPool.queueLoad<
            SdMapLoaderInput,
            SdMapData | undefined,
            SdMapDataLoader
        >(this.dataLoader, {
            mapX,
            mapY,
            maxLevel: this.maxLevel,
            loadObjs: this.loadObjs,
            loadNpcs: this.loadNpcs,
            tdOnlyNpcs: this.mapViewer.pinnedView,
            smoothTerrain: this.smoothTerrain,
            minimizeDrawCalls: !this.hasMultiDraw,
            loadedTextureIds: this.loadedTextureIds,
        });

        if (mapData) {
            if (this.isValidMapData(mapData)) {
                this.mapsToLoad.push(mapData);
            }
        } else {
            this.mapManager.addInvalidMap(mapX, mapY);
        }
    }

    loadMap(
        mainProgram: Program,
        mainAlphaProgram: Program,
        npcProgram: Program,
        textureArray: Texture,
        textureMaterials: Texture,
        sceneUniformBuffer: UniformBuffer,
        mapData: SdMapData,
        time: number,
    ): void {
        const { mapX, mapY } = mapData;

        this.mapViewer.setMapImageUrl(
            mapX,
            mapY,
            URL.createObjectURL(mapData.minimapBlob),
            true,
            false,
        );

        const frameCount = this.stats.frameCount;
        const mapSquare = WebGLMapSquare.load(
            this.mapViewer.seqTypeLoader,
            this.mapViewer.npcTypeLoader,
            this.mapViewer.basTypeLoader,
            this.app,
            mainProgram,
            mainAlphaProgram,
            npcProgram,
            textureArray,
            textureMaterials,
            sceneUniformBuffer,
            mapData,
            time,
            frameCount,
        );
        this.mapManager.addMap(mapX, mapY, mapSquare);

        if (mapX === LUMBRIDGE_TD_MAP_X && mapY === LUMBRIDGE_TD_MAP_Y) {
            this.resetTdEnemies(mapSquare);
            for (const enemy of this.tdEnemies.values()) {
                this.spawnTdNpc(mapSquare, enemy);
            }
        }

        this.updateTextureArray(mapData.loadedTextures);
    }

    isValidMapData(mapData: SdMapData): boolean {
        return (
            mapData.cacheName === this.mapViewer.loadedCache.info.name &&
            mapData.maxLevel === this.maxLevel &&
            mapData.loadObjs === this.loadObjs &&
            mapData.loadNpcs === this.loadNpcs &&
            mapData.tdOnlyNpcs === this.mapViewer.pinnedView &&
            mapData.smoothTerrain === this.smoothTerrain
        );
    }

    clearMaps(): void {
        this.mapManager.cleanUp();
        this.mapsToLoad.clear();
    }

    setMaxLevel(maxLevel: number): void {
        const updated = this.maxLevel !== maxLevel;
        this.maxLevel = maxLevel;
        if (updated) {
            this.clearMaps();
        }
    }

    setSkyColor(r: number, g: number, b: number) {
        this.skyColor[0] = r / 255;
        this.skyColor[1] = g / 255;
        this.skyColor[2] = b / 255;
    }

    setSmoothTerrain(enabled: boolean): void {
        const updated = this.smoothTerrain !== enabled;
        this.smoothTerrain = enabled;
        if (updated) {
            this.clearMaps();
        }
    }

    setMsaa(enabled: boolean): void {
        const updated = this.msaaEnabled !== enabled;
        this.msaaEnabled = enabled;
        if (updated) {
            this.needsFramebufferUpdate = true;
        }
    }

    setFxaa(enabled: boolean): void {
        this.fxaaEnabled = enabled;
    }

    setLoadObjs(enabled: boolean): void {
        const updated = this.loadObjs !== enabled;
        this.loadObjs = enabled;
        if (updated) {
            this.clearMaps();
        }
    }

    setLoadNpcs(enabled: boolean): void {
        const updated = this.loadNpcs !== enabled;
        this.loadNpcs = enabled;
        if (updated) {
            this.clearMaps();
        }
    }

    override onResize(width: number, height: number): void {
        this.app.resize(width, height);
    }

    override render(time: number, deltaTime: number, resized: boolean): void {
        const showDebugTimer = this.mapViewer.inputManager.isKeyDown("KeyY");

        if (showDebugTimer) {
            this.timer.start();
        }

        const frameCount = this.stats.frameCount;

        const timeSec = time / 1000;

        const tick = Math.floor(timeSec / 0.6);
        const ticksElapsed = Math.min(tick - this.lastTick, 1);
        if (ticksElapsed > 0) {
            this.lastTick = tick;
        }

        const clientTick = Math.floor(timeSec / 0.02);
        const clientTicksElapsed = Math.min(clientTick - this.lastClientTick, 50);
        if (clientTicksElapsed > 0) {
            this.lastClientTick = clientTick;
        }

        if (this.needsFramebufferUpdate) {
            this.initFramebuffer();
        }

        if (
            !this.mainProgram ||
            !this.mainAlphaProgram ||
            !this.npcProgram ||
            !this.sceneUniformBuffer ||
            !this.framebuffer ||
            !this.textureFramebuffer ||
            !this.frameDrawCall ||
            !this.interactFramebuffer ||
            !this.textureArray ||
            !this.textureMaterials
        ) {
            return;
        }

        if (resized) {
            this.framebuffer.resize();
            this.textureFramebuffer.resize();
            this.interactFramebuffer.resize();

            this.resolutionUni[0] = this.app.width;
            this.resolutionUni[1] = this.app.height;
        }

        const inputManager = this.mapViewer.inputManager;
        const camera = this.mapViewer.camera;

        this.handleInput(deltaTime);

        camera.update(this.app.width, this.app.height);

        const renderDistance = this.mapViewer.renderDistance;

        const mapManagerStart = performance.now();
        this.mapManager.update(camera, frameCount, renderDistance, this.mapViewer.unloadDistance);
        const mapManagerTime = performance.now() - mapManagerStart;

        this.cameraPosUni[0] = camera.getPosX();
        this.cameraPosUni[1] = camera.getPosZ();

        this.sceneUniformBuffer
            .set(0, camera.viewProjMatrix as Float32Array)
            .set(1, camera.viewMatrix as Float32Array)
            .set(2, camera.projectionMatrix as Float32Array)
            .set(3, this.skyColor as Float32Array)
            .set(4, this.cameraPosUni as Float32Array)
            .set(5, renderDistance as any)
            .set(6, this.fogDepth as any)
            .set(7, timeSec as any)
            .set(8, this.brightness as any)
            .set(9, this.colorBanding as any)
            .set(10, this.mapViewer.isNewTextureAnim as any)
            .update();

        const currInteractions = this.interactions[frameCount % this.interactions.length];

        const interactionsStart = performance.now();
        if (!inputManager.isPointerLock()) {
            this.checkInteractions(currInteractions);
        } else if (this.hoveredMapIds.size > 0) {
            this.hoveredMapIds.clear();
        }
        const interactionsTime = performance.now() - interactionsStart;

        if (this.cullBackFace) {
            this.app.enable(PicoGL.CULL_FACE);
        } else {
            this.app.disable(PicoGL.CULL_FACE);
        }

        this.app.enable(PicoGL.DEPTH_TEST);
        this.app.depthMask(true);

        this.app.drawFramebuffer(this.framebuffer);

        this.app.clearColor(0.0, 0.0, 0.0, 1.0);
        this.app.clear();
        this.gl.clearBufferfv(PicoGL.COLOR, 0, this.skyColor);

        const tickStart = performance.now();
        this.tickPass(timeSec, ticksElapsed, clientTicksElapsed);
        const tickTime = performance.now() - tickStart;

        const npcDataTextureIndex = this.updateNpcDataTexture();
        const npcDataTexture = this.npcDataTextureBuffer[npcDataTextureIndex];

        this.app.disable(PicoGL.BLEND);
        const opaquePassStart = performance.now();
        this.renderOpaquePass();
        const opaquePassTime = performance.now() - opaquePassStart;
        const opaqueNpcPassStart = performance.now();
        this.renderOpaqueNpcPass(npcDataTextureIndex, npcDataTexture);
        const opaqueNpcPassTime = performance.now() - opaqueNpcPassStart;

        const tdCannonPassStart = performance.now();
        this.renderTdCannonPass();
        const tdCannonPassTime = performance.now() - tdCannonPassStart;

        this.app.enable(PicoGL.BLEND);
        const transparentPassStart = performance.now();
        this.renderTransparentPass();
        const transparentPassTime = performance.now() - transparentPassStart;
        const transparentNpcPassStart = performance.now();
        this.renderTransparentNpcPass(npcDataTextureIndex, npcDataTexture);
        const transparentNpcPassTime = performance.now() - transparentNpcPassStart;

        // Can't sample from renderbuffer so blit to a texture for sampling.
        this.app.readFramebuffer(this.framebuffer);

        this.app.drawFramebuffer(this.textureFramebuffer);
        this.gl.readBuffer(PicoGL.COLOR_ATTACHMENT0);
        this.app.blitFramebuffer(PicoGL.COLOR_BUFFER_BIT);

        if (!inputManager.isPointerLock()) {
            const mouseX = inputManager.mouseX;
            const mouseY = inputManager.mouseY;
            if (mouseX !== -1 && mouseY !== -1) {
                if (this.msaaEnabled) {
                    // TODO: reading from the multisampled framebuffer is not accurate
                    this.app.drawFramebuffer(this.interactFramebuffer);
                    this.gl.readBuffer(PicoGL.COLOR_ATTACHMENT1);
                    this.app.blitFramebuffer(PicoGL.COLOR_BUFFER_BIT);

                    this.app.readFramebuffer(this.interactFramebuffer);
                    this.gl.readBuffer(PicoGL.COLOR_ATTACHMENT0);
                } else {
                    this.gl.readBuffer(PicoGL.COLOR_ATTACHMENT1);
                }

                currInteractions.read(
                    this.gl,
                    (mouseX * pixelRatio) | 0,
                    (mouseY * pixelRatio) | 0,
                );
            }
        }

        this.app.disable(PicoGL.DEPTH_TEST);
        this.app.depthMask(false);

        this.app.disable(PicoGL.BLEND);

        this.app.clearMask(PicoGL.COLOR_BUFFER_BIT | PicoGL.DEPTH_BUFFER_BIT);
        this.app.clearColor(0.0, 0.0, 0.0, 1.0);
        this.app.defaultDrawFramebuffer().clear();

        if (this.frameFxaaDrawCall && this.fxaaEnabled) {
            this.frameFxaaDrawCall.uniform("u_resolution", this.resolutionUni);
            this.frameFxaaDrawCall.texture("u_frame", this.textureFramebuffer.colorAttachments[0]);
            this.frameFxaaDrawCall.draw();
        } else {
            this.frameDrawCall.texture("u_frame", this.textureFramebuffer.colorAttachments[0]);
            this.frameDrawCall.draw();
        }

        // Load new map squares
        const mapData = this.mapsToLoad.shift();
        if (mapData && this.isValidMapData(mapData)) {
            this.loadMap(
                this.mainProgram,
                this.mainAlphaProgram,
                this.npcProgram,
                this.textureArray,
                this.textureMaterials,
                this.sceneUniformBuffer,
                mapData,
                timeSec,
            );
        }

        if (showDebugTimer) {
            this.timer.end();
        }

        if (this.mapViewer.inputManager.isKeyDown("KeyH")) {
            this.mapViewer.debugText = `MapManager: ${mapManagerTime.toFixed(2)}ms`;
        }
        if (this.mapViewer.inputManager.isKeyDown("KeyJ")) {
            this.mapViewer.debugText = `Interactions: ${interactionsTime.toFixed(2)}ms`;
        }
        if (this.mapViewer.inputManager.isKeyDown("KeyK")) {
            this.mapViewer.debugText = `Tick: ${tickTime.toFixed(2)}ms`;
        }
        if (this.mapViewer.inputManager.isKeyDown("KeyL")) {
            this.mapViewer.debugText = `Opaque Pass: ${opaquePassTime.toFixed(2)}ms`;
        }
        if (this.mapViewer.inputManager.isKeyDown("KeyB")) {
            this.mapViewer.debugText = `Opaque Npc Pass: ${opaqueNpcPassTime.toFixed(2)}ms`;
        }
        if (this.mapViewer.inputManager.isKeyDown("KeyN")) {
            this.mapViewer.debugText = `Transparent Pass: ${transparentPassTime.toFixed(2)}ms`;
        }
        if (this.mapViewer.inputManager.isKeyDown("KeyM")) {
            this.mapViewer.debugText = `Transparent Npc Pass: ${transparentNpcPassTime.toFixed(
                2,
            )}ms`;
        }

        if (showDebugTimer && this.timer.ready()) {
            this.mapViewer.debugText = `Frame Time GL: ${this.timer.gpuTime.toFixed(
                2,
            )}ms\n JS: ${this.timer.cpuTime.toFixed(2)}ms`;
        }
    }

    tickPass(time: number, ticksElapsed: number, clientTicksElapsed: number): void {
        const cycle = time / 0.02;

        const seqFrameLoader = this.mapViewer.seqFrameLoader;
        const seqTypeLoader = this.mapViewer.seqTypeLoader;

        const pathfinder = this.mapViewer.pathfinder;

        this.npcRenderCount = 0;
        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];
            this.syncTdEnemies(map);

            for (const loc of map.locsAnimated) {
                loc.update(seqFrameLoader, cycle);
            }

            for (let t = 0; t < ticksElapsed; t++) {
                for (const npc of map.npcs) {
                    npc.updateServerMovement(pathfinder, map.borderSize, map.collisionMaps);
                }
            }

            for (let t = 0; t < clientTicksElapsed; t++) {
                for (const npc of map.npcs) {
                    npc.updateMovement(seqTypeLoader, seqFrameLoader);
                }
            }

            this.addNpcRenderData(map);
        }
    }

    addNpcRenderData(map: WebGLMapSquare) {
        const npcs = map.npcs;

        if (npcs.length === 0) {
            return;
        }

        const frameCount = this.stats.frameCount;

        map.npcDataTextureOffsets[frameCount % map.npcDataTextureOffsets.length] =
            this.npcRenderCount;

        const newCount = this.npcRenderCount + npcs.length;

        if (this.npcRenderData.length / 4 < newCount) {
            const newData = new Uint16Array(Math.ceil((newCount * 2) / 16) * 16 * 4);
            newData.set(this.npcRenderData);
            this.npcRenderData = newData;
        }

        for (const npc of npcs) {
            let offset = this.npcRenderCount * 4;

            const tileX = npc.x >> 7;
            const tileY = npc.y >> 7;

            let renderPlane = npc.level;
            if (renderPlane < 3 && (map.getTileRenderFlag(1, tileX, tileY) & 0x2) === 2) {
                renderPlane++;
            }

            this.npcRenderData[offset++] = npc.x;
            this.npcRenderData[offset++] = npc.y;
            this.npcRenderData[offset++] = (npc.rotation << 2) | renderPlane;
            this.npcRenderData[offset++] = npc.npcType.id;

            this.npcRenderCount++;
        }
    }

    syncTdEnemies(map: WebGLMapSquare): void {
        if (map.mapX !== LUMBRIDGE_TD_MAP_X || map.mapY !== LUMBRIDGE_TD_MAP_Y) {
            return;
        }

        if (this.tdPendingSpawnCount <= 0) {
            return;
        }

        this.resetTdEnemies(map);
        const tdNpcs = map.npcs.filter((npc) => npc.tdRoute);
        const spawnCount = Math.min(this.tdPendingSpawnCount, tdNpcs.length);
        for (let i = 0; i < spawnCount; i++) {
            tdNpcs[i].tdCompleted = false;
            tdNpcs[i].tdActive = false;
            tdNpcs[i].tdSpawnDelayTicks = i * 5;
            tdNpcs[i].tdRouteIndex = 0;
            tdNpcs[i].pathLength = 0;
            tdNpcs[i].serverPathLength = 0;
        }
        this.tdPendingSpawnCount = 0;
    }

    spawnTdNpc(map: WebGLMapSquare, enemy: LumbridgeTdEnemySpawnDetail): boolean {
        const availableNpc = map.npcs.find(
            (npc) =>
                npc.tdEnemySlot >= 0 &&
                npc.tdEnemyId === undefined &&
                npc.npcType.id === enemy.npcId,
        );

        if (availableNpc) {
            availableNpc.tdEnemyId = enemy.id;
            availableNpc.tdActive = true;
            availableNpc.tdCompleted = false;
            availableNpc.tdMoveClientTicks = 0;
            this.setTdNpcWorldPosition(map, availableNpc, enemy.x, enemy.y);
            return true;
        } else {
            console.warn(`No available NPC found for enemy type ${enemy.npcId} (${enemy.name})`);
            return false;
        }
    }

    reloadTdMapForNpcPool(map: WebGLMapSquare, npcId: number): void {
        const hasTypedPool = map.npcs.some(
            (npc) => npc.tdEnemySlot >= 0 && npc.npcType.id === npcId,
        );
        if (hasTypedPool) {
            return;
        }
        this.mapManager.removeMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
    }

    updateTdNpcPosition(map: WebGLMapSquare, update: LumbridgeTdEnemyUpdateDetail): void {
        const npc = map.npcs.find((n) => n.tdEnemyId === update.id);
        if (npc) {
            this.setTdNpcWorldPosition(map, npc, update.x, update.y);
        }
    }

    removeTdNpc(map: WebGLMapSquare, enemyId: string): void {
        const npc = map.npcs.find((n) => n.tdEnemyId === enemyId);
        if (npc) {
            npc.tdActive = false;
            npc.tdCompleted = true;
            npc.tdEnemyId = undefined;
            npc.tdMoveClientTicks = 0;

            npc.pathX[0] = npc.spawnX;
            npc.pathY[0] = npc.spawnY;
            npc.x = npc.spawnX * 128 + npc.npcType.size * 64;
            npc.y = npc.spawnY * 128 + npc.npcType.size * 64;
            npc.pathLength = 0;
            npc.serverPathLength = 0;
        }
    }

    resetTdEnemies(map: WebGLMapSquare): void {
        const route = getLumbridgeTdRoute();
        this.tdRouteDirty = true;

        // Reset all TD NPCs to inactive state
        for (const npc of map.npcs) {
            if (npc.tdEnemySlot >= 0) {
                npc.tdActive = false;
                npc.tdCompleted = true;
                npc.tdEnemyId = undefined;
                npc.tdRoute = route.map((point) => ({ ...point }));
                npc.tdSpawnDelayTicks = 0;
                npc.tdRouteIndex = 0;
                npc.tdMoveClientTicks = 0;
                npc.pathLength = 0;
                npc.serverPathLength = 0;

                // Reset position to spawn point
                npc.pathX[0] = npc.spawnX;
                npc.pathY[0] = npc.spawnY;
                npc.x = npc.spawnX * 128 + npc.npcType.size * 64;
                npc.y = npc.spawnY * 128 + npc.npcType.size * 64;
            }
        }
    }

    setTdNpcWorldPosition(map: WebGLMapSquare, npc: Npc, worldX: number, worldY: number): void {
        npc.setTdLocalPosition((worldX - map.mapX * 64) * 128, (worldY - map.mapY * 64) * 128);
    }

    updateTdRouteBuffer(): void {
        const tdMap = this.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
        if (
            !(tdMap instanceof WebGLMapSquare) ||
            !this.tdRouteProgram ||
            !this.sceneUniformBuffer
        ) {
            return;
        }

        const appendQuad = (tileX: number, tileY: number, sizeX: number, sizeY: number) => {
            const worldX = tdMap.mapX * 64 + tileX;
            const worldY = tdMap.mapY * 64 + tileY;

            const h00 = -tdMap.getTileHeight(0, tileX, tileY) / 16 + 0.08;
            const h10 = -tdMap.getTileHeight(0, tileX + sizeX, tileY) / 16 + 0.08;
            const h11 = -tdMap.getTileHeight(0, tileX + sizeX, tileY + sizeY) / 16 + 0.08;
            const h01 = -tdMap.getTileHeight(0, tileX, tileY + sizeY) / 16 + 0.08;

            vertices.push(
                worldX,
                h00,
                worldY,
                worldX + sizeX,
                h10,
                worldY,
                worldX + sizeX,
                h11,
                worldY + sizeY,
                worldX,
                h00,
                worldY,
                worldX + sizeX,
                h11,
                worldY + sizeY,
                worldX,
                h01,
                worldY + sizeY,
            );
        };

        const route = getLumbridgeTdRoute();
        const vertices: number[] = [];
        for (const point of route) {
            appendQuad(point.x, point.y, 1, 1);
        }

        // Temporary debug patch in the castle courtyard to prove the pass is rendering at all.
        appendQuad(29, 14, 6, 6);

        this.tdRouteDrawCall = undefined;
        this.tdRouteArray?.delete();
        this.tdRouteArray = undefined;
        this.tdRoutePositions?.delete();
        this.tdRoutePositions = undefined;

        this.tdRouteVertexCount = vertices.length / 3;
        if (this.tdRouteVertexCount === 0) {
            this.tdRouteDirty = false;
            return;
        }

        this.tdRoutePositions = this.app.createVertexBuffer(
            PicoGL.FLOAT,
            3,
            new Float32Array(vertices),
        );
        this.tdRouteArray = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.tdRoutePositions);
        this.tdRouteDrawCall = this.app
            .createDrawCall(this.tdRouteProgram, this.tdRouteArray)
            .uniformBlock("SceneUniforms", this.sceneUniformBuffer)
            .uniform("u_color", new Float32Array([1.0, 0.33, 0.33, 0.24]));
        this.tdRouteDirty = false;
    }

    renderTdRoutePass(): void {
        if (this.tdRouteDirty) {
            this.updateTdRouteBuffer();
        }
        if (!this.tdRouteDrawCall || this.tdRouteVertexCount === 0) {
            return;
        }

        const color =
            this.tdPendingSpawnCount > 0
                ? new Float32Array([1.0, 0.0, 1.0, 0.62])
                : new Float32Array([1.0, 0.0, 1.0, 0.62]);
        this.app.disable(PicoGL.CULL_FACE);
        this.app.disable(PicoGL.DEPTH_TEST);
        this.app.enable(PicoGL.BLEND);
        this.tdRouteDrawCall.uniform("u_color", color);
        this.tdRouteDrawCall.draw();
        this.app.disable(PicoGL.BLEND);
        this.app.enable(PicoGL.DEPTH_TEST);
        if (this.cullBackFace) {
            this.app.enable(PicoGL.CULL_FACE);
        }
    }

    ensureTdCannonBuffer(): void {
        if (!this.tdCannonDirty) {
            return;
        }

        this.tdCannonDrawCall = undefined;
        this.tdCannonVertexArray?.delete();
        this.tdCannonVertexArray = undefined;
        this.tdCannonIndexBuffer?.delete?.();
        this.tdCannonIndexBuffer = undefined;
        this.tdCannonInterleavedBuffer?.delete();
        this.tdCannonInterleavedBuffer = undefined;
        this.tdCannonModelInfoTexture?.delete();
        this.tdCannonModelInfoTexture = undefined;

        if (!this.mainProgram || !this.sceneUniformBuffer) {
            return;
        }

        if (!this.tdTowerLocModelLoader) {
            this.tdTowerLocModelLoader = new LocModelLoader(
                this.mapViewer.locTypeLoader,
                this.mapViewer.loaderFactory.getModelLoader(),
                this.mapViewer.textureLoader,
                this.mapViewer.seqTypeLoader,
                this.mapViewer.seqFrameLoader,
                this.mapViewer.loaderFactory.getSkeletalSeqLoader(),
            );
        }

        const sceneBuf = new SceneBuffer(this.mapViewer.textureLoader, new Map(), 64);
        const sceneModels: SceneModel[] = [];
        const tdMap = this.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
        if (!(tdMap instanceof WebGLMapSquare)) {
            this.tdCannonDirty = false;
            return;
        }

        this.tdCannonModel = undefined;
        for (const placement of this.tdCannonPlacements) {
            const locId = TD_TOWER_LOC_IDS[placement.kind];
            const locType = this.tdTowerLocModelLoader.locTypeLoader.load(locId);
            const model = this.tdTowerLocModelLoader.getModelAnimated(
                locType,
                LocModelType.NORMAL,
                placement.rotation,
                -1,
                -1,
            );
            if (!model) {
                console.warn(`Unable to load TD tower loc model ${locId} for ${placement.kind}`);
                continue;
            }

            const localX = placement.world[0] - tdMap.mapX * 64;
            const localZ = placement.world[2] - tdMap.mapY * 64;
            sceneModels.push({
                model,
                sceneHeight: placement.world[1] * 128,
                lowDetail: false,
                forceMerge: false,
                sceneX: localX * 128,
                sceneZ: localZ * 128,
                heightOffset: 0,
                level: 0,
                contourGround: ContourGroundType.NONE,
                priority: 10,
                interactType: InteractType.NONE,
                interactId: 0xffff,
            });
            this.tdCannonModel = model;
        }

        if (sceneModels.length > 0) {
            sceneBuf.addModelGroup({
                transparent: false,
                lowDetail: false,
                level: 0,
                priority: 10,
                models: sceneModels,
            });
            sceneBuf.addModelGroup({
                transparent: true,
                lowDetail: false,
                level: 0,
                priority: 10,
                models: sceneModels,
            });
        }

        const drawCommands: DrawCommand[] = [
            ...sceneBuf.drawCommands,
            ...sceneBuf.drawCommandsAlpha,
        ];

        console.log(
            "TD tower objects",
            this.tdCannonPlacements.map((placement) => ({
                kind: placement.kind,
                locId: TD_TOWER_LOC_IDS[placement.kind],
                world: Array.from(placement.world),
            })),
            "indices",
            sceneBuf.indices.length,
        );

        if (drawCommands.length === 0) {
            this.tdCannonDirty = false;
            return;
        }

        this.tdCannonIndexCount = sceneBuf.indices.length;
        this.tdCannonInterleavedBuffer = this.app.createInterleavedBuffer(
            12,
            sceneBuf.vertexBuf.byteArray(),
        );
        this.tdCannonIndexBuffer = this.app.createIndexBuffer(
            PicoGL.UNSIGNED_INT,
            new Uint32Array(sceneBuf.indices),
        );
        this.tdCannonVertexArray = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.tdCannonInterleavedBuffer, {
                type: PicoGL.UNSIGNED_INT,
                size: 3,
                stride: 12,
                integer: true as any,
            })
            .indexBuffer(this.tdCannonIndexBuffer);
        const modelInfoTextureData = createModelInfoTextureData(drawCommands);
        this.tdCannonModelInfoTexture = this.app.createTexture2D(
            modelInfoTextureData,
            16,
            Math.max(Math.ceil(modelInfoTextureData.length / 16 / 4), 1),
            {
                internalFormat: PicoGL.RGBA16UI,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
            },
        );
        this.tdCannonDrawCall = this.app
            .createDrawCall(this.mainProgram, this.tdCannonVertexArray)
            .uniformBlock("SceneUniforms", this.sceneUniformBuffer);
        this.tdCannonDrawCall
            .texture("u_textures", this.textureArray!)
            .texture("u_textureMaterials", this.textureMaterials!)
            .texture("u_heightMap", tdMap.heightMapTexture)
            .texture("u_modelInfoTexture", this.tdCannonModelInfoTexture)
            .uniform("u_mapPos", vec2.fromValues(tdMap.mapX, tdMap.mapY))
            .uniform("u_timeLoaded", tdMap.timeLoaded)
            .uniform("u_drawIdOffset", 0);
        this.tdCannonDrawCall.drawRanges(
            ...drawCommands.map((cmd) => [cmd.offset, cmd.elements, cmd.instances.length]),
        );
        this.tdCannonDirty = false;
    }

    renderTdCannonPass(): void {
        if (this.tdCannonDirty) {
            this.ensureTdCannonBuffer();
        }
        if (!this.tdCannonDrawCall || this.tdCannonIndexCount === 0 || !this.tdCannonModel) {
            return;
        }
        if (this.tdCannonPlacements.length === 0) {
            return;
        }

        this.tdCannonDrawCall.draw();
    }

    updateNpcDataTexture() {
        const frameCount = this.stats.frameCount;

        const newNpcDataTextureIndex = frameCount % this.npcDataTextureBuffer.length;
        const npcDataTextureIndex = (frameCount + 1) % this.npcDataTextureBuffer.length;
        this.npcDataTextureBuffer[newNpcDataTextureIndex]?.delete();
        this.npcDataTextureBuffer[newNpcDataTextureIndex] = this.app.createTexture2D(
            this.npcRenderData,
            16,
            Math.max(Math.ceil(this.npcRenderCount / 16), 1),
            {
                internalFormat: PicoGL.RGBA16UI,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
            },
        );

        return npcDataTextureIndex;
    }

    draw(drawCall: DrawCall, drawRanges: number[][]) {
        if (this.hasMultiDraw) {
            drawCall.draw();
        } else {
            for (let i = 0; i < drawRanges.length; i++) {
                drawCall.uniform("u_drawId", i);
                drawCall.drawRanges(drawRanges[i]);
                drawCall.draw();
            }
        }
    }

    renderOpaquePass(): void {
        const camera = this.mapViewer.camera;
        const cameraMapX = camera.getMapX();
        const cameraMapY = camera.getMapY();

        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];
            const dist = map.getMapDistance(cameraMapX, cameraMapY);

            const isInteract = this.hoveredMapIds.has(map.id);
            const isLod = dist >= this.mapViewer.lodDistance;

            const { drawCall, drawRanges } = map.getDrawCall(false, isInteract, isLod);

            for (const loc of map.locsAnimated) {
                const frameId = loc.frame;
                const frame = loc.anim.frames[frameId | 0];

                const index = loc.getDrawRangeIndex(false, isInteract, isLod);
                if (index !== -1) {
                    drawCall.offsets[index] = frame[0];
                    (drawCall as any).numElements[index] = frame[1];

                    drawRanges[index] = frame;
                }
            }

            this.draw(drawCall, drawRanges);
        }
    }

    shouldRenderNpc(npc: Npc): boolean {
        return (
            npc.tdEnemySlot < 0 || (npc.tdActive && !npc.tdCompleted && npc.tdEnemyId !== undefined)
        );
    }

    renderOpaqueNpcPass(npcDataTextureIndex: number, npcDataTexture: Texture | undefined): void {
        if (!npcDataTexture || !this.loadNpcs) {
            return;
        }

        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];
            const npcs = map.npcs;

            if (npcs.length === 0) {
                continue;
            }

            const dataOffset = map.npcDataTextureOffsets[npcDataTextureIndex];
            if (dataOffset === -1) {
                continue;
            }

            const { drawCall, drawRanges } = map.drawCallNpc;

            drawCall.uniform("u_npcDataOffset", dataOffset);
            drawCall.texture("u_npcDataTexture", npcDataTexture);

            for (let i = 0; i < npcs.length; i++) {
                const npc = npcs[i];
                let frame: DrawRange = NULL_DRAW_RANGE;
                if (this.shouldRenderNpc(npc)) {
                    const anim = npc.getAnimationFrames();
                    const frameId = npc.movementFrame;
                    frame = anim.frames[frameId];
                }

                (drawCall as any).offsets[i] = frame[0];
                (drawCall as any).numElements[i] = frame[1];

                drawRanges[i] = frame;
            }

            this.draw(drawCall, drawRanges);
        }
    }

    renderTransparentPass(): void {
        const camera = this.mapViewer.camera;
        const cameraMapX = camera.getMapX();
        const cameraMapY = camera.getMapY();

        for (let i = this.mapManager.visibleMapCount - 1; i >= 0; i--) {
            const map = this.mapManager.visibleMaps[i];
            const dist = map.getMapDistance(cameraMapX, cameraMapY);

            const isInteract = this.hoveredMapIds.has(map.id);
            const isLod = dist >= this.mapViewer.lodDistance;

            const { drawCall, drawRanges } = map.getDrawCall(true, isInteract, isLod);

            for (const loc of map.locsAnimated) {
                if (loc.anim.framesAlpha) {
                    const frameId = loc.frame;
                    const frame = loc.anim.framesAlpha[frameId | 0];

                    const index = loc.getDrawRangeIndex(true, isInteract, isLod);
                    if (index !== -1) {
                        drawCall.offsets[index] = frame[0];
                        (drawCall as any).numElements[index] = frame[1];

                        drawRanges[index] = frame;
                    }
                }
            }

            this.draw(drawCall, drawRanges);
        }
    }

    renderTransparentNpcPass(
        npcDataTextureIndex: number,
        npcDataTexture: Texture | undefined,
    ): void {
        if (!npcDataTexture || !this.loadNpcs) {
            return;
        }

        for (let i = this.mapManager.visibleMapCount - 1; i >= 0; i--) {
            const map = this.mapManager.visibleMaps[i];
            const npcs = map.npcs;

            if (npcs.length === 0) {
                continue;
            }

            const dataOffset = map.npcDataTextureOffsets[npcDataTextureIndex];
            if (dataOffset === -1) {
                continue;
            }

            const { drawCall, drawRanges } = map.drawCallNpc;

            drawCall.uniform("u_npcDataOffset", dataOffset);
            drawCall.texture("u_npcDataTexture", npcDataTexture);

            for (let i = 0; i < npcs.length; i++) {
                const npc = npcs[i];
                const frameId = npc.movementFrame;
                let frame: DrawRange = NULL_DRAW_RANGE;
                if (this.shouldRenderNpc(npc)) {
                    const anim = npc.getAnimationFrames();
                    if (anim.framesAlpha) {
                        frame = anim.framesAlpha[frameId];
                    }
                }

                (drawCall as any).offsets[i] = frame[0];
                (drawCall as any).numElements[i] = frame[1];

                drawRanges[i] = frame;
            }

            this.draw(drawCall, drawRanges);
        }
    }

    checkInteractions(interactions: Interactions): void {
        const interactReady = interactions.check(
            this.gl,
            this.hoveredMapIds,
            this.closestInteractIndices,
        );
        if (interactReady) {
            this.interactBuffer = interactions.interactBuffer;
        }

        if (!this.interactBuffer) {
            return;
        }

        const frameCount = this.stats.frameCount;

        const inputManager = this.mapViewer.inputManager;
        const isMouseDown = inputManager.dragX !== -1 || inputManager.dragY !== -1;
        const picked = inputManager.pickX !== -1 && inputManager.pickY !== -1;

        if (!interactReady && !picked) {
            return;
        }

        const menuCooldown = isTouchDevice ? 50 : 10;

        if (
            inputManager.mouseX === -1 ||
            inputManager.mouseY === -1 ||
            frameCount - this.mapViewer.menuOpenedFrame < menuCooldown
        ) {
            return;
        }

        // Don't auto close menu on touch devices
        if (this.mapViewer.menuOpen && !picked && !isMouseDown && isTouchDevice) {
            return;
        }

        if (!picked && !this.mapViewer.tooltips) {
            this.mapViewer.closeMenu();
            return;
        }

        const menuEntries: OsrsMenuEntry[] = [];
        const examineEntries: OsrsMenuEntry[] = [];

        const locIds = new Set<number>();
        const objIds = new Set<number>();
        const npcIds = new Set<string>();

        for (let i = 0; i < INTERACTION_RADIUS + 1; i++) {
            const indices = this.closestInteractIndices.get(i);
            if (!indices) {
                continue;
            }
            for (const index of indices) {
                const interactId = this.interactBuffer[index];
                const interactType = this.interactBuffer[index + 2];
                if (interactType === InteractType.LOC) {
                    const locType = this.mapViewer.locTypeLoader.load(interactId);
                    if (locType.name === "null" && !this.mapViewer.debugId) {
                        continue;
                    }
                    if (locIds.has(interactId)) {
                        continue;
                    }
                    locIds.add(interactId);

                    for (const option of locType.actions) {
                        if (!option) {
                            continue;
                        }
                        menuEntries.push({
                            option,
                            targetId: locType.id,
                            targetType: MenuTargetType.LOC,
                            targetName: locType.name,
                            targetLevel: -1,
                            onClick: this.mapViewer.closeMenu,
                        });
                    }

                    examineEntries.push({
                        option: "Examine",
                        targetId: locType.id,
                        targetType: MenuTargetType.LOC,
                        targetName: locType.name,
                        targetLevel: -1,
                        onClick: this.mapViewer.onExamine,
                    });
                } else if (interactType === InteractType.OBJ) {
                    const objType = this.mapViewer.objTypeLoader.load(interactId);
                    if (objType.name === "null" && !this.mapViewer.debugId) {
                        continue;
                    }
                    if (objIds.has(interactId)) {
                        continue;
                    }
                    objIds.add(interactId);

                    for (const option of objType.groundActions) {
                        if (!option) {
                            continue;
                        }
                        menuEntries.push({
                            option,
                            targetId: objType.id,
                            targetType: MenuTargetType.OBJ,
                            targetName: objType.name,
                            targetLevel: -1,
                            onClick: this.mapViewer.closeMenu,
                        });
                    }

                    examineEntries.push({
                        option: "Examine",
                        targetId: objType.id,
                        targetType: MenuTargetType.OBJ,
                        targetName: objType.name,
                        targetLevel: -1,
                        onClick: this.mapViewer.onExamine,
                    });
                } else if (interactType === InteractType.NPC) {
                    const mapId = this.interactBuffer[index + 1];
                    const npcDrawIndex = this.interactBuffer[index + 3] | 0;
                    const pickedNpc = this.getNpcFromInteraction(mapId, npcDrawIndex, interactId);
                    let npcType = this.mapViewer.npcTypeLoader.load(interactId);
                    if (npcType.transforms) {
                        const transformed = npcType.transform(
                            this.mapViewer.varManager,
                            this.mapViewer.npcTypeLoader,
                        );
                        if (!transformed) {
                            continue;
                        }
                        npcType = transformed;
                    }
                    if (npcType.name === "null" && !this.mapViewer.debugId) {
                        continue;
                    }
                    const tdEnemy =
                        pickedNpc?.tdEnemyId !== undefined
                            ? this.tdEnemies.get(pickedNpc.tdEnemyId)
                            : undefined;
                    const npcKey = tdEnemy ? `td:${tdEnemy.id}` : `npc:${interactId}`;
                    if (npcIds.has(npcKey)) {
                        continue;
                    }
                    npcIds.add(npcKey);

                    if (tdEnemy) {
                        const hp = Math.max(0, Math.ceil(tdEnemy.hp));
                        const maxHp = Math.max(1, Math.ceil(tdEnemy.maxHp));
                        const openTdEnemyInfo = () => {
                            window.dispatchEvent(
                                new CustomEvent(LUMBRIDGE_TD_ENEMY_SELECTED, {
                                    detail: { id: tdEnemy.id },
                                }),
                            );
                            this.mapViewer.closeMenu();
                        };
                        menuEntries.push({
                            option: `Attack (${hp}/${maxHp} HP)`,
                            targetId: npcType.id,
                            targetType: MenuTargetType.NPC,
                            targetName: tdEnemy.name,
                            targetLevel: tdEnemy.level,
                            onClick: openTdEnemyInfo,
                        });
                        examineEntries.push({
                            option: `Health ${hp}/${maxHp}`,
                            targetId: npcType.id,
                            targetType: MenuTargetType.NPC,
                            targetName: tdEnemy.name,
                            targetLevel: tdEnemy.level,
                            onClick: openTdEnemyInfo,
                        });
                        continue;
                    }

                    for (const option of npcType.actions) {
                        if (!option) {
                            continue;
                        }
                        menuEntries.push({
                            option,
                            targetId: npcType.id,
                            targetType: MenuTargetType.NPC,
                            targetName: npcType.name,
                            targetLevel: npcType.combatLevel,
                            onClick: this.mapViewer.closeMenu,
                        });
                    }

                    examineEntries.push({
                        option: "Examine",
                        targetId: npcType.id,
                        targetType: MenuTargetType.NPC,
                        targetName: npcType.name,
                        targetLevel: npcType.combatLevel,
                        onClick: this.mapViewer.onExamine,
                    });
                }
            }
        }

        menuEntries.push({
            option: "Walk here",
            targetId: -1,
            targetType: MenuTargetType.NONE,
            targetName: "",
            targetLevel: -1,
            onClick: this.mapViewer.closeMenu,
        });
        menuEntries.push(...examineEntries);
        menuEntries.push({
            option: "Cancel",
            targetId: -1,
            targetType: MenuTargetType.NONE,
            targetName: "",
            targetLevel: -1,
            onClick: this.mapViewer.closeMenu,
        });

        this.mapViewer.menuOpen = picked;
        if (picked) {
            this.mapViewer.menuOpenedFrame = frameCount;
        }
        this.mapViewer.menuX = inputManager.mouseX;
        this.mapViewer.menuY = inputManager.mouseY;
        this.mapViewer.menuEntries = menuEntries;
    }

    getNpcFromInteraction(
        mapId: number,
        npcDrawIndex: number,
        interactId: number,
    ): Npc | undefined {
        const map = this.mapManager.mapSquares.get(mapId);
        const npc = map?.npcs[npcDrawIndex];
        if (!npc || npc.npcType.id !== interactId) {
            return undefined;
        }
        return npc;
    }

    override async cleanUp(): Promise<void> {
        window.removeEventListener(LUMBRIDGE_TD_START_WAVE, this.onTdStartWave as EventListener);
        window.removeEventListener(LUMBRIDGE_TD_RESET, this.onTdReset);
        window.removeEventListener(
            LUMBRIDGE_TD_ROUTE_CHANGED,
            this.onTdRouteChanged as EventListener,
        );
        window.removeEventListener(
            LUMBRIDGE_TD_TOWERS_CHANGED,
            this.onTdTowersChanged as EventListener,
        );
        window.removeEventListener(
            LUMBRIDGE_TD_ENEMY_SPAWNED,
            this.onTdEnemySpawned as EventListener,
        );
        window.removeEventListener(
            LUMBRIDGE_TD_ENEMY_UPDATED,
            this.onTdEnemyUpdated as EventListener,
        );
        window.removeEventListener(
            LUMBRIDGE_TD_ENEMY_REMOVED,
            this.onTdEnemyRemoved as EventListener,
        );
        super.cleanUp();
        this.mapViewer.workerPool.resetLoader(this.dataLoader);

        this.quadArray?.delete();
        this.quadArray = undefined;

        this.quadPositions?.delete();
        this.quadPositions = undefined;

        this.tdRouteArray?.delete();
        this.tdRouteArray = undefined;

        this.tdRoutePositions?.delete();
        this.tdRoutePositions = undefined;
        this.tdRouteDrawCall = undefined;

        this.tdCannonDrawCall = undefined;
        this.tdCannonVertexArray?.delete();
        this.tdCannonVertexArray = undefined;
        this.tdCannonIndexBuffer?.delete?.();
        this.tdCannonIndexBuffer = undefined;
        this.tdCannonInterleavedBuffer?.delete();
        this.tdCannonInterleavedBuffer = undefined;

        // Uniforms
        this.sceneUniformBuffer?.delete();
        this.sceneUniformBuffer = undefined;

        // Framebuffers
        this.framebuffer?.delete();
        this.framebuffer = undefined;

        this.colorTarget?.delete();
        this.colorTarget = undefined;

        this.interactTarget?.delete();
        this.interactTarget = undefined;

        this.depthTarget?.delete();
        this.depthTarget = undefined;

        this.textureFramebuffer?.delete();
        this.textureFramebuffer = undefined;

        this.textureColorTarget?.delete();
        this.textureColorTarget = undefined;

        this.interactFramebuffer?.delete();
        this.interactFramebuffer = undefined;

        this.interactColorTarget?.delete();
        this.interactColorTarget = undefined;

        // Textures
        this.textureArray?.delete();
        this.textureArray = undefined;

        this.textureMaterials?.delete();
        this.textureMaterials = undefined;

        for (const texture of this.npcDataTextureBuffer) {
            texture?.delete();
        }

        this.clearMaps();

        if (this.shadersPromise) {
            for (const shader of await this.shadersPromise) {
                shader.delete();
            }
            this.shadersPromise = undefined;
        }
        console.log("Renderer cleaned up");
    }
}
