import { vec4 } from "gl-matrix";
import {
    CSSProperties,
    MouseEvent,
    useCallback,
    useDeferredValue,
    useEffect,
    useRef,
    useState,
} from "react";

import { OsrsMenu, OsrsMenuEntry } from "../components/rs/menu/OsrsMenu";
import { MapViewer } from "../lib/mapviewer/MapViewer";
import { WebGLMapSquare } from "../lib/mapviewer/webgl/WebGLMapSquare";
import { MenuTargetType } from "../rs/MenuEntry";
import { pixelRatio } from "../util/DeviceUtil";
import { lerp, slerp } from "../util/MathUtil";
import { getAssetBaseUrl } from "../util/PublicUrl";
import { DukeHoracioChatHeadCanvas } from "./DukeHoracioChatHeadCanvas";
import "./LumbridgeTowerDefenseOverlay.css";
import { TdLootItemCanvas } from "./TdLootItemCanvas";
import archerIcon from "./archer-burthorpe.png";
import coinsIcon from "./coins-100.png";
import dwarfMulticannonIcon from "./dwarf-multicannon.png";
import hitpointsIcon from "./hitpoints-icon.png";
import {
    Enemy,
    LUMBRIDGE_TD_ENEMY_ARCHETYPES,
    TOWER_DEFS,
    TOWER_MAX_LEVEL,
    Tower,
    TowerKind,
    WaveConfig,
    WaveEnemyConfig,
    createDefaultWaveConfig,
    createInitialLumbridgeTdState,
    createWaveEnemyConfigFromArchetype,
    createWaveEnemyConfigFromNpc,
    deselectEnemy,
    deselectTower,
    dismissWaveSummary,
    getTowerName,
    getTowerStats,
    getTowerUpgradeCost,
    getWaveConfig,
    getWaveEnemyArchetype,
    getWaveEnemyCount,
    isBarricadeTowerKind,
    isTowerPadCompatible,
    placeTower,
    resetGame,
    resetWaveConfig,
    samplePath,
    samplePathWorldTile,
    selectEnemy,
    selectPlacedTower,
    selectTower,
    startWave,
    startWaveFromSummary,
    tickLumbridgeTd,
    updateWaveConfig,
    upgradeTower,
} from "./lumbridgeTd";
import {
    getFurthestEnemyProgress,
    pickEnemyAmbientLine,
    pickLocalCommentary,
} from "./lumbridgeTdAmbient";
import {
    LUMBRIDGE_TD_ENEMY_SELECTED,
    LUMBRIDGE_TD_START_WAVE,
    emitLumbridgeTdReset,
    emitLumbridgeTdStartWave,
    emitLumbridgeTdTowersChanged,
} from "./lumbridgeTdEvents";
import {
    LumbridgeTdLevelDefinition,
    deleteLumbridgeTdSavedLevel,
    listLumbridgeTdSavedLevels,
    saveLumbridgeTdLevel,
} from "./lumbridgeTdLevelStore";
import {
    LumbridgeTdPad,
    LumbridgeTdPadKind,
    createLumbridgeTdPad,
    getDefaultLumbridgeTdPads,
    getLumbridgeTdPads,
    resetLumbridgeTdPads,
    setLumbridgeTdPads,
} from "./lumbridgeTdPads";
import {
    LUMBRIDGE_TD_MAP_X,
    LUMBRIDGE_TD_MAP_Y,
    getDefaultLumbridgeTdRoute,
    getLumbridgeTdRoute,
    localTileToRouteEditorPoint,
    resetLumbridgeTdRoute,
    routeEditorPointToLocalTile,
    setLumbridgeTdRoute,
} from "./lumbridgeTdRoute";
import { getLumbridgePadWorldAnchor } from "./lumbridgeTdWorld";
import obeliskAirIcon from "./obelisk-air.png";
import obeliskEarthIcon from "./obelisk-earth.png";
import obeliskFireIcon from "./obelisk-fire.png";
import obeliskWaterIcon from "./obelisk-water.png";

interface LumbridgeTowerDefenseOverlayProps {
    mapViewer: MapViewer;
}

type ProjectedTowerPad = {
    id: string;
    markerCenter?: { x: number; y: number };
    markerRadiusX?: number;
    markerRadiusY?: number;
    rangePolygon?: string;
    label: { x: number; y: number };
    color: string;
    built: boolean;
    disabled: boolean;
    padKind: LumbridgeTdPadKind;
    labelText: string;
    towerId?: string;
    level?: number;
};

type DraggablePanelKey = "rightRail" | "buildPanel" | "enemyInfo" | "levelEditor" | "settings";

type DraggablePanelPosition = {
    x: number;
    y: number;
};

type TdCameraMode = "target" | "line";
type TdShopTab = "towers" | "barricades" | "info";

type RoutePoint = {
    x: number;
    y: number;
};

type RouteSegment = {
    from: RoutePoint;
    to: RoutePoint;
    length: number;
    start: number;
    end: number;
};

type EnemyCatalogEntry = {
    key: string;
    config: WaveEnemyConfig;
    level: number;
    source: "preset" | "spawn";
};

type TdSpeechBubble = {
    id: string;
    role: "enemy" | "local";
    speakerName: string;
    text: string;
    expiresAt: number;
    enemyId?: string;
    fallbackEnemyPoint?: { x: number; y: number };
    localSpeakerId?: string;
    fallbackLocalTile?: { x: number; y: number };
};

type TdDevSettings = {
    showEnemyHealthBars: boolean;
    showSpeechBubbles: boolean;
    showPathTiles: boolean;
    showPathLine: boolean;
    showTowerRanges: boolean;
    showPadLabels: boolean;
    showProjectileStats: boolean;
    showTowerInfoPanel: boolean;
    showEnemyInfoPanel: boolean;
    showBuildPanel: boolean;
    showBottomHint: boolean;
    lineCameraEnabled: boolean;
    levelEditorOpen: boolean;
};

type TdRenderSettings = Pick<TdDevSettings, "showEnemyHealthBars" | "showSpeechBubbles">;

type TdDevSettingKey = keyof TdDevSettings;

type TdDevToggleDefinition = {
    key: TdDevSettingKey;
    label: string;
    description: string;
};

const TD_ASSET_BASE = getAssetBaseUrl();
const TD_SOUND_BASE = `${TD_ASSET_BASE}/towerdefense-sfx`;
const LUMBRIDGE_TD_DEV_SETTINGS_STORAGE_KEY = "gielinor-td:dev-settings:v1";
const TD_SOUND_FILES = {
    build: "Equip_metal_body.wav.ogg",
    locked: "Locked.wav.mp3",
    spawn: "Impling_spawn.ogg.ogg",
    upgrade: "Improved_Reflexes.ogg",
    dead: "You_Are_Dead!.ogg",
    victory: "You_Are_Victorious!_(Emir's_Arena).ogg",
} as const;
const MAGE_TOWER_ICON_URLS = [
    obeliskAirIcon,
    obeliskWaterIcon,
    obeliskEarthIcon,
    obeliskFireIcon,
] as const;
const TD_COMBAT_TOWER_KINDS: TowerKind[] = ["bolt", "cannon", "mage"];
const TD_EMPTY_TOWER_PAD_COLOR = "#6ec8ff";
const TD_EMPTY_BARRICADE_PAD_COLOR = "#f0a55a";

function getTowerIconUrl(kind: TowerKind, level = 1): string | undefined {
    if (kind === "bolt") {
        return archerIcon;
    }
    if (kind === "cannon") {
        return dwarfMulticannonIcon;
    }
    if (kind === "mage") {
        const normalizedLevel = Math.max(1, Math.min(level, MAGE_TOWER_ICON_URLS.length));
        return MAGE_TOWER_ICON_URLS[normalizedLevel - 1];
    }
    return undefined;
}

function hasTowerIcon(kind: TowerKind, level = 1): boolean {
    return getTowerIconUrl(kind, level) !== undefined;
}

function TowerIconImage({
    towerKind,
    level = 1,
    variant,
    className,
}: {
    towerKind: TowerKind;
    level?: number;
    variant: "shop" | "card" | "ghost";
    className?: string;
}): JSX.Element | null {
    const iconUrl = getTowerIconUrl(towerKind, level);
    if (!iconUrl) {
        return null;
    }

    return (
        <img
            className={[
                "td-tower-art-image",
                `td-tower-art-${variant}`,
                `td-tower-art-${towerKind}`,
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            src={iconUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
        />
    );
}
const DEFAULT_TD_DEV_SETTINGS: TdDevSettings = {
    showEnemyHealthBars: true,
    showSpeechBubbles: true,
    showPathTiles: true,
    showPathLine: true,
    showTowerRanges: true,
    showPadLabels: true,
    showProjectileStats: true,
    showTowerInfoPanel: true,
    showEnemyInfoPanel: true,
    showBuildPanel: true,
    showBottomHint: true,
    lineCameraEnabled: false,
    levelEditorOpen: false,
};
const TD_OVERLAY_TOGGLES: TdDevToggleDefinition[] = [
    {
        key: "showEnemyHealthBars",
        label: "HP Bars",
        description: "Enemy overhead health bars",
    },
    {
        key: "showSpeechBubbles",
        label: "Speech",
        description: "Ambient chatter bubbles",
    },
    {
        key: "showPathTiles",
        label: "Path Tiles",
        description: "Ground route tile overlay",
    },
    {
        key: "showPathLine",
        label: "Path Line",
        description: "Ground route spline",
    },
    {
        key: "showTowerRanges",
        label: "Tower Ranges",
        description: "Projected attack radii",
    },
    {
        key: "showPadLabels",
        label: "Pad Labels",
        description: "Pad level and build badges",
    },
];
const TD_PANEL_TOGGLES: TdDevToggleDefinition[] = [
    {
        key: "showProjectileStats",
        label: "Projectile Stats",
        description: "Renderer/state projectile counters",
    },
    {
        key: "showTowerInfoPanel",
        label: "Tower Card",
        description: "Selected tower inspector",
    },
    {
        key: "showEnemyInfoPanel",
        label: "Enemy Card",
        description: "Selected enemy inspector",
    },
    {
        key: "showBuildPanel",
        label: "Build Help",
        description: "Placement helper panel",
    },
    {
        key: "showBottomHint",
        label: "Bottom Hint",
        description: "Footer placement hint",
    },
];
const TD_TOOL_TOGGLES: TdDevToggleDefinition[] = [
    {
        key: "lineCameraEnabled",
        label: "Line Camera",
        description: "Follow the route from the path line",
    },
    {
        key: "levelEditorOpen",
        label: "Level Editor",
        description: "Open the route and wave editor panel",
    },
];

function getLumbridgeTdDevSettingsStorage(): Storage | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }

    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

function sanitizeLumbridgeTdDevSettings(settings: unknown): TdDevSettings {
    const candidate =
        settings && typeof settings === "object" ? (settings as Partial<TdDevSettings>) : {};

    return {
        showEnemyHealthBars:
            typeof candidate.showEnemyHealthBars === "boolean"
                ? candidate.showEnemyHealthBars
                : DEFAULT_TD_DEV_SETTINGS.showEnemyHealthBars,
        showSpeechBubbles:
            typeof candidate.showSpeechBubbles === "boolean"
                ? candidate.showSpeechBubbles
                : DEFAULT_TD_DEV_SETTINGS.showSpeechBubbles,
        showPathTiles:
            typeof candidate.showPathTiles === "boolean"
                ? candidate.showPathTiles
                : DEFAULT_TD_DEV_SETTINGS.showPathTiles,
        showPathLine:
            typeof candidate.showPathLine === "boolean"
                ? candidate.showPathLine
                : DEFAULT_TD_DEV_SETTINGS.showPathLine,
        showTowerRanges:
            typeof candidate.showTowerRanges === "boolean"
                ? candidate.showTowerRanges
                : DEFAULT_TD_DEV_SETTINGS.showTowerRanges,
        showPadLabels:
            typeof candidate.showPadLabels === "boolean"
                ? candidate.showPadLabels
                : DEFAULT_TD_DEV_SETTINGS.showPadLabels,
        showProjectileStats:
            typeof candidate.showProjectileStats === "boolean"
                ? candidate.showProjectileStats
                : DEFAULT_TD_DEV_SETTINGS.showProjectileStats,
        showTowerInfoPanel:
            typeof candidate.showTowerInfoPanel === "boolean"
                ? candidate.showTowerInfoPanel
                : DEFAULT_TD_DEV_SETTINGS.showTowerInfoPanel,
        showEnemyInfoPanel:
            typeof candidate.showEnemyInfoPanel === "boolean"
                ? candidate.showEnemyInfoPanel
                : DEFAULT_TD_DEV_SETTINGS.showEnemyInfoPanel,
        showBuildPanel:
            typeof candidate.showBuildPanel === "boolean"
                ? candidate.showBuildPanel
                : DEFAULT_TD_DEV_SETTINGS.showBuildPanel,
        showBottomHint:
            typeof candidate.showBottomHint === "boolean"
                ? candidate.showBottomHint
                : DEFAULT_TD_DEV_SETTINGS.showBottomHint,
        lineCameraEnabled:
            typeof candidate.lineCameraEnabled === "boolean"
                ? candidate.lineCameraEnabled
                : DEFAULT_TD_DEV_SETTINGS.lineCameraEnabled,
        levelEditorOpen:
            typeof candidate.levelEditorOpen === "boolean"
                ? candidate.levelEditorOpen
                : DEFAULT_TD_DEV_SETTINGS.levelEditorOpen,
    };
}

function loadLumbridgeTdDevSettings(): TdDevSettings {
    const storage = getLumbridgeTdDevSettingsStorage();
    if (!storage) {
        return { ...DEFAULT_TD_DEV_SETTINGS };
    }

    try {
        const stored = storage.getItem(LUMBRIDGE_TD_DEV_SETTINGS_STORAGE_KEY);
        if (!stored) {
            return { ...DEFAULT_TD_DEV_SETTINGS };
        }
        return sanitizeLumbridgeTdDevSettings(JSON.parse(stored));
    } catch {
        return { ...DEFAULT_TD_DEV_SETTINGS };
    }
}

function persistLumbridgeTdDevSettings(settings: TdDevSettings): void {
    const storage = getLumbridgeTdDevSettingsStorage();
    if (!storage) {
        return;
    }

    try {
        storage.setItem(LUMBRIDGE_TD_DEV_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Ignore persistence failures so the overlay still works in restricted contexts.
    }
}

function getWaveEnemyConfigKey(enemy: Pick<WaveEnemyConfig, "npcId" | "archetypeName">): string {
    return enemy.npcId ? `npc:${enemy.npcId}` : `name:${enemy.archetypeName.toLowerCase()}`;
}

function isSameWaveEnemy(
    left: Pick<WaveEnemyConfig, "npcId" | "archetypeName">,
    right: Pick<WaveEnemyConfig, "npcId" | "archetypeName">,
): boolean {
    return getWaveEnemyConfigKey(left) === getWaveEnemyConfigKey(right);
}

function buildEnemyCatalog(mapViewer: MapViewer): EnemyCatalogEntry[] {
    const entries = new Map<string, EnemyCatalogEntry>();

    for (const archetype of LUMBRIDGE_TD_ENEMY_ARCHETYPES) {
        const config = createWaveEnemyConfigFromArchetype(archetype);
        entries.set(getWaveEnemyConfigKey(config), {
            key: getWaveEnemyConfigKey(config),
            config,
            level: Math.round(archetype.hp / 6),
            source: "preset",
        });
    }

    const byNpcId = new Map<number, { name: string; level: number }>();
    for (const spawn of mapViewer.npcSpawns) {
        const name = spawn.name?.trim();
        if (!name || name.toLowerCase() === "null") {
            continue;
        }

        const existing = byNpcId.get(spawn.id);
        if (!existing || spawn.level > existing.level) {
            byNpcId.set(spawn.id, { name, level: spawn.level });
        }
    }

    for (const [npcId, npc] of byNpcId) {
        const config = createWaveEnemyConfigFromNpc(npcId, npc.name, npc.level);
        const key = getWaveEnemyConfigKey(config);
        if (!entries.has(key)) {
            entries.set(key, {
                key,
                config,
                level: npc.level,
                source: "spawn",
            });
        }
    }

    return [...entries.values()].sort((left, right) => {
        if (left.source !== right.source) {
            return left.source === "preset" ? -1 : 1;
        }
        return left.config.archetypeName.localeCompare(right.config.archetypeName);
    });
}

function getMiddleWaveEnemy(enemies: Enemy[]): Enemy | undefined {
    if (enemies.length === 0) {
        return undefined;
    }

    const sorted = [...enemies].sort((lhs, rhs) => lhs.progress - rhs.progress);
    return sorted[Math.floor(sorted.length / 2)];
}

function getLineViewRoutePoints(): RoutePoint[] {
    const route = getLumbridgeTdRoute();
    return (route.length >= 2 ? route : getDefaultLumbridgeTdRoute()).map(
        localTileToRouteEditorPoint,
    );
}

function buildRouteSegments(path: RoutePoint[]): { segments: RouteSegment[]; totalLength: number } {
    const segments: RouteSegment[] = [];
    let totalLength = 0;

    for (let index = 0; index < path.length - 1; index++) {
        const from = path[index];
        const to = path[index + 1];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        segments.push({
            from,
            to,
            length,
            start: totalLength,
            end: totalLength + length,
        });
        totalLength += length;
    }

    return { segments, totalLength };
}

function getRouteSampleForProgress(progress: number):
    | {
          current: RoutePoint;
          next: RoutePoint;
          forwardX: number;
          forwardZ: number;
      }
    | undefined {
    const path = getLineViewRoutePoints();
    if (path.length < 2) {
        return undefined;
    }

    const pathSegments = buildRouteSegments(path);
    if (pathSegments.totalLength <= 0) {
        return undefined;
    }

    const targetDistance = Math.max(0, Math.min(progress, 1)) * pathSegments.totalLength;
    const segment =
        pathSegments.segments.find(
            (candidate, index) =>
                targetDistance <= candidate.end || index === pathSegments.segments.length - 1,
        ) ?? pathSegments.segments[pathSegments.segments.length - 1];

    const segmentProgress =
        segment.length === 0 ? 0 : (targetDistance - segment.start) / segment.length;
    const current = {
        x: segment.from.x + (segment.to.x - segment.from.x) * segmentProgress,
        y: segment.from.y + (segment.to.y - segment.from.y) * segmentProgress,
    };

    return {
        current,
        next: segment.to,
        forwardX: segment.to.x - segment.from.x,
        forwardZ: segment.to.y - segment.from.y,
    };
}

function routePointToWorldTile(point: RoutePoint): { x: number; y: number } {
    return {
        x: LUMBRIDGE_TD_MAP_X * 64 + point.x * 64,
        y: LUMBRIDGE_TD_MAP_Y * 64 + (1 - point.y) * 64,
    };
}

function getAverageEnemyHeight(enemies: Enemy[]): number {
    if (enemies.length === 0) {
        return 1.25;
    }

    return (
        enemies.reduce((sum, enemy) => sum + getFallbackEnemyOverheadHeight(enemy), 0) /
        enemies.length
    );
}

const DUKE_HORACIO_INTRO_LINES = [
    "They're here! What do we do?!",
    "You must have learned something in the academy. Where do we put our defenses?",
];

function cloneWaveConfigs(waveConfigs: Record<number, WaveConfig>): Record<number, WaveConfig> {
    return Object.fromEntries(
        Object.entries(waveConfigs).map(([wave, config]) => [
            Number(wave),
            {
                ...config,
                enemies: config.enemies.map((enemy) => ({ ...enemy })),
            },
        ]),
    ) as Record<number, WaveConfig>;
}

function clonePads(pads: readonly LumbridgeTdPad[]): LumbridgeTdPad[] {
    return pads.map((pad) => ({ ...pad }));
}

function createLevelDefinition(
    route: readonly { x: number; y: number }[],
    pads: readonly LumbridgeTdPad[],
    waveConfigs: Record<number, WaveConfig>,
): LumbridgeTdLevelDefinition {
    return {
        route: route.map((point) => ({ ...point })),
        pads: clonePads(pads),
        waveConfigs: cloneWaveConfigs(waveConfigs),
    };
}

function buildStateFromLevelDefinition(level: LumbridgeTdLevelDefinition) {
    const waveEntries = Object.entries(level.waveConfigs)
        .map(([wave, config]) => [Number(wave), config] as const)
        .filter(([wave]) => Number.isFinite(wave) && wave >= 1)
        .sort(([left], [right]) => left - right);

    let nextState = resetGame();
    for (const [wave, config] of waveEntries) {
        nextState = updateWaveConfig(nextState, wave, config);
    }

    return nextState;
}

function formatSavedLevelTimestamp(updatedAt: number): string {
    return new Date(updatedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export function LumbridgeTowerDefenseOverlay({
    mapViewer,
}: LumbridgeTowerDefenseOverlayProps): JSX.Element {
    const overlayRef = useRef<HTMLDivElement>(null);
    const stateRef = useRef(createInitialLumbridgeTdState());
    const [devSettings, setDevSettings] = useState(() => loadLumbridgeTdDevSettings());
    const [state, setState] = useState(stateRef.current);
    const [introStep, setIntroStep] = useState(0);
    const [buildMode, setBuildMode] = useState<TowerKind | undefined>();
    const [buildRotation, setBuildRotation] = useState(0);
    const [hoveredPadId, setHoveredPadId] = useState<string | undefined>();
    const [buildPreview, setBuildPreview] = useState<{ x: number; y: number } | undefined>();
    const [shopTab, setShopTab] = useState<TdShopTab>("towers");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [routeEditorOpen, setRouteEditorOpen] = useState(devSettings.levelEditorOpen);
    const [routeDraft, setRouteDraft] = useState(getLumbridgeTdRoute());
    const [selectedRoutePointIndex, setSelectedRoutePointIndex] = useState<number | undefined>();
    const [padDraft, setPadDraft] = useState(() => getLumbridgeTdPads());
    const [selectedPadIndex, setSelectedPadIndex] = useState<number | undefined>();
    const [padPlacementArmed, setPadPlacementArmed] = useState(false);
    const [selectedWaveNumber, setSelectedWaveNumber] = useState(1);
    const [waveEnemySearch, setWaveEnemySearch] = useState("");
    const [enemyCatalog, setEnemyCatalog] = useState<EnemyCatalogEntry[]>([]);
    const [savedLevels, setSavedLevels] = useState(() => listLumbridgeTdSavedLevels());
    const [selectedSavedLevelId, setSelectedSavedLevelId] = useState<string | undefined>();
    const [savedLevelName, setSavedLevelName] = useState("Lumbridge Variant");
    const [cameraMode, setCameraMode] = useState<TdCameraMode>(
        devSettings.lineCameraEnabled ? "line" : "target",
    );
    const [panelPositions, setPanelPositions] = useState<
        Partial<Record<DraggablePanelKey, DraggablePanelPosition>>
    >({});
    const [towerMenu, setTowerMenu] = useState<
        { x: number; y: number; entries: OsrsMenuEntry[] } | undefined
    >();
    const [worldRoutePolygons, setWorldRoutePolygons] = useState<string[]>([]);
    const [worldRouteLine, setWorldRouteLine] = useState("");
    const [worldPadOverlays, setWorldPadOverlays] = useState<ProjectedTowerPad[]>([]);
    const overheadCanvasRef = useRef<HTMLCanvasElement>(null);
    const speechBubblesRef = useRef<TdSpeechBubble[]>([]);
    const [padWorldAnchors, setPadWorldAnchors] = useState<
        Record<string, { x: number; y: number; z: number }>
    >({});
    const projectileRendererStats = mapViewer.renderer as typeof mapViewer.renderer & {
        tdProjectileAliveCount?: number;
        tdProjectileRenderAttemptCount?: number;
        tdProjectileRenderDrawCount?: number;
        tdCombatDebug?: {
            enemyId: string;
            name: string;
            combatActive: boolean;
            movementSeqId: number;
            movementFrame: number;
            movementFrameTick: number;
            attackSeqId: number;
            tdAttackSeqId: number;
            hasAttackAnim: boolean;
            selectedAnim: "attack" | "walk" | "idle";
            pathLength: number;
            serverPathLength: number;
            tdMoveClientTicks: number;
        };
    };
    const routeEditorRef = useRef<HTMLDivElement>(null);
    const lastDeathAnnouncementRef = useRef(false);
    const lastVictoryAnnouncementRef = useRef(false);
    const previousStateSnapshotRef = useRef(stateRef.current);
    const nextEnemyChatterAtRef = useRef(0);
    const nextLocalIdleCommentaryAtRef = useRef(0);
    const nextLocalEventCommentaryAtRef = useRef(0);
    const deferredWaveEnemySearch = useDeferredValue(waveEnemySearch);
    const playSound = useCallback((fileName: string, volume: number = 0.65) => {
        const audio = new Audio(`${TD_SOUND_BASE}/${fileName}`);
        audio.volume = volume;
        void audio.play().catch(() => {});
    }, []);
    const updateDevSetting = useCallback(
        <K extends TdDevSettingKey>(key: K, value: TdDevSettings[K]) => {
            setDevSettings((current) => {
                if (current[key] === value) {
                    return current;
                }
                return {
                    ...current,
                    [key]: value,
                };
            });
        },
        [],
    );
    const syncSpeechBubbles = useCallback((nextBubbles: TdSpeechBubble[]) => {
        speechBubblesRef.current = nextBubbles;
    }, []);

    useEffect(() => {
        persistLumbridgeTdDevSettings(devSettings);
    }, [devSettings]);

    useEffect(() => {
        updateDevSetting("levelEditorOpen", routeEditorOpen);
    }, [routeEditorOpen, updateDevSetting]);

    useEffect(() => {
        updateDevSetting("lineCameraEnabled", cameraMode === "line");
    }, [cameraMode, updateDevSetting]);

    const pruneSpeechBubbles = useCallback(
        (now: number, currentEnemies: readonly Enemy[] = stateRef.current.enemies) => {
            const activeEnemyIds = new Set(currentEnemies.map((enemy) => enemy.id));
            const nextBubbles = speechBubblesRef.current.filter((bubble) => {
                if (bubble.expiresAt <= now) {
                    return false;
                }
                return bubble.enemyId ? activeEnemyIds.has(bubble.enemyId) : true;
            });

            if (nextBubbles.length !== speechBubblesRef.current.length) {
                syncSpeechBubbles(nextBubbles);
            }
        },
        [syncSpeechBubbles],
    );

    const pushSpeechBubble = useCallback(
        (bubble: TdSpeechBubble) => {
            const now = performance.now();
            const nextBubbles = speechBubblesRef.current
                .filter((current) => {
                    if (current.expiresAt <= now) {
                        return false;
                    }
                    if (bubble.enemyId && current.enemyId === bubble.enemyId) {
                        return false;
                    }
                    if (bubble.localSpeakerId && current.localSpeakerId === bubble.localSpeakerId) {
                        return false;
                    }
                    return true;
                })
                .concat(bubble)
                .sort((left, right) => left.expiresAt - right.expiresAt)
                .slice(-4);
            syncSpeechBubbles(nextBubbles);
        },
        [syncSpeechBubbles],
    );

    useEffect(() => {
        setEnemyCatalog(buildEnemyCatalog(mapViewer));
    }, [mapViewer]);

    useEffect(() => {
        const onWaveStart = () => playSound(TD_SOUND_FILES.spawn, 0.42);

        window.addEventListener(LUMBRIDGE_TD_START_WAVE, onWaveStart);
        return () => {
            window.removeEventListener(LUMBRIDGE_TD_START_WAVE, onWaveStart);
        };
    }, [playSound]);

    useEffect(() => {
        if (state.gameOver) {
            if (!lastDeathAnnouncementRef.current) {
                playSound(TD_SOUND_FILES.dead, 0.55);
                lastDeathAnnouncementRef.current = true;
            }
            return;
        }

        lastDeathAnnouncementRef.current = false;
        if (state.showWaveSummary && state.waveSummary && !lastVictoryAnnouncementRef.current) {
            playSound(TD_SOUND_FILES.victory, 0.52);
            lastVictoryAnnouncementRef.current = true;
        }
        if (!state.showWaveSummary) {
            lastVictoryAnnouncementRef.current = false;
        }
    }, [playSound, state.gameOver, state.showWaveSummary, state.waveSummary]);

    useEffect(() => {
        const prevState = previousStateSnapshotRef.current;
        const now = performance.now();
        pruneSpeechBubbles(now, state.enemies);

        const maybeCommentLocally = (
            event:
                | "waveStart"
                | "towerBuilt"
                | "towerUpgraded"
                | "enemyLeak"
                | "pressure"
                | "kill"
                | "waveClear",
        ) => {
            if (now < nextLocalEventCommentaryAtRef.current) {
                return;
            }

            const commentary = pickLocalCommentary(event);
            if (!commentary) {
                return;
            }

            pushSpeechBubble({
                id: `${commentary.speaker.id}-${now}`,
                role: "local",
                speakerName: commentary.speaker.name,
                text: commentary.text,
                expiresAt: now + 3400,
                localSpeakerId: commentary.speaker.id,
                fallbackLocalTile: {
                    x: commentary.speaker.tileX,
                    y: commentary.speaker.tileY,
                },
            });
            nextLocalEventCommentaryAtRef.current = now + 1800;
            nextLocalIdleCommentaryAtRef.current = now + 2600;
        };

        if (state.waveInProgress && state.wave > prevState.wave) {
            maybeCommentLocally("waveStart");
        }

        if (state.towers.length > prevState.towers.length) {
            maybeCommentLocally("towerBuilt");
        } else {
            const upgradedTower = state.towers.find((tower) => {
                const previousTower = prevState.towers.find(
                    (candidate) => candidate.id === tower.id,
                );
                return previousTower && tower.level > previousTower.level;
            });
            if (upgradedTower) {
                maybeCommentLocally("towerUpgraded");
            }
        }

        if (state.lives < prevState.lives) {
            maybeCommentLocally("enemyLeak");
        }

        const prevFurthestProgress = getFurthestEnemyProgress(prevState);
        const furthestProgress = getFurthestEnemyProgress(state);
        if (state.waveInProgress && furthestProgress >= 0.72 && prevFurthestProgress < 0.72) {
            maybeCommentLocally("pressure");
        }

        if (state.gold > prevState.gold && state.enemies.length < prevState.enemies.length) {
            maybeCommentLocally("kill");
        }

        if (!prevState.showWaveSummary && state.showWaveSummary && state.waveSummary) {
            maybeCommentLocally("waveClear");
        }

        previousStateSnapshotRef.current = state;
    }, [pruneSpeechBubbles, pushSpeechBubble, state]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            const now = performance.now();
            const currentState = stateRef.current;
            pruneSpeechBubbles(now, currentState.enemies);

            if (!currentState.waveInProgress || currentState.enemies.length === 0) {
                return;
            }

            if (now >= nextEnemyChatterAtRef.current) {
                const enemy =
                    currentState.enemies[Math.floor(Math.random() * currentState.enemies.length)];
                const line = pickEnemyAmbientLine(enemy);
                if (line) {
                    pushSpeechBubble({
                        id: `${enemy.id}-${now}`,
                        role: "enemy",
                        speakerName: enemy.archetype.name,
                        text: line,
                        expiresAt: now + 2600,
                        enemyId: enemy.id,
                        fallbackEnemyPoint: samplePath(enemy.progress),
                    });
                }
                nextEnemyChatterAtRef.current = now + 2200 + Math.random() * 2400;
            }

            if (now >= nextLocalIdleCommentaryAtRef.current && Math.random() < 0.4) {
                const commentary = pickLocalCommentary("idle");
                if (commentary) {
                    pushSpeechBubble({
                        id: `${commentary.speaker.id}-${now}`,
                        role: "local",
                        speakerName: commentary.speaker.name,
                        text: commentary.text,
                        expiresAt: now + 3200,
                        localSpeakerId: commentary.speaker.id,
                        fallbackLocalTile: {
                            x: commentary.speaker.tileX,
                            y: commentary.speaker.tileY,
                        },
                    });
                }
                nextLocalIdleCommentaryAtRef.current = now + 4200 + Math.random() * 2600;
            }
        }, 700);

        return () => window.clearInterval(intervalId);
    }, [pruneSpeechBubbles, pushSpeechBubble]);

    useEffect(() => {
        let animationId = -1;

        const draw = () => {
            const canvas = overheadCanvasRef.current;
            const rendererCanvas = mapViewer.renderer.canvas;
            if (!canvas) {
                animationId = requestAnimationFrame(draw);
                return;
            }

            const viewportWidth =
                rendererCanvas.clientWidth > 0 ? rendererCanvas.clientWidth : rendererCanvas.width;
            const viewportHeight =
                rendererCanvas.clientHeight > 0
                    ? rendererCanvas.clientHeight
                    : rendererCanvas.height;

            if (viewportWidth <= 0 || viewportHeight <= 0) {
                animationId = requestAnimationFrame(draw);
                return;
            }

            const scaledWidth = Math.max(1, Math.round(viewportWidth * pixelRatio));
            const scaledHeight = Math.max(1, Math.round(viewportHeight * pixelRatio));
            if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
                canvas.width = scaledWidth;
                canvas.height = scaledHeight;
            }

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                animationId = requestAnimationFrame(draw);
                return;
            }

            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            ctx.clearRect(0, 0, viewportWidth, viewportHeight);

            drawTdOverheadOverlay(
                ctx,
                mapViewer,
                viewportWidth,
                viewportHeight,
                stateRef.current,
                speechBubblesRef.current,
                {
                    showEnemyHealthBars: devSettings.showEnemyHealthBars,
                    showSpeechBubbles: devSettings.showSpeechBubbles,
                },
            );

            animationId = requestAnimationFrame(draw);
        };

        animationId = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animationId);
    }, [devSettings.showEnemyHealthBars, devSettings.showSpeechBubbles, mapViewer]);

    const followSelectedEnemyCamera = useCallback(
        (snap: boolean = false) => {
            const enemy =
                cameraMode === "line"
                    ? getMiddleWaveEnemy(stateRef.current.enemies)
                    : stateRef.current.selectedEnemy;
            if (!enemy) {
                return;
            }

            const lineViewSample =
                cameraMode === "line" ? getRouteSampleForProgress(enemy.progress) : undefined;
            const lineTarget = lineViewSample
                ? routePointToWorldTile(lineViewSample.current)
                : undefined;
            const lineNext = lineViewSample
                ? routePointToWorldTile(lineViewSample.next)
                : undefined;
            const target = lineTarget ?? samplePathWorldTile(enemy.progress);
            const next = lineNext ?? samplePathWorldTile(Math.min(1, enemy.progress + 0.005));
            const directionX = lineViewSample ? next.x - target.x : next.x - target.x;
            const directionZ = lineViewSample ? next.y - target.y : next.y - target.y;
            const directionLength = Math.hypot(directionX, directionZ) || 1;
            const normalizedX = directionX / directionLength;
            const normalizedZ = directionZ / directionLength;
            const tdMap = mapViewer.renderer.mapManager.getMap(
                LUMBRIDGE_TD_MAP_X,
                LUMBRIDGE_TD_MAP_Y,
            ) as WebGLMapSquare | undefined;
            const localX = target.x - LUMBRIDGE_TD_MAP_X * 64;
            const localY = target.y - LUMBRIDGE_TD_MAP_Y * 64;
            const groundHeight = tdMap ? getLocalWorldHeight(tdMap, localX, localY) : 0;
            const camera = mapViewer.camera;
            const progress = snap ? 1 : cameraMode === "line" ? 0.18 : 0.16;
            const targetYaw =
                cameraMode === "line"
                    ? (((1024 + Math.atan2(-normalizedX, -normalizedZ) / (Math.PI / 1024)) % 2048) +
                          2048) %
                      2048
                    : camera.yaw;
            const targetPitch = cameraMode === "line" ? -42 : camera.pitch;
            const averageEnemyHeight =
                cameraMode === "line"
                    ? getAverageEnemyHeight(stateRef.current.enemies)
                    : getFallbackEnemyOverheadHeight(enemy);
            const targetHeight =
                cameraMode === "line" ? groundHeight - averageEnemyHeight - 0.1 : camera.pos[1];
            const targetX = cameraMode === "line" ? target.x - normalizedX * 2.6 : target.x;
            const targetZ = cameraMode === "line" ? target.y - normalizedZ * 2.6 : target.y;

            camera.pos[0] = lerp(camera.pos[0], targetX, progress);
            camera.pos[1] = lerp(camera.pos[1], targetHeight, progress);
            camera.pos[2] = lerp(camera.pos[2], targetZ, progress);
            camera.pitch = lerp(camera.pitch, targetPitch, progress);
            if (cameraMode === "line") {
                camera.yaw = snap ? targetYaw : slerp(camera.yaw, targetYaw, progress, 2048);
            }
            camera.updated = true;
        },
        [cameraMode, mapViewer],
    );

    useEffect(() => {
        let animationId = -1;
        let last = performance.now();
        let snapshotTimer = 0;

        const frame = (time: number) => {
            const delta = Math.min(50, time - last);
            last = time;
            snapshotTimer += delta;

            stateRef.current = tickLumbridgeTd(stateRef.current, delta);
            followSelectedEnemyCamera();

            if (snapshotTimer >= 50) {
                snapshotTimer = 0;
                setState({ ...stateRef.current });
            }

            animationId = requestAnimationFrame(frame);
        };

        animationId = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(animationId);
    }, [followSelectedEnemyCamera, mapViewer]);

    useEffect(() => {
        setRouteDraft(getLumbridgeTdRoute());
        setPadDraft(getLumbridgeTdPads());
        setSelectedPadIndex(undefined);
        setPadPlacementArmed(false);
    }, [routeEditorOpen]);

    useEffect(() => {
        const onEnemySelected = (event: CustomEvent<{ id: string }>) => {
            const enemy = stateRef.current.enemies.find(
                (candidate) => candidate.id === event.detail.id,
            );
            if (!enemy) {
                return;
            }
            stateRef.current = selectEnemy(stateRef.current, enemy);
            setState({ ...stateRef.current });
            followSelectedEnemyCamera(true);
        };
        window.addEventListener(LUMBRIDGE_TD_ENEMY_SELECTED, onEnemySelected as EventListener);
        return () =>
            window.removeEventListener(
                LUMBRIDGE_TD_ENEMY_SELECTED,
                onEnemySelected as EventListener,
            );
    }, [followSelectedEnemyCamera]);

    useEffect(() => {
        followSelectedEnemyCamera(true);
    }, [cameraMode, followSelectedEnemyCamera]);

    useEffect(() => {
        const canvas = mapViewer.renderer.canvas;
        const onMouseMove = (event: globalThis.MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
            ) {
                setBuildPreview(undefined);
                return;
            }
            setBuildPreview({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            });
        };
        const cancelBuild = (event: globalThis.MouseEvent) => {
            if (!buildMode) {
                return;
            }
            event.preventDefault();
            setBuildMode(undefined);
            setHoveredPadId(undefined);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setBuildMode(undefined);
                setHoveredPadId(undefined);
            } else if (buildMode && event.key.toLowerCase() === "r") {
                setBuildRotation((rotation) => (rotation + 1) % 4);
            }
        };
        const onWheel = (event: WheelEvent) => {
            if (!buildMode) {
                return;
            }
            event.preventDefault();
            setBuildRotation((rotation) => (rotation + (event.deltaY > 0 ? 1 : 3)) % 4);
        };

        window.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("contextmenu", cancelBuild);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            canvas.removeEventListener("contextmenu", cancelBuild);
            canvas.removeEventListener("wheel", onWheel);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [buildMode, mapViewer]);

    useEffect(() => {
        emitLumbridgeTdTowersChanged(
            state.towers.map((tower) => ({
                id: tower.id,
                padId: tower.padId,
                kind: tower.kind,
                level: tower.level,
                rotation: tower.rotation,
                hp: tower.hp,
                maxHp: tower.maxHp,
                world: tower.world,
            })),
        );
    }, [state.towers]);

    useEffect(() => {
        let animationId = -1;

        const updatePadAnchors = () => {
            const nextAnchors: Record<string, { x: number; y: number; z: number }> = {};
            let ready = true;

            for (const pad of padDraft) {
                const anchor = getLumbridgePadWorldAnchor(mapViewer, pad);
                if (!anchor) {
                    ready = false;
                    break;
                }
                nextAnchors[pad.id] = anchor;
            }

            if (ready) {
                setPadWorldAnchors((current) => {
                    const currentKeys = Object.keys(current);
                    const nextKeys = Object.keys(nextAnchors);
                    if (
                        currentKeys.length === nextKeys.length &&
                        nextKeys.every((key) => {
                            const lhs = current[key];
                            const rhs = nextAnchors[key];
                            return (
                                lhs && rhs && lhs.x === rhs.x && lhs.y === rhs.y && lhs.z === rhs.z
                            );
                        })
                    ) {
                        return current;
                    }
                    return nextAnchors;
                });
                return;
            }

            animationId = requestAnimationFrame(updatePadAnchors);
        };

        animationId = requestAnimationFrame(updatePadAnchors);
        return () => cancelAnimationFrame(animationId);
    }, [mapViewer, padDraft]);

    useEffect(() => {
        let animationId = -1;

        const updateWorldRouteOverlay = () => {
            const tdMap = mapViewer.renderer.mapManager.getMap(
                LUMBRIDGE_TD_MAP_X,
                LUMBRIDGE_TD_MAP_Y,
            ) as WebGLMapSquare | undefined;
            const canvas = mapViewer.renderer.canvas;
            if (!tdMap || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
                animationId = requestAnimationFrame(updateWorldRouteOverlay);
                return;
            }

            const nextPolygons: string[] = [];
            const nextLinePoints: string[] = [];
            const nextPadOverlays: ProjectedTowerPad[] = [];
            for (const point of routeDraft) {
                const corners = getProjectedTileCorners(mapViewer, tdMap, point.x, point.y);
                if (corners.length === 4) {
                    nextPolygons.push(corners.map((corner) => `${corner.x},${corner.y}`).join(" "));
                }

                const center = projectWorldPoint(
                    mapViewer,
                    LUMBRIDGE_TD_MAP_X * 64 + point.x + 0.5,
                    getWorldTileHeight(tdMap, point.x, point.y),
                    LUMBRIDGE_TD_MAP_Y * 64 + point.y + 0.5,
                );
                if (center) {
                    nextLinePoints.push(`${center.x},${center.y}`);
                }
            }

            for (const pad of padDraft) {
                const tower = state.towers.find((candidate) => candidate.padId === pad.id);
                const canBuildHere = isTowerPadCompatible(pad, state.selectedTower);
                const previewKind = tower
                    ? tower.kind
                    : pad.kind === "barricade"
                    ? "barricade"
                    : canBuildHere
                    ? state.selectedTower
                    : "bolt";
                const towerDef = TOWER_DEFS[previewKind];
                const padColor = tower
                    ? towerDef.color
                    : pad.kind === "barricade"
                    ? TD_EMPTY_BARRICADE_PAD_COLOR
                    : TD_EMPTY_TOWER_PAD_COLOR;
                const towerStats = tower ? getTowerStats(tower) : towerDef;
                const rangePolygon =
                    towerStats.range > 0
                        ? getProjectedGroundCircle(
                              mapViewer,
                              tdMap,
                              pad.tileX + 0.5,
                              pad.tileY + 0.5,
                              towerStats.range * 64,
                          )
                        : undefined;
                const padMarker = getProjectedPadMarker(
                    mapViewer,
                    tdMap,
                    pad.tileX + 0.5,
                    pad.tileY + 0.5,
                    0.72,
                    canvas.clientWidth / Math.max(1, canvas.clientHeight),
                );
                const label = projectWorldPoint(
                    mapViewer,
                    LUMBRIDGE_TD_MAP_X * 64 + pad.tileX + 0.5,
                    getLocalWorldHeight(tdMap, pad.tileX + 0.5, pad.tileY + 0.5) + 0.08,
                    LUMBRIDGE_TD_MAP_Y * 64 + pad.tileY + 0.5,
                );

                if (padMarker && label) {
                    nextPadOverlays.push({
                        id: pad.id,
                        markerCenter: padMarker.center,
                        markerRadiusX: padMarker.radiusX,
                        markerRadiusY: padMarker.radiusY,
                        rangePolygon,
                        label,
                        color: padColor,
                        built: tower !== undefined,
                        disabled:
                            tower === undefined &&
                            (!canBuildHere || state.gold < TOWER_DEFS[state.selectedTower].cost),
                        padKind: pad.kind,
                        labelText:
                            tower && isBarricadeTowerKind(tower.kind)
                                ? ""
                                : tower
                                ? `${tower.level}`
                                : pad.kind === "barricade"
                                ? ""
                                : "",
                        towerId: tower?.id,
                        level: tower?.level,
                    });
                }
            }

            setWorldRoutePolygons((current) =>
                current.length === nextPolygons.length &&
                current.every((value, index) => value === nextPolygons[index])
                    ? current
                    : nextPolygons,
            );
            const nextLine = nextLinePoints.join(" ");
            setWorldRouteLine((current) => (current === nextLine ? current : nextLine));
            const nextPadOverlaySignature = JSON.stringify(nextPadOverlays);
            setWorldPadOverlays((current) =>
                JSON.stringify(current) === nextPadOverlaySignature ? current : nextPadOverlays,
            );

            animationId = requestAnimationFrame(updateWorldRouteOverlay);
        };

        animationId = requestAnimationFrame(updateWorldRouteOverlay);
        return () => cancelAnimationFrame(animationId);
    }, [mapViewer, padDraft, routeDraft, state.gold, state.selectedTower, state.towers]);

    const startNextWave = () => {
        stateRef.current = startWave(stateRef.current);
        setState({ ...stateRef.current });
        emitLumbridgeTdStartWave({
            wave: stateRef.current.wave,
            enemyCount: stateRef.current.waveSpawnCount,
        });
    };

    const onStartBuild = (towerKind: TowerKind) => {
        stateRef.current = selectTower(stateRef.current, towerKind);
        setState({ ...stateRef.current });
        setBuildMode(towerKind);
        setBuildRotation(0);
    };

    const placeTowerOnPad = useCallback(
        (padId: string, towerKind: TowerKind, rotation: number = 0): boolean => {
            const pad = padDraft.find((candidate) => candidate.id === padId);
            const world = pad
                ? padWorldAnchors[pad.id] ?? getLumbridgePadWorldAnchor(mapViewer, pad)
                : undefined;
            if (!pad || !world) {
                playSound(TD_SOUND_FILES.locked, 0.35);
                return false;
            }

            const placementState =
                stateRef.current.selectedTower === towerKind
                    ? stateRef.current
                    : selectTower(stateRef.current, towerKind);
            const nextState = placeTower(placementState, padId, world, rotation);
            if (nextState === placementState) {
                playSound(TD_SOUND_FILES.locked, 0.35);
                return false;
            }

            stateRef.current = nextState;
            setState({ ...stateRef.current });
            setBuildMode(undefined);
            setHoveredPadId(undefined);
            playSound(TD_SOUND_FILES.build, 0.45);
            return true;
        },
        [mapViewer, padDraft, padWorldAnchors, playSound],
    );

    const onPlaceTower = (padId: string) => {
        if (!buildMode) {
            return;
        }
        placeTowerOnPad(padId, buildMode, buildRotation);
    };

    const onReset = () => {
        const waveConfigs = stateRef.current.waveConfigs;
        stateRef.current = { ...resetGame(), waveConfigs };
        setState({ ...stateRef.current });
        syncSpeechBubbles([]);
        previousStateSnapshotRef.current = stateRef.current;
        setIntroStep(0);
        setBuildMode(undefined);
        setHoveredPadId(undefined);
        emitLumbridgeTdReset();
    };

    const onDismissWaveSummary = () => {
        stateRef.current = dismissWaveSummary(stateRef.current);
        setState({ ...stateRef.current });
    };

    const onStartNextWaveFromSummary = () => {
        stateRef.current = startWaveFromSummary(stateRef.current);
        setState({ ...stateRef.current });
        emitLumbridgeTdStartWave({
            wave: stateRef.current.wave,
            enemyCount: stateRef.current.waveSpawnCount,
        });
    };

    const onDeselectEnemy = () => {
        stateRef.current = deselectEnemy(stateRef.current);
        setState({ ...stateRef.current });
    };

    const onSelectPlacedTower = (towerId: string) => {
        stateRef.current = selectPlacedTower(stateRef.current, towerId);
        setState({ ...stateRef.current });
    };

    const onDeselectTower = () => {
        stateRef.current = deselectTower(stateRef.current);
        setState({ ...stateRef.current });
    };

    const closeTowerMenu = useCallback(() => {
        setTowerMenu(undefined);
    }, []);

    const openPadBuildMenu = useCallback(
        (event: MouseEvent<SVGCircleElement | SVGEllipseElement>, pad: ProjectedTowerPad) => {
            event.preventDefault();
            event.stopPropagation();

            const overlayRect = overlayRef.current?.getBoundingClientRect();
            const x = overlayRect ? event.clientX - overlayRect.left : event.clientX;
            const y = overlayRect ? event.clientY - overlayRect.top : event.clientY;
            const buildKinds =
                pad.padKind === "barricade"
                    ? (["barricade"] as TowerKind[])
                    : TD_COMBAT_TOWER_KINDS;

            setTowerMenu({
                x,
                y,
                entries: [
                    ...buildKinds.map((towerKind) => {
                        const def = TOWER_DEFS[towerKind];
                        const canAfford = stateRef.current.gold >= def.cost;
                        return {
                            option: `(Costs ${def.cost}gp) Build`,
                            targetId: -1,
                            targetType: MenuTargetType.LOC,
                            targetName: getTowerName(towerKind),
                            targetLevel: 0,
                            className: canAfford ? undefined : "unavailable",
                            onClick: () => {
                                closeTowerMenu();
                                placeTowerOnPad(pad.id, towerKind);
                            },
                        } satisfies OsrsMenuEntry;
                    }),
                    {
                        option: "Cancel",
                        targetId: -1,
                        targetType: MenuTargetType.NONE,
                        targetName: "",
                        targetLevel: 0,
                        onClick: closeTowerMenu,
                    },
                ],
            });
            setHoveredPadId(pad.id);
        },
        [closeTowerMenu, placeTowerOnPad],
    );

    const onUpgradeTowerById = useCallback(
        (towerId: string | null | undefined) => {
            if (!towerId) {
                playSound(TD_SOUND_FILES.locked, 0.35);
                return;
            }
            const nextState = upgradeTower(stateRef.current, towerId);
            if (nextState === stateRef.current) {
                playSound(TD_SOUND_FILES.locked, 0.35);
                return;
            }
            stateRef.current = nextState;
            setState({ ...stateRef.current });
            playSound(TD_SOUND_FILES.upgrade, 0.45);
        },
        [playSound],
    );

    const onUpgradeSelectedTower = () => {
        if (!stateRef.current.selectedTowerId) {
            playSound(TD_SOUND_FILES.locked, 0.35);
            return;
        }
        onUpgradeTowerById(stateRef.current.selectedTowerId);
    };

    const openTowerMenu = useCallback(
        (event: MouseEvent<SVGCircleElement | SVGEllipseElement>, padId: string) => {
            event.preventDefault();
            event.stopPropagation();

            const tower = stateRef.current.towers.find((candidate) => candidate.padId === padId);
            if (!tower) {
                closeTowerMenu();
                return;
            }

            const towerName = getTowerName(tower.kind, tower.level);
            const upgradeCost = getTowerUpgradeCost(tower);
            const overlayRect = overlayRef.current?.getBoundingClientRect();
            const x = overlayRect ? event.clientX - overlayRect.left : event.clientX;
            const y = overlayRect ? event.clientY - overlayRect.top : event.clientY;

            setTowerMenu({
                x,
                y,
                entries: [
                    {
                        option: "Select",
                        targetId: -1,
                        targetType: MenuTargetType.LOC,
                        targetName: towerName,
                        targetLevel: 0,
                        onClick: () => {
                            closeTowerMenu();
                            onSelectPlacedTower(tower.id);
                        },
                    },
                    ...(upgradeCost !== undefined
                        ? [
                              {
                                  option: `Upgrade ${upgradeCost}g`,
                                  targetId: -1,
                                  targetType: MenuTargetType.LOC,
                                  targetName: towerName,
                                  targetLevel: 0,
                                  onClick: () => {
                                      closeTowerMenu();
                                      onUpgradeTowerById(tower.id);
                                  },
                              } satisfies OsrsMenuEntry,
                          ]
                        : []),
                    {
                        option: "Examine",
                        targetId: -1,
                        targetType: MenuTargetType.LOC,
                        targetName: towerName,
                        targetLevel: 0,
                        onClick: () => {
                            closeTowerMenu();
                            onSelectPlacedTower(tower.id);
                        },
                    },
                    {
                        option: "Cancel",
                        targetId: -1,
                        targetType: MenuTargetType.NONE,
                        targetName: "",
                        targetLevel: 0,
                        onClick: closeTowerMenu,
                    },
                ],
            });

            onSelectPlacedTower(tower.id);
        },
        [closeTowerMenu, onUpgradeTowerById],
    );

    const commitRouteDraft = (nextRoute: typeof routeDraft) => {
        setRouteDraft(nextRoute);
        setLumbridgeTdRoute(nextRoute);
        emitLumbridgeTdReset();
    };

    const syncStateToPads = (nextPads: readonly LumbridgeTdPad[]) => {
        const nextPadIds = new Set(nextPads.map((pad) => pad.id));
        const nextTowers = stateRef.current.towers
            .filter((tower) => nextPadIds.has(tower.padId))
            .map((tower) => {
                const pad = nextPads.find((candidate) => candidate.id === tower.padId);
                if (!pad) {
                    return tower;
                }
                if (!isTowerPadCompatible(pad, tower.kind)) {
                    return undefined;
                }
                const world =
                    padWorldAnchors[pad.id] ??
                    getLumbridgePadWorldAnchor(mapViewer, pad) ??
                    tower.world;
                return { ...tower, world };
            })
            .filter((tower): tower is Tower => tower !== undefined);
        const selectedTowerExists =
            stateRef.current.selectedTowerId !== null &&
            nextTowers.some((tower) => tower.id === stateRef.current.selectedTowerId);

        stateRef.current = {
            ...stateRef.current,
            towers: nextTowers,
            selectedTowerId: selectedTowerExists ? stateRef.current.selectedTowerId : null,
            showTowerInfo: selectedTowerExists ? stateRef.current.showTowerInfo : false,
        };
        setState({ ...stateRef.current });
    };

    const commitPadDraft = (nextPads: LumbridgeTdPad[]) => {
        setPadDraft(nextPads);
        setLumbridgeTdPads(nextPads);
        syncStateToPads(nextPads);
    };

    const updateRoutePointAtIndex = (index: number, point: { x: number; y: number }) => {
        const nextRoute = routeDraft.map((candidate, candidateIndex) =>
            candidateIndex === index
                ? {
                      x: Math.max(0, Math.min(63, point.x | 0)),
                      y: Math.max(0, Math.min(63, point.y | 0)),
                  }
                : candidate,
        );
        commitRouteDraft(nextRoute);
    };

    const getRouteTileFromEvent = (event: { clientX: number; clientY: number }) => {
        const rect = routeEditorRef.current?.getBoundingClientRect();
        if (!rect) {
            return undefined;
        }
        const normalizedX = (event.clientX - rect.left) / rect.width;
        const normalizedY = (event.clientY - rect.top) / rect.height;
        return routeEditorPointToLocalTile(normalizedX, normalizedY);
    };

    const onRouteEditorClick = (event: MouseEvent<HTMLDivElement>) => {
        const point = getRouteTileFromEvent(event);
        if (!point) {
            return;
        }

        if (padPlacementArmed) {
            const existingIds = new Set(padDraft.map((pad) => pad.id));
            let nextIndex = padDraft.length + 1;
            while (existingIds.has(`pad-${nextIndex}`)) {
                nextIndex++;
            }
            const nextPads = [
                ...padDraft,
                createLumbridgeTdPad(`pad-${nextIndex}`, point.x, point.y),
            ];
            commitPadDraft(nextPads);
            setSelectedPadIndex(nextPads.length - 1);
            setSelectedRoutePointIndex(undefined);
            setPadPlacementArmed(false);
            return;
        }

        const insertAt =
            selectedRoutePointIndex === undefined ? routeDraft.length : selectedRoutePointIndex + 1;
        const nextRoute = [...routeDraft.slice(0, insertAt), point, ...routeDraft.slice(insertAt)];
        commitRouteDraft(nextRoute);
        setSelectedRoutePointIndex(insertAt);
        setSelectedPadIndex(undefined);
    };

    const undoRoutePoint = () => {
        const nextRoute = routeDraft.slice(0, -1);
        commitRouteDraft(nextRoute);
        setSelectedRoutePointIndex((index) =>
            index === undefined ? undefined : Math.min(index, nextRoute.length - 1),
        );
    };

    const clearRoute = () => {
        commitRouteDraft([]);
        setSelectedRoutePointIndex(undefined);
    };

    const resetRoute = () => {
        const nextRoute = getDefaultLumbridgeTdRoute();
        resetLumbridgeTdRoute();
        setRouteDraft(nextRoute);
        setSelectedRoutePointIndex(undefined);
        emitLumbridgeTdReset();
    };

    const removeSelectedRoutePoint = () => {
        if (selectedRoutePointIndex === undefined) {
            return;
        }
        const nextRoute = routeDraft.filter((_, index) => index !== selectedRoutePointIndex);
        commitRouteDraft(nextRoute);
        setSelectedRoutePointIndex(
            nextRoute.length === 0
                ? undefined
                : Math.min(selectedRoutePointIndex, nextRoute.length - 1),
        );
    };

    const reverseRoute = () => {
        const nextRoute = [...routeDraft].reverse();
        commitRouteDraft(nextRoute);
        setSelectedRoutePointIndex((index) =>
            index === undefined ? undefined : nextRoute.length - 1 - index,
        );
    };

    const copyRouteToClipboard = () => {
        const routeJson = JSON.stringify(routeDraft, null, 2);
        void navigator.clipboard?.writeText(routeJson);
    };

    const onRoutePointMouseDown = (event: MouseEvent<HTMLDivElement>, index: number) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedRoutePointIndex(index);
        setSelectedPadIndex(undefined);
        setPadPlacementArmed(false);

        const onMove = (moveEvent: globalThis.MouseEvent) => {
            const point = getRouteTileFromEvent(moveEvent);
            if (!point) {
                return;
            }
            updateRoutePointAtIndex(index, point);
        };
        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const updatePadAtIndex = (
        index: number,
        patch: Partial<Pick<LumbridgeTdPad, "tileX" | "tileY" | "kind">>,
    ) => {
        const currentPad = padDraft[index];
        if (!currentPad) {
            return;
        }

        const nextPad = createLumbridgeTdPad(
            currentPad.id,
            patch.tileX ?? currentPad.tileX,
            patch.tileY ?? currentPad.tileY,
            {
                kind: patch.kind ?? currentPad.kind,
            },
        );
        const nextPads = padDraft.map((pad, padIndex) => (padIndex === index ? nextPad : pad));
        commitPadDraft(nextPads);
    };

    const onPadPointMouseDown = (event: MouseEvent<HTMLDivElement>, index: number) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedPadIndex(index);
        setSelectedRoutePointIndex(undefined);
        setPadPlacementArmed(false);

        const onMove = (moveEvent: globalThis.MouseEvent) => {
            const point = getRouteTileFromEvent(moveEvent);
            if (!point) {
                return;
            }
            updatePadAtIndex(index, point);
        };
        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const updateSelectedRoutePoint = (patch: Partial<{ x: number; y: number }>) => {
        if (selectedRoutePointIndex === undefined) {
            return;
        }

        const currentPoint = routeDraft[selectedRoutePointIndex];
        if (!currentPoint) {
            return;
        }

        updateRoutePointAtIndex(selectedRoutePointIndex, {
            x: patch.x ?? currentPoint.x,
            y: patch.y ?? currentPoint.y,
        });
    };

    const nudgeSelectedRoutePoint = (deltaX: number, deltaY: number, distance: number = 1) => {
        if (selectedRoutePointIndex === undefined) {
            return;
        }

        const currentPoint = routeDraft[selectedRoutePointIndex];
        if (!currentPoint) {
            return;
        }

        updateRoutePointAtIndex(selectedRoutePointIndex, {
            x: currentPoint.x + deltaX * distance,
            y: currentPoint.y + deltaY * distance,
        });
    };

    const updateSelectedPad = (
        patch: Partial<Pick<LumbridgeTdPad, "tileX" | "tileY" | "kind">>,
    ) => {
        if (selectedPadIndex === undefined) {
            return;
        }

        updatePadAtIndex(selectedPadIndex, patch);
    };

    const nudgeSelectedPad = (deltaX: number, deltaY: number, distance: number = 1) => {
        if (selectedPadIndex === undefined) {
            return;
        }

        const currentPad = padDraft[selectedPadIndex];
        if (!currentPad) {
            return;
        }

        updatePadAtIndex(selectedPadIndex, {
            tileX: currentPad.tileX + deltaX * distance,
            tileY: currentPad.tileY + deltaY * distance,
        });
    };

    const removeSelectedPad = () => {
        if (selectedPadIndex === undefined) {
            return;
        }

        const nextPads = padDraft.filter((_, index) => index !== selectedPadIndex);
        commitPadDraft(nextPads);
        setSelectedPadIndex(
            nextPads.length === 0 ? undefined : Math.min(selectedPadIndex, nextPads.length - 1),
        );
    };

    const clearPads = () => {
        commitPadDraft([]);
        setSelectedPadIndex(undefined);
        setPadPlacementArmed(false);
    };

    const resetPads = () => {
        const nextPads = getDefaultLumbridgeTdPads();
        resetLumbridgeTdPads();
        setPadDraft(nextPads);
        setSelectedPadIndex(undefined);
        setPadPlacementArmed(false);
        syncStateToPads(nextPads);
    };

    const copyPadsToClipboard = () => {
        const padsJson = JSON.stringify(
            padDraft.map(({ id, tileX, tileY, kind }) => ({ id, tileX, tileY, kind })),
            null,
            2,
        );
        void navigator.clipboard?.writeText(padsJson);
    };

    useEffect(() => {
        if (!routeEditorOpen) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const tagName = target?.tagName;
            if (
                target?.isContentEditable ||
                tagName === "INPUT" ||
                tagName === "SELECT" ||
                tagName === "TEXTAREA"
            ) {
                return;
            }

            const step = event.shiftKey ? 5 : 1;
            switch (event.key) {
                case "ArrowUp":
                    event.preventDefault();
                    if (selectedRoutePointIndex !== undefined) {
                        nudgeSelectedRoutePoint(0, -1, step);
                    } else {
                        nudgeSelectedPad(0, -1, step);
                    }
                    break;
                case "ArrowDown":
                    event.preventDefault();
                    if (selectedRoutePointIndex !== undefined) {
                        nudgeSelectedRoutePoint(0, 1, step);
                    } else {
                        nudgeSelectedPad(0, 1, step);
                    }
                    break;
                case "ArrowLeft":
                    event.preventDefault();
                    if (selectedRoutePointIndex !== undefined) {
                        nudgeSelectedRoutePoint(-1, 0, step);
                    } else {
                        nudgeSelectedPad(-1, 0, step);
                    }
                    break;
                case "ArrowRight":
                    event.preventDefault();
                    if (selectedRoutePointIndex !== undefined) {
                        nudgeSelectedRoutePoint(1, 0, step);
                    } else {
                        nudgeSelectedPad(1, 0, step);
                    }
                    break;
                case "Backspace":
                case "Delete":
                    if (selectedRoutePointIndex !== undefined) {
                        event.preventDefault();
                        removeSelectedRoutePoint();
                        break;
                    }
                    if (selectedPadIndex !== undefined) {
                        event.preventDefault();
                        removeSelectedPad();
                    }
                    break;
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    });

    const setSelectedWaveConfig = (config: WaveConfig) => {
        stateRef.current = updateWaveConfig(stateRef.current, selectedWaveNumber, config);
        setState({ ...stateRef.current });
    };

    const updateWaveEnemy = (
        targetEnemy: Pick<WaveEnemyConfig, "npcId" | "archetypeName">,
        patch: Partial<WaveEnemyConfig>,
    ) => {
        const config = getWaveConfig(stateRef.current, selectedWaveNumber);
        const nextEnemies = config.enemies.map((enemy) =>
            isSameWaveEnemy(enemy, targetEnemy) ? { ...enemy, ...patch } : enemy,
        );
        setSelectedWaveConfig({ ...config, enemies: nextEnemies });
    };

    const addWaveEnemy = (entry: WaveEnemyConfig) => {
        const config = getWaveConfig(stateRef.current, selectedWaveNumber);
        const existing = config.enemies.find((enemy) => isSameWaveEnemy(enemy, entry));
        if (existing) {
            updateWaveEnemy(existing, { count: existing.count + 1 });
            return;
        }

        setSelectedWaveConfig({
            ...config,
            enemies: [...config.enemies, entry],
        });
        setWaveEnemySearch("");
    };

    const removeWaveEnemy = (targetEnemy: Pick<WaveEnemyConfig, "npcId" | "archetypeName">) => {
        const config = getWaveConfig(stateRef.current, selectedWaveNumber);
        setSelectedWaveConfig({
            ...config,
            enemies: config.enemies.filter((enemy) => !isSameWaveEnemy(enemy, targetEnemy)),
        });
    };

    const updateWaveEnemyCount = (
        targetEnemy: Pick<WaveEnemyConfig, "npcId" | "archetypeName">,
        count: number,
    ) => {
        updateWaveEnemy(targetEnemy, { count });
    };

    const updateWaveEnemyMultiplier = (
        targetEnemy: Pick<WaveEnemyConfig, "npcId" | "archetypeName">,
        key: "hpMultiplier" | "speedMultiplier" | "rewardMultiplier",
        value: number,
    ) => {
        updateWaveEnemy(targetEnemy, { [key]: value });
    };

    const updateWaveEnemyBaseStat = (
        targetEnemy: Pick<WaveEnemyConfig, "npcId" | "archetypeName">,
        key: "baseHp" | "baseSpeed" | "baseReward",
        value: number,
    ) => {
        updateWaveEnemy(targetEnemy, { [key]: value });
    };

    const resetSelectedWaveConfig = () => {
        stateRef.current = resetWaveConfig(stateRef.current, selectedWaveNumber);
        setState({ ...stateRef.current });
    };

    const applyLevelDefinition = (
        level: LumbridgeTdLevelDefinition,
        options?: { levelName?: string; levelId?: string },
    ) => {
        const nextRoute = level.route.map((point) => ({ ...point }));
        const nextPads = clonePads(level.pads);
        setLumbridgeTdRoute(nextRoute);
        setLumbridgeTdPads(nextPads);
        setRouteDraft(nextRoute);
        setPadDraft(nextPads);
        setSelectedRoutePointIndex(undefined);
        setSelectedPadIndex(undefined);
        setPadPlacementArmed(false);

        stateRef.current = buildStateFromLevelDefinition(level);
        setState({ ...stateRef.current });
        syncSpeechBubbles([]);
        previousStateSnapshotRef.current = stateRef.current;
        setIntroStep(0);
        setBuildMode(undefined);
        setHoveredPadId(undefined);
        setSelectedWaveNumber(1);
        setWaveEnemySearch("");

        if (options?.levelName) {
            setSavedLevelName(options.levelName);
        }
        setSelectedSavedLevelId(options?.levelId);
        emitLumbridgeTdReset();
    };

    const saveCurrentLevel = (existingId?: string) => {
        const name = savedLevelName.trim() || "Untitled Level";
        const snapshot = createLevelDefinition(routeDraft, padDraft, stateRef.current.waveConfigs);
        const { savedLevel, levels } = saveLumbridgeTdLevel(name, snapshot, existingId);
        setSavedLevels(levels);
        setSelectedSavedLevelId(savedLevel.id);
        setSavedLevelName(savedLevel.name);
    };

    const loadSelectedSavedLevel = () => {
        if (!selectedSavedLevelId) {
            return;
        }

        const savedLevel = savedLevels.find((level) => level.id === selectedSavedLevelId);
        if (!savedLevel) {
            return;
        }

        applyLevelDefinition(savedLevel, {
            levelName: savedLevel.name,
            levelId: savedLevel.id,
        });
    };

    const deleteSelectedSavedLevel = () => {
        if (!selectedSavedLevelId) {
            return;
        }

        const levels = deleteLumbridgeTdSavedLevel(selectedSavedLevelId);
        setSavedLevels(levels);
        setSelectedSavedLevelId(undefined);
        setSavedLevelName("Lumbridge Variant");
    };

    const getPanelPosition = (
        key: DraggablePanelKey,
        fallback: DraggablePanelPosition,
    ): DraggablePanelPosition => panelPositions[key] ?? fallback;

    const getRightRailPosition = (): DraggablePanelPosition => {
        if (panelPositions.rightRail) {
            return panelPositions.rightRail;
        }
        const viewportWidth = window.innerWidth || 1280;
        return {
            x: Math.max(12, viewportWidth - 385),
            y: 12,
        };
    };

    const getSettingsPosition = (): DraggablePanelPosition => {
        if (panelPositions.settings) {
            return panelPositions.settings;
        }

        const viewportWidth = window.innerWidth || 1280;
        const panelWidth = Math.min(780, Math.max(420, viewportWidth - 40));
        return {
            x: Math.max(14, Math.round((viewportWidth - panelWidth) * 0.5)),
            y: 72,
        };
    };

    const getPanelStyle = (
        key: DraggablePanelKey,
        fallback: DraggablePanelPosition,
    ): CSSProperties => {
        const position =
            key === "rightRail"
                ? getRightRailPosition()
                : key === "settings"
                ? getSettingsPosition()
                : getPanelPosition(key, fallback);
        return {
            left: `${position.x}px`,
            top: `${position.y}px`,
        };
    };

    const onPanelDragStart = (
        key: DraggablePanelKey,
        event: MouseEvent<HTMLElement>,
        fallback: DraggablePanelPosition,
    ) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, select, textarea")) {
            return;
        }

        const panel = event.currentTarget.closest(".td-draggable-panel") as HTMLElement | null;
        if (!panel) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const rect = panel.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        const onMove = (moveEvent: globalThis.MouseEvent) => {
            const maxX = Math.max(0, window.innerWidth - rect.width);
            const maxY = Math.max(
                0,
                window.innerHeight - Math.min(rect.height, window.innerHeight),
            );
            const nextPosition = {
                x: Math.max(0, Math.min(maxX, moveEvent.clientX - offsetX)),
                y: Math.max(0, Math.min(maxY, moveEvent.clientY - offsetY)),
            };
            setPanelPositions((current) => ({
                ...current,
                [key]: nextPosition,
            }));
        };
        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        setPanelPositions((current) => ({
            ...current,
            [key]:
                key === "rightRail"
                    ? getRightRailPosition()
                    : key === "settings"
                    ? getSettingsPosition()
                    : getPanelPosition(key, fallback),
        }));
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const routeImageUrl = mapViewer.getMapImageUrl(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y, false);
    const routeDraftPoints = routeDraft.map(localTileToRouteEditorPoint);
    const padDraftPoints = padDraft.map((pad) =>
        localTileToRouteEditorPoint({ x: pad.tileX, y: pad.tileY }),
    );
    const selectedRoutePoint =
        selectedRoutePointIndex === undefined ? undefined : routeDraft[selectedRoutePointIndex];
    const selectedPad = selectedPadIndex === undefined ? undefined : padDraft[selectedPadIndex];
    const selectedSavedLevel = selectedSavedLevelId
        ? savedLevels.find((level) => level.id === selectedSavedLevelId)
        : undefined;
    const activeWaveConfig = getWaveConfig(state, selectedWaveNumber);
    const configuredWaveEnemyKeys = new Set(
        activeWaveConfig.enemies.map((enemy) => getWaveEnemyConfigKey(enemy)),
    );
    const normalizedWaveEnemySearch = deferredWaveEnemySearch.trim().toLowerCase();
    const filteredEnemyCatalog = enemyCatalog
        .filter((entry) => {
            if (configuredWaveEnemyKeys.has(entry.key)) {
                return false;
            }
            if (!normalizedWaveEnemySearch) {
                return entry.source === "preset";
            }
            return (
                entry.config.archetypeName.toLowerCase().includes(normalizedWaveEnemySearch) ||
                `${entry.config.npcId ?? ""}`.includes(normalizedWaveEnemySearch)
            );
        })
        .slice(0, normalizedWaveEnemySearch ? 12 : 6);
    const towerKinds = TD_COMBAT_TOWER_KINDS;
    const barricadePadCount = padDraft.filter((pad) => pad.kind === "barricade").length;
    const builtBarricadeCount = state.towers.filter((tower) => tower.kind === "barricade").length;
    const canBuildBarricade =
        state.gold >= TOWER_DEFS.barricade.cost && builtBarricadeCount < barricadePadCount;
    const introLine = DUKE_HORACIO_INTRO_LINES[introStep];
    const showDeathScreen = state.gameOver;
    const selectedTower =
        devSettings.showTowerInfoPanel && state.showTowerInfo && state.selectedTowerId
            ? state.towers.find((tower) => tower.id === state.selectedTowerId)
            : undefined;
    const selectedTowerDef = selectedTower ? TOWER_DEFS[selectedTower.kind] : undefined;
    const selectedTowerStats = selectedTower ? getTowerStats(selectedTower) : undefined;
    const selectedTowerUpgradeCost = selectedTower ? getTowerUpgradeCost(selectedTower) : undefined;
    const nextTowerStats =
        selectedTower && selectedTowerUpgradeCost !== undefined
            ? getTowerStats({ ...selectedTower, level: selectedTower.level + 1 })
            : undefined;
    const selectedTowerHasIcon = selectedTower
        ? hasTowerIcon(selectedTower.kind, selectedTower.level)
        : false;
    const buildModeHasIcon = buildMode ? hasTowerIcon(buildMode) : false;
    const hoveredPadOverlay = hoveredPadId
        ? worldPadOverlays.find((pad) => pad.id === hoveredPadId)
        : undefined;
    const buildTargetValid = !!hoveredPadOverlay && !hoveredPadOverlay.disabled;
    const enabledToggleCount = Object.values(devSettings).filter(Boolean).length;
    const focusRendererCanvas = useCallback(() => {
        mapViewer.renderer.canvas.focus();
    }, [mapViewer]);

    return (
        <div
            ref={overlayRef}
            className="td-overlay"
            onClick={() => {
                if (state.selectedEnemy) {
                    onDeselectEnemy();
                }
                if (state.selectedTowerId) {
                    onDeselectTower();
                }
                closeTowerMenu();
            }}
        >
            {towerMenu && (
                <div
                    className="td-world-menu-layer"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (event.target === event.currentTarget) {
                            closeTowerMenu();
                        }
                    }}
                    onMouseDown={(event) => {
                        event.stopPropagation();
                        if (event.target === event.currentTarget) {
                            focusRendererCanvas();
                            closeTowerMenu();
                        }
                    }}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.target === event.currentTarget) {
                            focusRendererCanvas();
                            closeTowerMenu();
                        }
                    }}
                >
                    <OsrsMenu
                        x={towerMenu.x}
                        y={towerMenu.y}
                        entries={towerMenu.entries}
                        tooltip={false}
                        debugId={false}
                    />
                </div>
            )}

            {introLine && (
                <div
                    className="td-intro-screen"
                    onClick={(event) => {
                        event.stopPropagation();
                        setIntroStep((step) => step + 1);
                    }}
                >
                    <div className="td-intro-dialog rs-border">
                        <div className="td-intro-chat-head" aria-hidden="true">
                            <DukeHoracioChatHeadCanvas mapViewer={mapViewer} />
                        </div>
                        <div className="td-intro-copy">
                            <div className="td-intro-name">Duke Horacio</div>
                            <div className="td-intro-line">{introLine}</div>
                            <div className="td-intro-continue">Click here to continue</div>
                        </div>
                    </div>
                </div>
            )}

            {showDeathScreen && (
                <div
                    className="td-death-screen"
                    onClick={(event) => {
                        event.stopPropagation();
                    }}
                >
                    <div className="td-death-dialog rs-border">
                        <div className="td-death-title">Lumbridge Has Fallen</div>
                        <div className="td-death-copy">
                            The town defenses were overrun.
                            <br />
                            Hitpoints reached zero.
                            <br />
                            Click reset to try again.
                        </div>
                        <div className="td-death-actions">
                            <button
                                className="td-death-button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onReset();
                                }}
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {buildMode && devSettings.showBuildPanel && (
                <div
                    className="td-build-panel td-draggable-panel rs-border rs-background"
                    style={getPanelStyle("buildPanel", { x: 12, y: 12 })}
                >
                    <div
                        className="td-panel-title td-drag-handle"
                        onMouseDown={(event) =>
                            onPanelDragStart("buildPanel", event, { x: 12, y: 12 })
                        }
                    >
                        <span>{getTowerName(buildMode)}</span>
                        <span className="td-drag-grip" aria-hidden="true" />
                    </div>
                    <div className="td-build-copy content-text">
                        <span>
                            {buildMode === "barricade"
                                ? "Click a highlighted barricade pad"
                                : "Click a highlighted pad"}
                        </span>
                        <span>
                            {buildMode === "barricade" ? "Blocks the route" : "R or wheel rotates"}
                        </span>
                        <span>Right-click or Esc cancels</span>
                    </div>
                    <div className="td-legend content-text">
                        {buildMode !== "barricade" && (
                            <span>
                                <i className="td-legend-range" />
                                Attack range
                            </span>
                        )}
                        <span>
                            <i className="td-legend-invalid" />
                            Cannot place
                        </span>
                    </div>
                </div>
            )}

            <div
                className="td-right-rail td-draggable-panel"
                style={getPanelStyle("rightRail", getRightRailPosition())}
            >
                <div
                    className="td-rail-drag-handle td-drag-handle rs-border rs-background"
                    onMouseDown={(event) =>
                        onPanelDragStart("rightRail", event, getRightRailPosition())
                    }
                >
                    <span className="td-drag-grip" aria-hidden="true" />
                </div>
                <div className="td-hud rs-border rs-background">
                    <div className="td-header">Lumbridge Defense</div>
                    <div className="td-stats content-text">
                        <span className="td-stat-wave">
                            <span>Wave {state.wave}</span>
                        </span>
                        <span className="td-stat-gold">
                            <img
                                className="td-stat-icon td-stat-image"
                                src={coinsIcon}
                                alt=""
                                aria-hidden="true"
                            />
                            <span>Gold {state.gold}</span>
                        </span>
                        <span className="td-stat-hitpoints">
                            <img
                                className="td-stat-icon td-stat-image"
                                src={hitpointsIcon}
                                alt=""
                                aria-hidden="true"
                            />
                            <span>Hitpoints {state.lives}</span>
                        </span>
                    </div>
                    <div className="td-phase-strip content-text">
                        <span>{state.waveInProgress ? "Combat Phase" : "Build Phase"}</span>
                        <span>
                            {state.waveSpawned}/{state.waveSpawnCount} spawned
                        </span>
                    </div>
                    {devSettings.showProjectileStats && (
                        <>
                            <div className="td-phase-strip content-text">
                                <span>State proj {state.projectiles.length}</span>
                                <span>
                                    Scene {projectileRendererStats.tdProjectileAliveCount ?? 0}/
                                    {projectileRendererStats.tdProjectileRenderAttemptCount ?? 0}/
                                    {projectileRendererStats.tdProjectileRenderDrawCount ?? 0}
                                </span>
                            </div>
                            <div className="td-phase-strip content-text">
                                {projectileRendererStats.tdCombatDebug ? (
                                    <span>
                                        NPC dbg {projectileRendererStats.tdCombatDebug.name} seq{" "}
                                        {projectileRendererStats.tdCombatDebug.movementSeqId}/
                                        {projectileRendererStats.tdCombatDebug.attackSeqId}/
                                        {projectileRendererStats.tdCombatDebug.tdAttackSeqId} f
                                        {projectileRendererStats.tdCombatDebug.movementFrame}.
                                        {projectileRendererStats.tdCombatDebug.movementFrameTick}{" "}
                                        anim {projectileRendererStats.tdCombatDebug.selectedAnim}{" "}
                                        atk{" "}
                                        {projectileRendererStats.tdCombatDebug.hasAttackAnim
                                            ? "Y"
                                            : "N"}{" "}
                                        p {projectileRendererStats.tdCombatDebug.pathLength}/
                                        {projectileRendererStats.tdCombatDebug.serverPathLength} m{" "}
                                        {projectileRendererStats.tdCombatDebug.tdMoveClientTicks}
                                    </span>
                                ) : (
                                    <span>NPC dbg none</span>
                                )}
                            </div>
                        </>
                    )}
                    <button
                        className="td-start-button"
                        disabled={state.waveInProgress || state.gameOver}
                        onClick={startNextWave}
                    >
                        {state.wave === 0 ? "Start Wave" : "Next Wave"}
                    </button>
                    <div className="td-hud-actions">
                        <button className="td-button" onClick={onReset}>
                            Reset
                        </button>
                        <button
                            className={`td-button td-button-settings ${
                                settingsOpen ? "selected" : ""
                            }`}
                            onClick={() =>
                                setSettingsOpen((open) => {
                                    if (!open) {
                                        setPanelPositions((current) => ({
                                            ...current,
                                            settings: getSettingsPosition(),
                                        }));
                                    }
                                    return !open;
                                })
                            }
                        >
                            <span className="td-button-icon" aria-hidden="true">
                                <TdLootItemCanvas mapViewer={mapViewer} itemName="Cog" />
                            </span>
                            <span className="td-settings-button-copy">
                                <span>Dev Settings</span>
                                <span>{enabledToggleCount} on</span>
                            </span>
                        </button>
                    </div>
                    <div className="td-footer content-text">
                        <span>{state.gameOver ? "Lumbridge fell" : "Towers and route tools"}</span>
                        <span>
                            {routeDraft.length} route pts
                            {cameraMode === "line" ? " • line cam" : ""}
                            {routeEditorOpen ? " • editor" : ""}
                        </span>
                    </div>
                </div>

                {selectedTower && selectedTowerDef && selectedTowerStats && (
                    <div
                        className="td-tower-card rs-border rs-background"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="td-tower-card-header">
                            <div>
                                <div className="td-header">
                                    {getTowerName(selectedTower.kind, selectedTower.level)}
                                </div>
                                <div className="td-tower-card-subtitle content-text">
                                    {isBarricadeTowerKind(selectedTower.kind)
                                        ? "Route blocker"
                                        : `Level ${selectedTower.level} / ${TOWER_MAX_LEVEL}`}
                                </div>
                            </div>
                            <button className="td-close-button" onClick={onDeselectTower}>
                                ×
                            </button>
                        </div>
                        {!isBarricadeTowerKind(selectedTower.kind) && selectedTowerHasIcon && (
                            <div className="td-tower-card-visuals">
                                <div className="td-tower-card-visual">
                                    <TowerIconImage
                                        towerKind={selectedTower.kind}
                                        level={selectedTower.level}
                                        variant="card"
                                        className="td-tower-card-model-image"
                                    />
                                    <span className="content-text">Current</span>
                                </div>
                                {selectedTowerUpgradeCost !== undefined && (
                                    <>
                                        <div className="td-tower-card-upgrade-arrow">-&gt;</div>
                                        <div className="td-tower-card-visual">
                                            <TowerIconImage
                                                towerKind={selectedTower.kind}
                                                level={selectedTower.level + 1}
                                                variant="card"
                                                className="td-tower-card-model-image"
                                            />
                                            <span className="content-text">Upgrade</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        <div className="td-tower-stat-grid content-text">
                            {isBarricadeTowerKind(selectedTower.kind) ? (
                                <>
                                    <div className="td-tower-stat-row">
                                        <span>Integrity</span>
                                        <span>
                                            {Math.ceil(selectedTower.hp ?? 0)} /{" "}
                                            {Math.ceil(selectedTower.maxHp ?? 0)}
                                        </span>
                                    </div>
                                    <div className="td-tower-stat-row">
                                        <span>Effect</span>
                                        <span>Stops enemies until broken</span>
                                    </div>
                                    <div className="td-tower-stat-row">
                                        <span>Type</span>
                                        <span>Limited barricade pad</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="td-tower-stat-row">
                                        <span>Damage</span>
                                        <span>
                                            {selectedTowerStats.damage}
                                            {nextTowerStats && (
                                                <em> -&gt; {nextTowerStats.damage}</em>
                                            )}
                                        </span>
                                    </div>
                                    <div className="td-tower-stat-row">
                                        <span>Attack Speed</span>
                                        <span>
                                            {(1000 / selectedTowerStats.cooldownMs).toFixed(2)}/s
                                            {nextTowerStats && (
                                                <em>
                                                    {" "}
                                                    -&gt;{" "}
                                                    {(1000 / nextTowerStats.cooldownMs).toFixed(2)}
                                                    /s
                                                </em>
                                            )}
                                        </span>
                                    </div>
                                    <div className="td-tower-stat-row">
                                        <span>Range</span>
                                        <span>
                                            {(selectedTowerStats.range * 64).toFixed(1)} tiles
                                            {nextTowerStats && (
                                                <em>
                                                    {" "}
                                                    -&gt; {(nextTowerStats.range * 64).toFixed(1)}
                                                </em>
                                            )}
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="td-tower-stat-row">
                                <span>Pad</span>
                                <span>{selectedTower.padId.replace(/-/g, " ")}</span>
                            </div>
                        </div>
                        {!isBarricadeTowerKind(selectedTower.kind) && (
                            <button
                                className="td-upgrade-button"
                                disabled={
                                    selectedTowerUpgradeCost === undefined ||
                                    state.gold < selectedTowerUpgradeCost
                                }
                                onClick={onUpgradeSelectedTower}
                            >
                                {selectedTowerUpgradeCost === undefined
                                    ? "Max Level"
                                    : `Upgrade ${selectedTowerUpgradeCost}g`}
                            </button>
                        )}
                    </div>
                )}

                <div className="td-shop rs-border rs-background">
                    <div className="td-tabs content-text">
                        <button
                            className={shopTab === "towers" ? "active" : ""}
                            onClick={() => setShopTab("towers")}
                        >
                            Towers
                        </button>
                        <button
                            className={shopTab === "barricades" ? "active" : ""}
                            onClick={() => setShopTab("barricades")}
                        >
                            Barricades
                        </button>
                        <button
                            className={shopTab === "info" ? "active" : ""}
                            onClick={() => setShopTab("info")}
                        >
                            Info
                        </button>
                    </div>
                    <div className="td-shop-list">
                        {shopTab === "towers" &&
                            towerKinds.map((towerKind) => {
                                const def = TOWER_DEFS[towerKind];
                                const towerHasIcon = hasTowerIcon(towerKind);
                                return (
                                    <div key={towerKind} className="td-shop-row">
                                        <div
                                            className={`td-shop-icon ${towerKind}${
                                                towerHasIcon ? " has-preview" : ""
                                            }`}
                                        >
                                            <TowerIconImage
                                                towerKind={towerKind}
                                                variant="shop"
                                                className="td-shop-model-image"
                                            />
                                        </div>
                                        <div className="td-shop-copy content-text">
                                            <div className="td-shop-title">
                                                <span>{getTowerName(towerKind)}</span>
                                                <span>{def.cost}g</span>
                                            </div>
                                            <span>
                                                {towerKind === "bolt"
                                                    ? "Rapid-fire arrows"
                                                    : towerKind === "cannon"
                                                    ? "Rotating multicannon fire"
                                                    : "Magic attack"}
                                            </span>
                                            <span>
                                                {towerKind === "bolt"
                                                    ? "Effective vs. weak enemies"
                                                    : towerKind === "cannon"
                                                    ? "Tracks targets before firing"
                                                    : "Effective vs. armored enemies"}
                                            </span>
                                        </div>
                                        <button
                                            className="td-build-button"
                                            disabled={state.gold < def.cost}
                                            onClick={() => onStartBuild(towerKind)}
                                        >
                                            Build
                                        </button>
                                    </div>
                                );
                            })}
                        {shopTab === "barricades" && (
                            <div className={`td-shop-row ${canBuildBarricade ? "" : "disabled"}`}>
                                <div className="td-shop-icon barricade" />
                                <div className="td-shop-copy content-text">
                                    <div className="td-shop-title">
                                        <span>{TOWER_DEFS.barricade.name}</span>
                                        <span>{TOWER_DEFS.barricade.cost}g</span>
                                    </div>
                                    <span>Blocks enemies at fixed choke points</span>
                                    <span>
                                        {builtBarricadeCount}/{barricadePadCount} barricade pads
                                        used
                                    </span>
                                </div>
                                <button
                                    className="td-build-button"
                                    disabled={!canBuildBarricade}
                                    onClick={() => onStartBuild("barricade")}
                                >
                                    Build
                                </button>
                            </div>
                        )}
                        {shopTab === "info" && (
                            <div className="td-shop-row">
                                <div className="td-shop-copy content-text">
                                    <div className="td-shop-title">
                                        <span>Build Notes</span>
                                    </div>
                                    <span>Towers only go on tower pads.</span>
                                    <span>Barricades only go on barricade pads.</span>
                                    <span>
                                        Enemies stop and break barricades before pushing through.
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {settingsOpen && (
                <div className="td-settings-layer" onClick={() => setSettingsOpen(false)}>
                    <div
                        className="td-settings-panel td-draggable-panel rs-border rs-background"
                        style={getPanelStyle("settings", getSettingsPosition())}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div
                            className="td-settings-head td-drag-handle"
                            onMouseDown={(event) =>
                                onPanelDragStart("settings", event, getSettingsPosition())
                            }
                        >
                            <div>
                                <div className="td-header">Dev Settings</div>
                                <div className="td-route-subtitle content-text">
                                    Overlay, camera, and editor toggles
                                </div>
                            </div>
                            <div className="td-route-head-actions">
                                <span className="td-drag-grip" aria-hidden="true" />
                                <button
                                    className="td-close-button"
                                    onClick={() => setSettingsOpen(false)}
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                        <div className="td-settings-body">
                            <div className="td-settings-section">
                                <div className="td-settings-section-title content-text">
                                    Overlays
                                </div>
                                <div className="td-settings-grid">
                                    {TD_OVERLAY_TOGGLES.map((toggle) => (
                                        <button
                                            key={toggle.key}
                                            className={`td-settings-toggle ${
                                                devSettings[toggle.key] ? "selected" : ""
                                            }`}
                                            onClick={() =>
                                                updateDevSetting(
                                                    toggle.key,
                                                    !devSettings[toggle.key],
                                                )
                                            }
                                        >
                                            <span>{toggle.label}</span>
                                            <span>{devSettings[toggle.key] ? "On" : "Off"}</span>
                                            <small>{toggle.description}</small>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="td-settings-section">
                                <div className="td-settings-section-title content-text">Panels</div>
                                <div className="td-settings-grid">
                                    {TD_PANEL_TOGGLES.map((toggle) => (
                                        <button
                                            key={toggle.key}
                                            className={`td-settings-toggle ${
                                                devSettings[toggle.key] ? "selected" : ""
                                            }`}
                                            onClick={() =>
                                                updateDevSetting(
                                                    toggle.key,
                                                    !devSettings[toggle.key],
                                                )
                                            }
                                        >
                                            <span>{toggle.label}</span>
                                            <span>{devSettings[toggle.key] ? "On" : "Off"}</span>
                                            <small>{toggle.description}</small>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="td-settings-section">
                                <div className="td-settings-section-title content-text">Tools</div>
                                <div className="td-settings-grid">
                                    {TD_TOOL_TOGGLES.map((toggle) => (
                                        <button
                                            key={toggle.key}
                                            className={`td-settings-toggle ${
                                                devSettings[toggle.key] ? "selected" : ""
                                            }`}
                                            onClick={() => {
                                                const nextValue = !devSettings[toggle.key];
                                                if (toggle.key === "lineCameraEnabled") {
                                                    setCameraMode(nextValue ? "line" : "target");
                                                    return;
                                                }
                                                if (toggle.key === "levelEditorOpen") {
                                                    setRouteEditorOpen(nextValue);
                                                    return;
                                                }
                                                updateDevSetting(toggle.key, nextValue);
                                            }}
                                        >
                                            <span>{toggle.label}</span>
                                            <span>{devSettings[toggle.key] ? "On" : "Off"}</span>
                                            <small>{toggle.description}</small>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div
                className="td-playfield"
                onMouseDownCapture={() => focusRendererCanvas()}
                onContextMenuCapture={() => focusRendererCanvas()}
            >
                {(worldRoutePolygons.length > 0 || worldPadOverlays.length > 0) && (
                    <svg
                        className="td-world-route"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                    >
                        {(devSettings.showPathTiles || devSettings.showPathLine) && (
                            <>
                                {devSettings.showPathTiles &&
                                    worldRoutePolygons.map((polygon, index) => (
                                        <polygon
                                            key={`${polygon}-${index}`}
                                            className={`td-world-route-tile ${
                                                state.waveInProgress ? "active" : "idle"
                                            }`}
                                            points={polygon}
                                        />
                                    ))}
                                {devSettings.showPathLine && worldRouteLine && (
                                    <polyline
                                        className={`td-world-route-line ${
                                            state.waveInProgress ? "active" : "idle"
                                        }`}
                                        points={worldRouteLine}
                                    />
                                )}
                            </>
                        )}
                        {worldPadOverlays.map((pad) => (
                            <g
                                key={pad.id}
                                className={`td-world-pad ${pad.built ? "built" : "empty"} ${
                                    pad.padKind
                                } ${buildMode ? "build-active" : ""} ${
                                    hoveredPadId === pad.id ? "hovered" : ""
                                } ${pad.disabled ? "disabled" : ""} ${
                                    pad.towerId === state.selectedTowerId ? "selected" : ""
                                }`}
                            >
                                {pad.built &&
                                pad.markerCenter &&
                                pad.markerRadiusX &&
                                pad.markerRadiusY ? (
                                    <ellipse
                                        className="td-world-tower-hitbox"
                                        cx={pad.markerCenter.x}
                                        cy={pad.markerCenter.y}
                                        rx={pad.markerRadiusX * 1.24}
                                        ry={pad.markerRadiusY * 1.24}
                                        onMouseEnter={() => setHoveredPadId(pad.id)}
                                        onMouseLeave={() =>
                                            setHoveredPadId((current) =>
                                                current === pad.id ? undefined : current,
                                            )
                                        }
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            closeTowerMenu();
                                            if (pad.towerId) {
                                                onSelectPlacedTower(pad.towerId);
                                            }
                                        }}
                                        onContextMenu={(event) => openTowerMenu(event, pad.id)}
                                    />
                                ) : null}
                                {pad.built &&
                                pad.markerCenter &&
                                pad.markerRadiusX &&
                                pad.markerRadiusY ? (
                                    <ellipse
                                        className="td-world-pad-halo td-world-tower-hit"
                                        cx={pad.markerCenter.x}
                                        cy={pad.markerCenter.y}
                                        rx={pad.markerRadiusX}
                                        ry={pad.markerRadiusY}
                                        style={{ stroke: pad.color }}
                                    />
                                ) : !pad.built &&
                                  pad.markerCenter &&
                                  pad.markerRadiusX &&
                                  pad.markerRadiusY ? (
                                    <ellipse
                                        className="td-world-pad-halo"
                                        cx={pad.markerCenter.x}
                                        cy={pad.markerCenter.y}
                                        rx={pad.markerRadiusX}
                                        ry={pad.markerRadiusY}
                                        style={{ stroke: pad.color }}
                                    />
                                ) : null}
                                {devSettings.showTowerRanges && pad.rangePolygon && (
                                    <polygon
                                        className="td-world-pad-range"
                                        points={pad.rangePolygon}
                                        style={{ stroke: pad.color }}
                                    />
                                )}
                                {pad.built &&
                                pad.markerCenter &&
                                pad.markerRadiusX &&
                                pad.markerRadiusY ? (
                                    <ellipse
                                        className="td-world-pad-tile td-world-tower-hit"
                                        cx={pad.markerCenter.x}
                                        cy={pad.markerCenter.y}
                                        rx={pad.markerRadiusX * 0.96}
                                        ry={pad.markerRadiusY * 0.96}
                                        style={{ fill: pad.color, stroke: pad.color }}
                                    />
                                ) : !pad.built &&
                                  pad.markerCenter &&
                                  pad.markerRadiusX &&
                                  pad.markerRadiusY ? (
                                    <ellipse
                                        className="td-world-pad-tile"
                                        cx={pad.markerCenter.x}
                                        cy={pad.markerCenter.y}
                                        rx={pad.markerRadiusX}
                                        ry={pad.markerRadiusY}
                                        style={{ fill: pad.color, stroke: pad.color }}
                                        onMouseEnter={() => setHoveredPadId(pad.id)}
                                        onMouseLeave={() =>
                                            setHoveredPadId((current) =>
                                                current === pad.id ? undefined : current,
                                            )
                                        }
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            closeTowerMenu();
                                            onPlaceTower(pad.id);
                                        }}
                                        onContextMenu={(event) => {
                                            if (buildMode) {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                closeTowerMenu();
                                                setBuildMode(undefined);
                                                setHoveredPadId(undefined);
                                                return;
                                            }
                                            openPadBuildMenu(event, pad);
                                        }}
                                    />
                                ) : null}
                                {!pad.built &&
                                pad.markerCenter &&
                                pad.markerRadiusX &&
                                pad.markerRadiusY ? (
                                    <ellipse
                                        className="td-world-pad-core"
                                        cx={pad.markerCenter.x}
                                        cy={pad.markerCenter.y}
                                        rx={pad.markerRadiusX * 0.22}
                                        ry={pad.markerRadiusY * 0.22}
                                        style={{ fill: pad.color, stroke: pad.color }}
                                    />
                                ) : null}
                                {devSettings.showPadLabels &&
                                    pad.labelText &&
                                    (!pad.built ||
                                        pad.towerId === state.selectedTowerId ||
                                        hoveredPadId === pad.id) && (
                                        <>
                                            <circle
                                                className="td-world-pad-badge"
                                                cx={pad.label.x}
                                                cy={pad.label.y}
                                                r={pad.built ? 1.12 : 1.02}
                                            />
                                            <text
                                                className={`td-world-pad-label ${
                                                    pad.built ? "built" : "empty"
                                                }`}
                                                x={pad.label.x}
                                                y={pad.label.y}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                            >
                                                {pad.labelText}
                                            </text>
                                        </>
                                    )}
                            </g>
                        ))}
                    </svg>
                )}

                <canvas ref={overheadCanvasRef} className="td-overhead-canvas" aria-hidden="true" />
            </div>

            {buildMode && buildPreview && (
                <div
                    className={`td-build-ghost ${buildMode} ${
                        buildTargetValid ? "valid" : "invalid"
                    }`}
                    style={{
                        left: `${buildPreview.x}px`,
                        top: `${buildPreview.y}px`,
                        transform: `translate(-50%, -78%) rotate(${buildRotation * 90}deg)`,
                    }}
                >
                    <div
                        className={`td-build-ghost-model ${buildModeHasIcon ? "with-preview" : ""}`}
                    >
                        {buildModeHasIcon && (
                            <TowerIconImage
                                towerKind={buildMode}
                                variant="ghost"
                                className="td-build-ghost-image"
                            />
                        )}
                    </div>
                    <div className="td-build-ghost-label content-text">
                        {buildTargetValid ? "Place" : "Choose a pad"}
                    </div>
                </div>
            )}

            {devSettings.showBottomHint && (
                <div className="td-bottom-hint rs-border rs-background content-text">
                    {buildMode
                        ? buildMode === "barricade"
                            ? `Placing ${getTowerName(
                                  buildMode,
                              )}. Left-click a barricade pad, right-click cancels.`
                            : `Placing ${getTowerName(
                                  buildMode,
                              )}. R or wheel rotates, left-click a pad, right-click cancels.`
                        : "Select a tower or barricade to build."}
                </div>
            )}

            {state.showWaveSummary && state.waveSummary && (
                <div className="td-wave-summary-overlay">
                    <div className="td-wave-summary rs-border rs-background">
                        <div className="td-wave-summary-header">
                            <div className="td-header">Wave {state.waveSummary.wave} Complete!</div>
                            <div className="td-wave-summary-subtitle content-text">
                                Lumbridge stands strong
                            </div>
                        </div>

                        <div className="td-wave-summary-stats">
                            <div className="td-summary-stat">
                                <span className="td-stat-label">Enemies Defeated</span>
                                <span className="td-stat-value">
                                    {state.waveSummary.enemiesKilled}
                                </span>
                            </div>
                            <div className="td-summary-stat">
                                <span className="td-stat-label">Gold Earned</span>
                                <span className="td-stat-value">
                                    {state.waveSummary.goldEarned}g
                                </span>
                            </div>
                            <div className="td-summary-stat">
                                <span className="td-stat-label">Completion Bonus</span>
                                <span className="td-stat-value bonus">
                                    {state.waveSummary.completionBonus}g
                                </span>
                            </div>
                        </div>

                        {state.waveSummary.lootCollected.length > 0 && (
                            <div className="td-wave-loot">
                                <div className="td-loot-header">Loot Collected</div>
                                <div className="td-loot-grid">
                                    {state.waveSummary.lootCollected.map((loot, index) => (
                                        <div key={index} className={`td-loot-item ${loot.type}`}>
                                            <TdLootItemCanvas
                                                mapViewer={mapViewer}
                                                itemName={loot.name}
                                            />
                                            <div className="td-loot-info">
                                                <div className="td-loot-name">{loot.name}</div>
                                                <div className="td-loot-quantity">
                                                    {loot.quantity > 1 ? `${loot.quantity}x` : ""}
                                                    <span className="td-loot-value">
                                                        ({loot.value}g)
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="td-loot-total">
                                    <span>
                                        Loot Value:{" "}
                                        {state.waveSummary.lootCollected.reduce(
                                            (sum, loot) => sum + loot.value,
                                            0,
                                        )}
                                        g
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="td-wave-summary-total">
                            <span>Total Reward: {state.waveSummary.totalValue}g</span>
                        </div>

                        <div className="td-wave-summary-actions">
                            <button className="td-button secondary" onClick={onDismissWaveSummary}>
                                Continue Building
                            </button>
                            <button
                                className="td-button primary"
                                onClick={onStartNextWaveFromSummary}
                            >
                                Next Wave
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {routeEditorOpen && (
                <div
                    className="td-route-editor td-route-popout td-draggable-panel rs-border rs-background"
                    style={getPanelStyle("levelEditor", { x: 140, y: 92 })}
                >
                    <div
                        className="td-route-head td-drag-handle"
                        onMouseDown={(event) =>
                            onPanelDragStart("levelEditor", event, { x: 140, y: 92 })
                        }
                    >
                        <div>
                            <div className="td-header">Level Editor</div>
                            <div className="td-route-subtitle content-text">
                                Route and wave setup
                            </div>
                        </div>
                        <div className="td-route-head-actions">
                            <span className="td-drag-grip" aria-hidden="true" />
                            <button
                                className="td-close-button"
                                onClick={() => setRouteEditorOpen(false)}
                            >
                                ×
                            </button>
                        </div>
                    </div>
                    <div className="td-route-editor-body">
                        <div className="td-level-presets">
                            <div className="td-level-presets-head">
                                <div>
                                    <div className="td-header">Saved Levels</div>
                                    <div className="td-route-subtitle content-text">
                                        {savedLevels.length} local presets
                                    </div>
                                </div>
                                {selectedSavedLevel && (
                                    <div className="td-level-presets-meta content-text">
                                        Updated{" "}
                                        {formatSavedLevelTimestamp(selectedSavedLevel.updatedAt)}
                                    </div>
                                )}
                            </div>
                            <div className="td-level-presets-fields">
                                <label className="td-level-presets-field content-text">
                                    <span>Preset</span>
                                    <select
                                        value={selectedSavedLevelId ?? ""}
                                        onChange={(event) => {
                                            const nextId = event.target.value || undefined;
                                            setSelectedSavedLevelId(nextId);
                                            const nextLevel = nextId
                                                ? savedLevels.find((level) => level.id === nextId)
                                                : undefined;
                                            setSavedLevelName(
                                                nextLevel?.name ?? "Lumbridge Variant",
                                            );
                                        }}
                                    >
                                        <option value="">Unsaved current setup</option>
                                        {savedLevels.map((level) => (
                                            <option key={level.id} value={level.id}>
                                                {level.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="td-level-presets-field content-text">
                                    <span>Name</span>
                                    <input
                                        type="text"
                                        value={savedLevelName}
                                        onChange={(event) => setSavedLevelName(event.target.value)}
                                        placeholder="Level name"
                                    />
                                </label>
                            </div>
                            <div className="td-level-presets-actions">
                                <button className="td-button" onClick={() => saveCurrentLevel()}>
                                    <span>Save New</span>
                                </button>
                                <button
                                    className="td-button"
                                    onClick={() => saveCurrentLevel(selectedSavedLevelId)}
                                    disabled={!selectedSavedLevelId}
                                >
                                    <span>Save Over</span>
                                </button>
                                <button
                                    className="td-button"
                                    onClick={loadSelectedSavedLevel}
                                    disabled={!selectedSavedLevelId}
                                >
                                    <span>Load</span>
                                </button>
                                <button
                                    className="td-button"
                                    onClick={deleteSelectedSavedLevel}
                                    disabled={!selectedSavedLevelId}
                                >
                                    <span>Delete</span>
                                </button>
                            </div>
                        </div>
                        <div className="td-route-actions">
                            <button
                                className="td-button"
                                onClick={undoRoutePoint}
                                disabled={routeDraft.length === 0}
                            >
                                <span>Undo</span>
                            </button>
                            <button
                                className="td-button"
                                onClick={removeSelectedRoutePoint}
                                disabled={selectedRoutePointIndex === undefined}
                            >
                                <span>Delete</span>
                            </button>
                            <button
                                className="td-button"
                                onClick={clearRoute}
                                disabled={routeDraft.length === 0}
                            >
                                <span>Clear</span>
                            </button>
                            <button className="td-button" onClick={resetRoute}>
                                <span>Default</span>
                            </button>
                            <button className="td-button" onClick={reverseRoute}>
                                <span>Reverse</span>
                            </button>
                            <button className="td-button" onClick={copyRouteToClipboard}>
                                <span>Copy JSON</span>
                            </button>
                        </div>
                        <div className="td-route-help content-text">
                            Changes save automatically. Click map to insert after the selected node,
                            or drag and nudge nodes to fix pathing.
                        </div>
                        <div className="td-route-actions">
                            <button
                                className="td-button"
                                onClick={() => setPadPlacementArmed((current) => !current)}
                            >
                                <span>{padPlacementArmed ? "Cancel Add Pad" : "Add Pad"}</span>
                            </button>
                            <button
                                className="td-button"
                                onClick={removeSelectedPad}
                                disabled={selectedPadIndex === undefined}
                            >
                                <span>Delete Pad</span>
                            </button>
                            <button
                                className="td-button"
                                onClick={clearPads}
                                disabled={padDraft.length === 0}
                            >
                                <span>Clear Pads</span>
                            </button>
                            <button className="td-button" onClick={resetPads}>
                                <span>Default Pads</span>
                            </button>
                            <button className="td-button" onClick={copyPadsToClipboard}>
                                <span>Copy Pad JSON</span>
                            </button>
                        </div>
                        <div className="td-route-help content-text">
                            Drag pad markers to move them. Use Add Pad, then click the map to place
                            a new build spot.
                        </div>
                        <div className="td-editor-workspace">
                            <div className="td-editor-map-column">
                                <div
                                    className="td-route-map"
                                    onClick={onRouteEditorClick}
                                    ref={routeEditorRef}
                                >
                                    {routeImageUrl ? (
                                        <img
                                            alt="Lumbridge route editor"
                                            className="td-route-map-image"
                                            src={routeImageUrl}
                                        />
                                    ) : (
                                        <div className="td-route-map-loading content-text">
                                            Loading map...
                                        </div>
                                    )}
                                    <div className="td-route-map-overlay">
                                        {routeDraftPoints.length >= 2 && (
                                            <svg
                                                className="td-route-map-line"
                                                viewBox="0 0 100 100"
                                                preserveAspectRatio="none"
                                            >
                                                <polyline
                                                    className={`td-route-polyline ${
                                                        state.waveInProgress ? "active" : "idle"
                                                    }`}
                                                    points={routeDraftPoints
                                                        .map(
                                                            (point) =>
                                                                `${point.x * 100},${point.y * 100}`,
                                                        )
                                                        .join(" ")}
                                                />
                                            </svg>
                                        )}
                                        {routeDraft.map((point, index) => {
                                            const marker = routeDraftPoints[index];
                                            const tileSize = 100 / 64;
                                            return (
                                                <div
                                                    key={`${point.x}-${point.y}-${index}`}
                                                    style={{ display: "contents" }}
                                                >
                                                    <div
                                                        className={`td-route-tile ${
                                                            state.waveInProgress ? "active" : "idle"
                                                        }`}
                                                        style={{
                                                            left: `${point.x * tileSize}%`,
                                                            top: `${point.y * tileSize}%`,
                                                            width: `${tileSize}%`,
                                                            height: `${tileSize}%`,
                                                        }}
                                                    />
                                                    <div
                                                        className={`td-route-point ${
                                                            selectedRoutePointIndex === index
                                                                ? "selected"
                                                                : ""
                                                        }`}
                                                        style={{
                                                            left: `${marker.x * 100}%`,
                                                            top: `${marker.y * 100}%`,
                                                        }}
                                                        onMouseDown={(event) =>
                                                            onRoutePointMouseDown(event, index)
                                                        }
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setSelectedRoutePointIndex(index);
                                                            setSelectedPadIndex(undefined);
                                                            setPadPlacementArmed(false);
                                                        }}
                                                    >
                                                        <span>{index + 1}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {padDraft.map((pad, index) => {
                                            const marker = padDraftPoints[index];
                                            return (
                                                <div
                                                    key={pad.id}
                                                    className={`td-route-pad ${
                                                        selectedPadIndex === index ? "selected" : ""
                                                    }`}
                                                    style={{
                                                        left: `${marker.x * 100}%`,
                                                        top: `${marker.y * 100}%`,
                                                    }}
                                                    onMouseDown={(event) =>
                                                        onPadPointMouseDown(event, index)
                                                    }
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedPadIndex(index);
                                                        setSelectedRoutePointIndex(undefined);
                                                        setPadPlacementArmed(false);
                                                    }}
                                                    title={pad.id}
                                                >
                                                    <span>P</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="td-route-selected content-text">
                                    {selectedRoutePointIndex === undefined
                                        ? `${routeDraft.length} nodes. Select a node to insert or delete around it.`
                                        : `Node ${selectedRoutePointIndex + 1}: x ${routeDraft[
                                              selectedRoutePointIndex
                                          ]?.x}, y ${routeDraft[selectedRoutePointIndex]?.y}`}
                                </div>
                                {selectedRoutePoint && (
                                    <div className="td-route-node-editor">
                                        <div className="td-route-node-fields">
                                            <label className="td-route-node-field content-text">
                                                <span>Tile X</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={63}
                                                    value={selectedRoutePoint.x}
                                                    onChange={(event) =>
                                                        updateSelectedRoutePoint({
                                                            x: Number(event.target.value),
                                                        })
                                                    }
                                                />
                                            </label>
                                            <label className="td-route-node-field content-text">
                                                <span>Tile Y</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={63}
                                                    value={selectedRoutePoint.y}
                                                    onChange={(event) =>
                                                        updateSelectedRoutePoint({
                                                            y: Number(event.target.value),
                                                        })
                                                    }
                                                />
                                            </label>
                                        </div>
                                        <div className="td-route-node-nudge">
                                            <button
                                                className="td-mini-button"
                                                onClick={() => nudgeSelectedRoutePoint(0, -1)}
                                            >
                                                Up
                                            </button>
                                            <button
                                                className="td-mini-button"
                                                onClick={() => nudgeSelectedRoutePoint(-1, 0)}
                                            >
                                                Left
                                            </button>
                                            <button
                                                className="td-mini-button"
                                                onClick={() => nudgeSelectedRoutePoint(1, 0)}
                                            >
                                                Right
                                            </button>
                                            <button
                                                className="td-mini-button"
                                                onClick={() => nudgeSelectedRoutePoint(0, 1)}
                                            >
                                                Down
                                            </button>
                                        </div>
                                        <div className="td-route-node-help content-text">
                                            Arrow keys nudge 1 tile. Hold Shift to move 5.
                                        </div>
                                    </div>
                                )}
                                <div className="td-route-selected content-text">
                                    {padPlacementArmed
                                        ? "Click the map to place a new pad."
                                        : selectedPadIndex === undefined
                                        ? `${padDraft.length} pads (${barricadePadCount} barricade). Select or drag a pad to edit it.`
                                        : `Pad ${
                                              selectedPadIndex + 1
                                          }: ${selectedPad?.id} (${selectedPad?.kind}) at x ${selectedPad?.tileX}, y ${selectedPad?.tileY}`}
                                </div>
                                {selectedPad && (
                                    <div className="td-route-node-editor">
                                        <div className="td-route-node-fields td-route-pad-fields">
                                            <label className="td-route-node-field content-text">
                                                <span>Pad ID</span>
                                                <input
                                                    type="text"
                                                    value={selectedPad.id}
                                                    readOnly
                                                />
                                            </label>
                                            <label className="td-route-node-field content-text">
                                                <span>Tile X</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={63}
                                                    value={selectedPad.tileX}
                                                    onChange={(event) =>
                                                        updateSelectedPad({
                                                            tileX: Number(event.target.value),
                                                        })
                                                    }
                                                />
                                            </label>
                                            <label className="td-route-node-field content-text">
                                                <span>Tile Y</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={63}
                                                    value={selectedPad.tileY}
                                                    onChange={(event) =>
                                                        updateSelectedPad({
                                                            tileY: Number(event.target.value),
                                                        })
                                                    }
                                                />
                                            </label>
                                            <label className="td-route-node-field content-text">
                                                <span>Pad Type</span>
                                                <select
                                                    value={selectedPad.kind}
                                                    onChange={(event) =>
                                                        updateSelectedPad({
                                                            kind:
                                                                event.target.value === "barricade"
                                                                    ? "barricade"
                                                                    : "tower",
                                                        })
                                                    }
                                                >
                                                    <option value="tower">Tower</option>
                                                    <option value="barricade">Barricade</option>
                                                </select>
                                            </label>
                                        </div>
                                        <div className="td-route-node-nudge">
                                            <button
                                                className="td-mini-button"
                                                onClick={() => nudgeSelectedPad(0, -1)}
                                            >
                                                Up
                                            </button>
                                            <button
                                                className="td-mini-button"
                                                onClick={() => nudgeSelectedPad(-1, 0)}
                                            >
                                                Left
                                            </button>
                                            <button
                                                className="td-mini-button"
                                                onClick={() => nudgeSelectedPad(1, 0)}
                                            >
                                                Right
                                            </button>
                                            <button
                                                className="td-mini-button"
                                                onClick={() => nudgeSelectedPad(0, 1)}
                                            >
                                                Down
                                            </button>
                                        </div>
                                        <div className="td-route-node-help content-text">
                                            Tower pads accept combat towers. Barricade pads accept
                                            blockers only. Pad edits update anchors immediately and
                                            save with the level.
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="td-editor-wave-column">
                                <div className="td-wave-editor">
                                    <div className="td-wave-editor-head">
                                        <div>
                                            <div className="td-header">Wave Composer</div>
                                            <div className="td-route-subtitle content-text">
                                                {getWaveEnemyCount(activeWaveConfig)} enemies,{" "}
                                                {activeWaveConfig.spawnIntervalMs}ms spacing
                                            </div>
                                        </div>
                                        <div className="td-wave-stepper">
                                            <button
                                                className="td-mini-button"
                                                onClick={() =>
                                                    setSelectedWaveNumber((waveNumber) =>
                                                        Math.max(1, waveNumber - 1),
                                                    )
                                                }
                                            >
                                                -
                                            </button>
                                            <span>Wave {selectedWaveNumber}</span>
                                            <button
                                                className="td-mini-button"
                                                onClick={() =>
                                                    setSelectedWaveNumber(
                                                        (waveNumber) => waveNumber + 1,
                                                    )
                                                }
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <div className="td-wave-toolbar">
                                        <label className="td-wave-field content-text">
                                            <span>Spawn spacing</span>
                                            <input
                                                type="number"
                                                min={120}
                                                max={3000}
                                                step={20}
                                                value={activeWaveConfig.spawnIntervalMs}
                                                onChange={(event) =>
                                                    setSelectedWaveConfig({
                                                        ...activeWaveConfig,
                                                        spawnIntervalMs: Number(event.target.value),
                                                    })
                                                }
                                            />
                                        </label>
                                        <div className="td-wave-search">
                                            <input
                                                type="search"
                                                placeholder="Search NPCs or presets"
                                                value={waveEnemySearch}
                                                onChange={(event) =>
                                                    setWaveEnemySearch(event.target.value)
                                                }
                                            />
                                            {filteredEnemyCatalog.length > 0 && (
                                                <div className="td-wave-search-results">
                                                    {filteredEnemyCatalog.map((entry) => {
                                                        const archetype = getWaveEnemyArchetype(
                                                            entry.config,
                                                        );
                                                        return (
                                                            <button
                                                                key={entry.key}
                                                                className="td-wave-search-result"
                                                                onClick={() =>
                                                                    addWaveEnemy(entry.config)
                                                                }
                                                            >
                                                                <span
                                                                    className="td-wave-search-swatch"
                                                                    style={{
                                                                        backgroundColor:
                                                                            archetype.color,
                                                                        borderColor:
                                                                            archetype.outline,
                                                                    }}
                                                                />
                                                                <span className="td-wave-search-name">
                                                                    {entry.config.archetypeName}
                                                                </span>
                                                                <span className="td-wave-search-meta">
                                                                    {entry.config.npcId}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="td-wave-enemy-list">
                                        {activeWaveConfig.enemies.map((enemyConfig) => {
                                            const archetype = getWaveEnemyArchetype(enemyConfig);
                                            return (
                                                <div
                                                    key={getWaveEnemyConfigKey(enemyConfig)}
                                                    className="td-wave-enemy-row"
                                                >
                                                    <div
                                                        className="td-wave-enemy-swatch"
                                                        style={{
                                                            backgroundColor: archetype.color,
                                                            borderColor: archetype.outline,
                                                        }}
                                                    />
                                                    <div className="td-wave-enemy-main content-text">
                                                        <div className="td-wave-enemy-title">
                                                            <div className="td-wave-enemy-heading">
                                                                <span>
                                                                    {enemyConfig.archetypeName}
                                                                </span>
                                                                <span className="td-wave-enemy-id">
                                                                    NPC {enemyConfig.npcId}
                                                                </span>
                                                            </div>
                                                            <div className="td-wave-enemy-title-actions">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={99}
                                                                    value={enemyConfig.count}
                                                                    onChange={(event) =>
                                                                        updateWaveEnemyCount(
                                                                            enemyConfig,
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                        )
                                                                    }
                                                                />
                                                                <button
                                                                    className="td-mini-button"
                                                                    onClick={() =>
                                                                        removeWaveEnemy(enemyConfig)
                                                                    }
                                                                    title="Remove NPC from wave"
                                                                >
                                                                    x
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="td-wave-bases">
                                                            <label>
                                                                Base HP
                                                                <input
                                                                    type="number"
                                                                    min={1}
                                                                    max={5000}
                                                                    value={
                                                                        enemyConfig.baseHp ??
                                                                        archetype.hp
                                                                    }
                                                                    onChange={(event) =>
                                                                        updateWaveEnemyBaseStat(
                                                                            enemyConfig,
                                                                            "baseHp",
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                        )
                                                                    }
                                                                />
                                                            </label>
                                                            <label>
                                                                Base SPD
                                                                <input
                                                                    type="number"
                                                                    min={0.01}
                                                                    max={0.25}
                                                                    step={0.001}
                                                                    value={
                                                                        enemyConfig.baseSpeed ??
                                                                        archetype.speed
                                                                    }
                                                                    onChange={(event) =>
                                                                        updateWaveEnemyBaseStat(
                                                                            enemyConfig,
                                                                            "baseSpeed",
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                        )
                                                                    }
                                                                />
                                                            </label>
                                                            <label>
                                                                Base GP
                                                                <input
                                                                    type="number"
                                                                    min={1}
                                                                    max={5000}
                                                                    value={
                                                                        enemyConfig.baseReward ??
                                                                        archetype.reward
                                                                    }
                                                                    onChange={(event) =>
                                                                        updateWaveEnemyBaseStat(
                                                                            enemyConfig,
                                                                            "baseReward",
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                        )
                                                                    }
                                                                />
                                                            </label>
                                                        </div>
                                                        <div className="td-wave-multis">
                                                            <label>
                                                                HP x
                                                                <input
                                                                    type="number"
                                                                    min={0.1}
                                                                    max={10}
                                                                    step={0.1}
                                                                    value={enemyConfig.hpMultiplier}
                                                                    onChange={(event) =>
                                                                        updateWaveEnemyMultiplier(
                                                                            enemyConfig,
                                                                            "hpMultiplier",
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                        )
                                                                    }
                                                                />
                                                            </label>
                                                            <label>
                                                                SPD x
                                                                <input
                                                                    type="number"
                                                                    min={0.1}
                                                                    max={10}
                                                                    step={0.1}
                                                                    value={
                                                                        enemyConfig.speedMultiplier
                                                                    }
                                                                    onChange={(event) =>
                                                                        updateWaveEnemyMultiplier(
                                                                            enemyConfig,
                                                                            "speedMultiplier",
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                        )
                                                                    }
                                                                />
                                                            </label>
                                                            <label>
                                                                GP x
                                                                <input
                                                                    type="number"
                                                                    min={0.1}
                                                                    max={10}
                                                                    step={0.1}
                                                                    value={
                                                                        enemyConfig.rewardMultiplier
                                                                    }
                                                                    onChange={(event) =>
                                                                        updateWaveEnemyMultiplier(
                                                                            enemyConfig,
                                                                            "rewardMultiplier",
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                        )
                                                                    }
                                                                />
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="td-route-actions">
                                        <button
                                            className="td-button"
                                            onClick={resetSelectedWaveConfig}
                                        >
                                            <span>Default Wave</span>
                                        </button>
                                        <button
                                            className="td-button"
                                            onClick={() =>
                                                setSelectedWaveConfig(
                                                    createDefaultWaveConfig(selectedWaveNumber),
                                                )
                                            }
                                        >
                                            <span>Rebuild Defaults</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {devSettings.showEnemyInfoPanel && state.showEnemyInfo && state.selectedEnemy && (
                <div
                    className="td-enemy-info-overlay td-draggable-panel"
                    style={getPanelStyle("enemyInfo", { x: 14, y: 14 })}
                >
                    <div className="td-enemy-info rs-border rs-background">
                        <div
                            className="td-enemy-info-header td-drag-handle"
                            onMouseDown={(event) =>
                                onPanelDragStart("enemyInfo", event, { x: 14, y: 14 })
                            }
                        >
                            <div className="td-header">{state.selectedEnemy.archetype.name}</div>
                            <span className="td-drag-grip" aria-hidden="true" />
                            <button className="td-close-button" onClick={onDeselectEnemy}>
                                ×
                            </button>
                        </div>

                        <div className="td-enemy-stats">
                            <div className="td-enemy-health">
                                <div className="td-stat-row">
                                    <span>Health</span>
                                    <span>
                                        {state.selectedEnemy.hp} / {state.selectedEnemy.maxHp}
                                    </span>
                                </div>
                                <div className="td-enemy-health-bar">
                                    <div
                                        className="td-enemy-health-fill"
                                        style={{
                                            width: `${
                                                (state.selectedEnemy.hp /
                                                    state.selectedEnemy.maxHp) *
                                                100
                                            }%`,
                                            backgroundColor:
                                                state.selectedEnemy.hp >
                                                state.selectedEnemy.maxHp * 0.6
                                                    ? "#72ff6c"
                                                    : state.selectedEnemy.hp >
                                                      state.selectedEnemy.maxHp * 0.3
                                                    ? "#ffcc00"
                                                    : "#ff4444",
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="td-stat-grid">
                                <div className="td-stat-row">
                                    <span>Movement Speed</span>
                                    <span>{(state.selectedEnemy.speed * 100).toFixed(1)}%</span>
                                </div>
                                <div className="td-stat-row">
                                    <span>Progress</span>
                                    <span>{(state.selectedEnemy.progress * 100).toFixed(1)}%</span>
                                </div>
                                <div className="td-stat-row">
                                    <span>Gold Reward</span>
                                    <span>{state.selectedEnemy.reward}g</span>
                                </div>
                                <div className="td-stat-row">
                                    <span>Damage if Leaked</span>
                                    <span>{state.selectedEnemy.damage}</span>
                                </div>
                            </div>

                            <div className="td-enemy-archetype-info">
                                <div className="td-archetype-header">Base Stats</div>
                                <div className="td-stat-grid">
                                    <div className="td-stat-row">
                                        <span>Base Health</span>
                                        <span>{state.selectedEnemy.archetype.hp}</span>
                                    </div>
                                    <div className="td-stat-row">
                                        <span>Base Speed</span>
                                        <span>
                                            {(state.selectedEnemy.archetype.speed * 100).toFixed(1)}
                                            %
                                        </span>
                                    </div>
                                    <div className="td-stat-row">
                                        <span>Base Reward</span>
                                        <span>{state.selectedEnemy.archetype.reward}g</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function getWorldTileHeight(map: WebGLMapSquare, tileX: number, tileY: number): number {
    return -map.getTileHeight(0, tileX, tileY) / 16 + 0.02;
}

function getLocalWorldHeight(
    map: WebGLMapSquare,
    localX: number,
    localY: number,
    level: number = 0,
): number {
    const x = Math.max(0, Math.min(63.99, localX));
    const y = Math.max(0, Math.min(63.99, localY));
    const tileX = Math.floor(x);
    const tileY = Math.floor(y);
    const fracX = x - tileX;
    const fracY = y - tileY;

    const plane = Math.max(0, Math.min(3, level | 0));
    const h00 = map.getTileHeight(plane, tileX, tileY);
    const h10 = map.getTileHeight(plane, tileX + 1, tileY);
    const h01 = map.getTileHeight(plane, tileX, tileY + 1);
    const h11 = map.getTileHeight(plane, tileX + 1, tileY + 1);
    const h0 = h00 + (h10 - h00) * fracX;
    const h1 = h01 + (h11 - h01) * fracX;
    return -(h0 + (h1 - h0) * fracY) / 16 + 0.04;
}

function getProjectedPadCorners(
    mapViewer: MapViewer,
    map: WebGLMapSquare,
    tileX: number,
    tileY: number,
): Array<{ x: number; y: number }> {
    const centerX = tileX + 0.5;
    const centerY = tileY + 0.5;
    const halfSize = 0.9;
    const planeY = getLocalWorldHeight(map, centerX, centerY) + 0.06;
    const corners = [
        projectLocalFlatPoint(mapViewer, centerX - halfSize, centerY - halfSize, planeY),
        projectLocalFlatPoint(mapViewer, centerX + halfSize, centerY - halfSize, planeY),
        projectLocalFlatPoint(mapViewer, centerX + halfSize, centerY + halfSize, planeY),
        projectLocalFlatPoint(mapViewer, centerX - halfSize, centerY + halfSize, planeY),
    ];

    return corners.filter((corner): corner is { x: number; y: number } => corner !== undefined);
}

function getProjectedPadMarker(
    mapViewer: MapViewer,
    map: WebGLMapSquare,
    localX: number,
    localY: number,
    radius: number,
    viewportAspect: number,
): { center: { x: number; y: number }; radiusX: number; radiusY: number } | undefined {
    const planeY = getLocalWorldHeight(map, localX, localY) + 0.06;
    const center = projectLocalFlatPoint(mapViewer, localX, localY, planeY);
    const edgeX = projectLocalFlatPoint(mapViewer, localX + radius, localY, planeY);
    const edgeY = projectLocalFlatPoint(mapViewer, localX, localY + radius, planeY);
    if (!center || !edgeX || !edgeY) {
        return undefined;
    }

    const radiusX = Math.hypot(edgeX.x - center.x, edgeX.y - center.y);
    const radiusY = Math.hypot(edgeY.x - center.x, edgeY.y - center.y);
    const markerRadius = Math.max(0.6, (radiusX + radiusY) * 0.5);
    const aspectScale = Math.sqrt(Math.max(0.1, viewportAspect));
    return {
        center,
        radiusX: markerRadius / aspectScale,
        radiusY: markerRadius * aspectScale,
    };
}

function getProjectedGroundCircle(
    mapViewer: MapViewer,
    map: WebGLMapSquare,
    localX: number,
    localY: number,
    radius: number,
): string | undefined {
    const planeY = getLocalWorldHeight(map, localX, localY) + 0.04;
    const points: string[] = [];
    for (let i = 0; i < 64; i++) {
        const angle = (Math.PI * 2 * i) / 64;
        const projected = projectLocalFlatPoint(
            mapViewer,
            localX + Math.cos(angle) * radius,
            localY + Math.sin(angle) * radius,
            planeY,
        );
        if (!projected) {
            return undefined;
        }
        points.push(`${projected.x},${projected.y}`);
    }
    return points.join(" ");
}

function projectLocalGroundPoint(
    mapViewer: MapViewer,
    map: WebGLMapSquare,
    localX: number,
    localY: number,
): { x: number; y: number } | undefined {
    return projectWorldPoint(
        mapViewer,
        LUMBRIDGE_TD_MAP_X * 64 + localX,
        getLocalWorldHeight(map, localX, localY),
        LUMBRIDGE_TD_MAP_Y * 64 + localY,
    );
}

function projectLocalFlatPoint(
    mapViewer: MapViewer,
    localX: number,
    localY: number,
    planeY: number,
): { x: number; y: number } | undefined {
    return projectWorldPoint(
        mapViewer,
        LUMBRIDGE_TD_MAP_X * 64 + localX,
        planeY,
        LUMBRIDGE_TD_MAP_Y * 64 + localY,
    );
}

function projectNormalizedTdPoint(
    mapViewer: MapViewer,
    point: { x: number; y: number },
    lift = 0,
): { x: number; y: number } | undefined {
    const tdMap = mapViewer.renderer.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
    if (!(tdMap instanceof WebGLMapSquare)) {
        return undefined;
    }

    const localX = point.x * 64;
    const localY = (1 - point.y) * 64;
    return projectWorldPoint(
        mapViewer,
        LUMBRIDGE_TD_MAP_X * 64 + localX,
        getLocalWorldHeight(tdMap, localX, localY) + lift,
        LUMBRIDGE_TD_MAP_Y * 64 + localY,
    );
}

type TdCanvasAnchor = {
    x: number;
    y: number;
    headHeightPx: number;
};

type TdProjectileCanvasAnchor = {
    x: number;
    y: number;
    angle: number;
    tileScalePx: number;
};

function percentPointToCanvasPixels(
    point: { x: number; y: number },
    viewportWidth: number,
    viewportHeight: number,
): { x: number; y: number } {
    return {
        x: (point.x / 100) * viewportWidth,
        y: (point.y / 100) * viewportHeight,
    };
}

function clampOverlayValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getNpcCanvasRenderPlane(
    map: WebGLMapSquare,
    npc: { x: number; y: number; level: number },
): number {
    const tileX = Math.max(0, Math.min(63, npc.x >> 7));
    const tileY = Math.max(0, Math.min(63, npc.y >> 7));
    let renderPlane = npc.level;
    if (renderPlane < 3 && (map.getTileRenderFlag(1, tileX, tileY) & 0x2) === 2) {
        renderPlane++;
    }
    return renderPlane;
}

function normalizedTdPointToLocalTile(point: { x: number; y: number }): { x: number; y: number } {
    return {
        x: point.x * 64,
        y: (1 - point.y) * 64,
    };
}

function getProjectedTileScalePx(
    mapViewer: MapViewer,
    localX: number,
    localY: number,
    viewportWidth: number,
    viewportHeight: number,
): number | undefined {
    const tdMap = mapViewer.renderer.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
    if (!(tdMap instanceof WebGLMapSquare)) {
        return undefined;
    }

    const center = projectWorldPoint(
        mapViewer,
        LUMBRIDGE_TD_MAP_X * 64 + localX,
        getLocalWorldHeight(tdMap, localX, localY),
        LUMBRIDGE_TD_MAP_Y * 64 + localY,
    );
    const offset = projectWorldPoint(
        mapViewer,
        LUMBRIDGE_TD_MAP_X * 64 + localX + 0.5,
        getLocalWorldHeight(tdMap, Math.min(63.99, localX + 0.5), localY),
        LUMBRIDGE_TD_MAP_Y * 64 + localY,
    );
    if (!center || !offset) {
        return undefined;
    }

    const centerPx = percentPointToCanvasPixels(center, viewportWidth, viewportHeight);
    const offsetPx = percentPointToCanvasPixels(offset, viewportWidth, viewportHeight);
    return Math.max(8, Math.hypot(offsetPx.x - centerPx.x, offsetPx.y - centerPx.y) * 2);
}

function getTdProjectileCanvasAnchor(
    mapViewer: MapViewer,
    projectile: LumbridgeTdState["projectiles"][number],
    viewportWidth: number,
    viewportHeight: number,
): TdProjectileCanvasAnchor | undefined {
    const tdMap = mapViewer.renderer.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
    if (!(tdMap instanceof WebGLMapSquare)) {
        return undefined;
    }

    const start = normalizedTdPointToLocalTile(projectile.from);
    const end = normalizedTdPointToLocalTile(projectile.to);
    const t = clampOverlayValue(projectile.elapsedMs / Math.max(1, projectile.durationMs), 0, 1);
    const localX = lerp(start.x, end.x, t);
    const localY = lerp(start.y, end.y, t);
    const arcHeight =
        Math.sin(Math.PI * t) *
        (projectile.kind === "mage" ? 0.48 : projectile.kind === "bolt" ? 0.24 : 0.12);

    const worldPoint = projectWorldPoint(
        mapViewer,
        LUMBRIDGE_TD_MAP_X * 64 + localX,
        getLocalWorldHeight(tdMap, localX, localY) - 0.35 - arcHeight,
        LUMBRIDGE_TD_MAP_Y * 64 + localY,
    );
    if (!worldPoint) {
        return undefined;
    }

    const nextT = Math.min(1, t + 0.03);
    const nextLocalX = lerp(start.x, end.x, nextT);
    const nextLocalY = lerp(start.y, end.y, nextT);
    const nextArcHeight =
        Math.sin(Math.PI * nextT) *
        (projectile.kind === "mage" ? 0.48 : projectile.kind === "bolt" ? 0.24 : 0.12);
    const nextPoint = projectWorldPoint(
        mapViewer,
        LUMBRIDGE_TD_MAP_X * 64 + nextLocalX,
        getLocalWorldHeight(tdMap, nextLocalX, nextLocalY) - 0.35 - nextArcHeight,
        LUMBRIDGE_TD_MAP_Y * 64 + nextLocalY,
    );
    const pointPx = percentPointToCanvasPixels(worldPoint, viewportWidth, viewportHeight);
    const nextPx = nextPoint
        ? percentPointToCanvasPixels(nextPoint, viewportWidth, viewportHeight)
        : undefined;
    const tileScalePx = getProjectedTileScalePx(
        mapViewer,
        localX,
        localY,
        viewportWidth,
        viewportHeight,
    );

    return {
        x: pointPx.x,
        y: pointPx.y,
        angle: nextPx ? Math.atan2(nextPx.y - pointPx.y, nextPx.x - pointPx.x) : 0,
        tileScalePx: tileScalePx ?? 16,
    };
}

function getTdEnemyCanvasAnchor(
    mapViewer: MapViewer,
    enemy: Enemy,
    viewportWidth: number,
    viewportHeight: number,
): TdCanvasAnchor | undefined {
    const tdMap = mapViewer.renderer.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
    if (tdMap instanceof WebGLMapSquare) {
        const npc = tdMap.npcs.find(
            (candidate) =>
                candidate.tdEnemyId === enemy.id && candidate.tdActive && !candidate.tdCompleted,
        );
        if (npc) {
            const localX = npc.x / 128;
            const localY = npc.y / 128;
            const renderPlane = getNpcCanvasRenderPlane(tdMap, npc);
            const groundY = getLocalWorldHeight(tdMap, localX, localY, renderPlane);
            const headHeight = getTdEnemyOverheadHeight(enemy, npc);
            const overheadHeight = headHeight * 1.3;
            const foot = projectWorldPoint(
                mapViewer,
                LUMBRIDGE_TD_MAP_X * 64 + localX,
                groundY,
                LUMBRIDGE_TD_MAP_Y * 64 + localY,
            );
            const head = projectWorldPoint(
                mapViewer,
                LUMBRIDGE_TD_MAP_X * 64 + localX,
                groundY - overheadHeight,
                LUMBRIDGE_TD_MAP_Y * 64 + localY,
            );
            if (!foot || !head) {
                return undefined;
            }

            const footPx = percentPointToCanvasPixels(foot, viewportWidth, viewportHeight);
            const headPx = percentPointToCanvasPixels(head, viewportWidth, viewportHeight);
            return {
                x: headPx.x,
                y: headPx.y,
                headHeightPx: Math.max(12, Math.abs(footPx.y - headPx.y)),
            };
        }
    }

    const fallbackFoot = projectNormalizedTdPoint(mapViewer, samplePath(enemy.progress), 0);
    const fallbackHead = projectNormalizedTdPoint(
        mapViewer,
        samplePath(enemy.progress),
        -getFallbackEnemyOverheadHeight(enemy),
    );
    if (!fallbackFoot || !fallbackHead) {
        return undefined;
    }

    const footPx = percentPointToCanvasPixels(fallbackFoot, viewportWidth, viewportHeight);
    const headPx = percentPointToCanvasPixels(fallbackHead, viewportWidth, viewportHeight);
    return {
        x: headPx.x,
        y: headPx.y,
        headHeightPx: Math.max(12, Math.abs(footPx.y - headPx.y)),
    };
}

function getTdLocalSpeakerCanvasAnchor(
    mapViewer: MapViewer,
    speakerId: string,
    fallbackTile: { x: number; y: number },
    viewportWidth: number,
    viewportHeight: number,
): TdCanvasAnchor | undefined {
    const tdMap = mapViewer.renderer.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
    if (tdMap instanceof WebGLMapSquare) {
        const npc = tdMap.npcs.find((candidate) => candidate.tdLocalSpeakerId === speakerId);
        if (npc) {
            const localX = npc.x / 128;
            const localY = npc.y / 128;
            const renderPlane = getNpcCanvasRenderPlane(tdMap, npc);
            const groundY = getLocalWorldHeight(tdMap, localX, localY, renderPlane);
            const headHeight = getNpcOverheadHeight(npc);
            const overheadHeight = headHeight * 1.3;
            const foot = projectWorldPoint(
                mapViewer,
                LUMBRIDGE_TD_MAP_X * 64 + localX,
                groundY,
                LUMBRIDGE_TD_MAP_Y * 64 + localY,
            );
            const head = projectWorldPoint(
                mapViewer,
                LUMBRIDGE_TD_MAP_X * 64 + localX,
                groundY - overheadHeight,
                LUMBRIDGE_TD_MAP_Y * 64 + localY,
            );
            if (!foot || !head) {
                return undefined;
            }

            const footPx = percentPointToCanvasPixels(foot, viewportWidth, viewportHeight);
            const headPx = percentPointToCanvasPixels(head, viewportWidth, viewportHeight);
            return {
                x: headPx.x,
                y: headPx.y,
                headHeightPx: Math.max(12, Math.abs(footPx.y - headPx.y)),
            };
        }

        const foot = projectWorldPoint(
            mapViewer,
            LUMBRIDGE_TD_MAP_X * 64 + fallbackTile.x + 0.5,
            getLocalWorldHeight(tdMap, fallbackTile.x + 0.5, fallbackTile.y + 0.5),
            LUMBRIDGE_TD_MAP_Y * 64 + fallbackTile.y + 0.5,
        );
        const head = projectWorldPoint(
            mapViewer,
            LUMBRIDGE_TD_MAP_X * 64 + fallbackTile.x + 0.5,
            getLocalWorldHeight(tdMap, fallbackTile.x + 0.5, fallbackTile.y + 0.5) - 1.4,
            LUMBRIDGE_TD_MAP_Y * 64 + fallbackTile.y + 0.5,
        );
        if (!foot || !head) {
            return undefined;
        }

        const footPx = percentPointToCanvasPixels(foot, viewportWidth, viewportHeight);
        const headPx = percentPointToCanvasPixels(head, viewportWidth, viewportHeight);
        return {
            x: headPx.x,
            y: headPx.y,
            headHeightPx: Math.max(12, Math.abs(footPx.y - headPx.y)),
        };
    }

    const foot = projectNormalizedTdPoint(mapViewer, localTileToRouteEditorPoint(fallbackTile), 0);
    const head = projectNormalizedTdPoint(
        mapViewer,
        localTileToRouteEditorPoint(fallbackTile),
        -1.4,
    );
    if (!foot || !head) {
        return undefined;
    }

    const footPx = percentPointToCanvasPixels(foot, viewportWidth, viewportHeight);
    const headPx = percentPointToCanvasPixels(head, viewportWidth, viewportHeight);
    return {
        x: headPx.x,
        y: headPx.y,
        headHeightPx: Math.max(12, Math.abs(footPx.y - headPx.y)),
    };
}

function drawTdOverheadOverlay(
    ctx: CanvasRenderingContext2D,
    mapViewer: MapViewer,
    viewportWidth: number,
    viewportHeight: number,
    state: LumbridgeTdState,
    speechBubbles: readonly TdSpeechBubble[],
    settings: TdRenderSettings,
): void {
    if (settings.showEnemyHealthBars) {
        for (const enemy of state.enemies) {
            const anchor = getTdEnemyCanvasAnchor(mapViewer, enemy, viewportWidth, viewportHeight);
            if (!anchor) {
                continue;
            }
            drawEnemyHealthbarCanvas(
                ctx,
                anchor,
                enemy.hp / Math.max(1, enemy.maxHp),
                state.selectedEnemy?.id === enemy.id,
            );
        }
    }

    if (!settings.showSpeechBubbles) {
        return;
    }

    for (const bubble of speechBubbles) {
        if (bubble.enemyId) {
            const enemy = state.enemies.find((candidate) => candidate.id === bubble.enemyId);
            if (!enemy) {
                continue;
            }

            const anchor = getTdEnemyCanvasAnchor(mapViewer, enemy, viewportWidth, viewportHeight);
            if (!anchor) {
                continue;
            }
            drawOverheadTextCanvas(ctx, anchor, bubble.text);
            continue;
        }

        if (!bubble.localSpeakerId || !bubble.fallbackLocalTile) {
            continue;
        }

        const anchor = getTdLocalSpeakerCanvasAnchor(
            mapViewer,
            bubble.localSpeakerId,
            bubble.fallbackLocalTile,
            viewportWidth,
            viewportHeight,
        );
        if (!anchor) {
            continue;
        }
        drawOverheadTextCanvas(ctx, anchor, bubble.text);
    }
}

function drawEnemyHealthbarCanvas(
    ctx: CanvasRenderingContext2D,
    anchor: TdCanvasAnchor,
    healthRatio: number,
    selected: boolean,
): void {
    const width = Math.round(clampOverlayValue(anchor.headHeightPx * 1.4, 18, 56));
    const height = Math.round(clampOverlayValue(anchor.headHeightPx * 0.18, 4, 8));
    const x = Math.round(anchor.x - width / 2);
    const gap = Math.round(clampOverlayValue(anchor.headHeightPx * 0.08, 3, 8));
    const y = Math.round(anchor.y - gap - height);
    const hpWidth = Math.round(width * clampOverlayValue(healthRatio, 0, 1));

    ctx.fillStyle = "#1a0c09";
    ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
    ctx.fillStyle = "#7a120f";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = healthRatio > 0.6 ? "#5df45f" : healthRatio > 0.3 ? "#ffcf33" : "#ff5a4a";
    ctx.fillRect(x, y, hpWidth, height);

    if (selected) {
        ctx.strokeStyle = "rgba(255, 255, 0, 0.9)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
    }
}

function wrapOverheadText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
        return words.length === 0 ? [] : [words[0]];
    }

    const lines: string[] = [];
    let current = words[0];

    for (let index = 1; index < words.length; index++) {
        const next = `${current} ${words[index]}`;
        if (ctx.measureText(next).width <= maxWidth) {
            current = next;
            continue;
        }

        lines.push(current);
        current = words[index];
    }

    lines.push(current);
    return lines;
}

function drawOverheadTextCanvas(
    ctx: CanvasRenderingContext2D,
    anchor: TdCanvasAnchor,
    text: string,
): void {
    const fontSize = Math.round(clampOverlayValue(anchor.headHeightPx * 0.5, 12, 21));
    const lineHeight = Math.round(fontSize * 1.02);
    const maxWidth = clampOverlayValue(anchor.headHeightPx * 6.8, 120, 240);
    ctx.font = `${fontSize}px "OSRS Bold", ui-monospace, monospace`;
    const lines = wrapOverheadText(ctx, text, maxWidth);
    if (lines.length === 0) {
        return;
    }

    const topY =
        anchor.y -
        clampOverlayValue(anchor.headHeightPx * 0.95, fontSize + 4, fontSize + 22) -
        (lines.length - 1) * lineHeight;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffff00";
    const shadowOffset = Math.max(1, Math.round(fontSize / 13));
    const shadowOffsets = [
        [-shadowOffset, 0],
        [shadowOffset, 0],
        [0, -shadowOffset],
        [0, shadowOffset],
        [-shadowOffset, -shadowOffset],
        [-shadowOffset, shadowOffset],
        [shadowOffset, -shadowOffset],
        [shadowOffset, shadowOffset],
    ] as const;

    lines.forEach((line, index) => {
        const y = topY + index * lineHeight;
        ctx.fillStyle = "#000000";
        for (const [offsetX, offsetY] of shadowOffsets) {
            ctx.fillText(line, anchor.x + offsetX, y + offsetY);
        }
        ctx.fillStyle = "#ffff00";
        ctx.fillText(line, anchor.x, y);
    });
}

function getNpcOverheadHeight(npc: WebGLMapSquare["npcs"][number]): number {
    const scaledHeight = npc.npcType.heightScale / 128;
    const sizeHeight = npc.npcType.size * 0.9;
    return Math.max(0.9, Math.min(4.2, sizeHeight * scaledHeight + 0.65));
}

function getArchetypeEnemyOverheadHeight(enemy: Enemy): number | undefined {
    switch (enemy.archetype.name) {
        case "Hill Giant":
        case "Moss Giant":
            return 3.2;
        case "Black dragon":
        case "Demon":
            return 2.4;
        case "Spider":
            return 0.72;
        default:
            return undefined;
    }
}

function getTdEnemyOverheadHeight(enemy: Enemy, npc?: WebGLMapSquare["npcs"][number]): number {
    const archetypeHeight = getArchetypeEnemyOverheadHeight(enemy);
    if (archetypeHeight !== undefined) {
        return archetypeHeight;
    }
    if (npc) {
        return getNpcOverheadHeight(npc);
    }
    return 1.25;
}

function getFallbackEnemyOverheadHeight(enemy: Enemy): number {
    return getTdEnemyOverheadHeight(enemy);
}

function getProjectedTileCorners(
    mapViewer: MapViewer,
    map: WebGLMapSquare,
    tileX: number,
    tileY: number,
): Array<{ x: number; y: number }> {
    const worldBaseX = LUMBRIDGE_TD_MAP_X * 64 + tileX;
    const worldBaseY = LUMBRIDGE_TD_MAP_Y * 64 + tileY;
    const corners = [
        projectWorldPoint(mapViewer, worldBaseX, getWorldTileHeight(map, tileX, tileY), worldBaseY),
        projectWorldPoint(
            mapViewer,
            worldBaseX + 1,
            getWorldTileHeight(map, tileX + 1, tileY),
            worldBaseY,
        ),
        projectWorldPoint(
            mapViewer,
            worldBaseX + 1,
            getWorldTileHeight(map, tileX + 1, tileY + 1),
            worldBaseY + 1,
        ),
        projectWorldPoint(
            mapViewer,
            worldBaseX,
            getWorldTileHeight(map, tileX, tileY + 1),
            worldBaseY + 1,
        ),
    ];

    return corners.filter((corner): corner is { x: number; y: number } => corner !== undefined);
}

function projectWorldPoint(
    mapViewer: MapViewer,
    x: number,
    y: number,
    z: number,
): { x: number; y: number } | undefined {
    const clip = vec4.fromValues(x, y, z, 1);
    vec4.transformMat4(clip, clip, mapViewer.camera.viewMatrix);
    clip[2] += 0.01;
    vec4.transformMat4(clip, clip, mapViewer.camera.projectionMatrix);

    if (clip[3] <= 0) {
        return undefined;
    }

    const ndcX = clip[0] / clip[3];
    const ndcY = clip[1] / clip[3];

    return {
        x: (ndcX + 1) * 0.5 * 100,
        y: (1 - ndcY) * 0.5 * 100,
    };
}
