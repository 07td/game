import { vec4 } from "gl-matrix";
import { Fragment, MouseEvent, useEffect, useRef, useState } from "react";

import { MapViewer } from "../MapViewer";
import { WebGLMapSquare } from "../webgl/WebGLMapSquare";
import { DukeHoracioChatHeadCanvas } from "./DukeHoracioChatHeadCanvas";
import coinsIcon from "./coins-100.png";
import "./LumbridgeTowerDefenseOverlay.css";
import hitpointsIcon from "./hitpoints-icon.png";
import { TdLootItemCanvas } from "./TdLootItemCanvas";
import {
    Enemy,
    LUMBRIDGE_PADS,
    TOWER_DEFS,
    TowerKind,
    createInitialLumbridgeTdState,
    deselectEnemy,
    dismissWaveSummary,
    placeTower,
    resetGame,
    samplePath,
    selectEnemy,
    selectTower,
    startWave,
    startWaveFromSummary,
    tickLumbridgeTd,
} from "./lumbridgeTd";
import {
    LUMBRIDGE_TD_ENEMY_SELECTED,
    emitLumbridgeTdReset,
    emitLumbridgeTdStartWave,
    emitLumbridgeTdTowersChanged,
} from "./lumbridgeTdEvents";
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

interface LumbridgeTowerDefenseOverlayProps {
    mapViewer: MapViewer;
}

type ProjectedTowerPad = {
    id: string;
    tilePolygon: string;
    rangePolygon: string;
    label: { x: number; y: number };
    color: string;
    built: boolean;
    disabled: boolean;
};

const DUKE_HORACIO_INTRO_LINES = [
    "They're here! What do we do?!",
    "You must have learned something in the academy. Where do we put our defenses?",
];

export function LumbridgeTowerDefenseOverlay({
    mapViewer,
}: LumbridgeTowerDefenseOverlayProps): JSX.Element {
    const stateRef = useRef(createInitialLumbridgeTdState());
    const [state, setState] = useState(stateRef.current);
    const [introStep, setIntroStep] = useState(0);
    const [buildMode, setBuildMode] = useState<TowerKind | undefined>();
    const [buildRotation, setBuildRotation] = useState(0);
    const [hoveredPadId, setHoveredPadId] = useState<string | undefined>();
    const [buildPreview, setBuildPreview] = useState<{ x: number; y: number } | undefined>();
    const [pathOverlayVisible, setPathOverlayVisible] = useState(true);
    const [routeEditorOpen, setRouteEditorOpen] = useState(true);
    const [routeDraft, setRouteDraft] = useState(getLumbridgeTdRoute());
    const [worldRoutePolygons, setWorldRoutePolygons] = useState<string[]>([]);
    const [worldRouteLine, setWorldRouteLine] = useState("");
    const [worldPadOverlays, setWorldPadOverlays] = useState<ProjectedTowerPad[]>([]);
    const enemyHealthbarRefs = useRef(new Map<string, HTMLDivElement>());
    const [padWorldAnchors, setPadWorldAnchors] = useState<
        Record<string, { x: number; y: number; z: number }>
    >({});
    const routeEditorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let animationId = -1;
        let last = performance.now();
        let snapshotTimer = 0;

        const frame = (time: number) => {
            const delta = Math.min(50, time - last);
            last = time;
            snapshotTimer += delta;

            stateRef.current = tickLumbridgeTd(stateRef.current, delta);
            syncEnemyHealthbarPositions(
                mapViewer,
                stateRef.current.enemies,
                enemyHealthbarRefs.current,
            );

            if (snapshotTimer >= 50) {
                snapshotTimer = 0;
                setState({ ...stateRef.current });
            }

            animationId = requestAnimationFrame(frame);
        };

        animationId = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(animationId);
    }, []);

    useEffect(() => {
        setRouteDraft(getLumbridgeTdRoute());
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
        };
        window.addEventListener(LUMBRIDGE_TD_ENEMY_SELECTED, onEnemySelected as EventListener);
        return () =>
            window.removeEventListener(
                LUMBRIDGE_TD_ENEMY_SELECTED,
                onEnemySelected as EventListener,
            );
    }, []);

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
                padId: tower.padId,
                kind: tower.kind,
                rotation: tower.rotation,
                world: tower.world,
            })),
        );
    }, [state.towers]);

    useEffect(() => {
        let animationId = -1;

        const updatePadAnchors = () => {
            const nextAnchors: Record<string, { x: number; y: number; z: number }> = {};
            let ready = true;

            for (const pad of LUMBRIDGE_PADS) {
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
    }, [mapViewer]);

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

            for (const pad of LUMBRIDGE_PADS) {
                const tower = state.towers.find((candidate) => candidate.padId === pad.id);
                const towerDef = tower ? TOWER_DEFS[tower.kind] : TOWER_DEFS[state.selectedTower];
                const tileCorners = getProjectedPadCorners(mapViewer, tdMap, pad.tileX, pad.tileY);
                const rangePolygon = getProjectedGroundCircle(
                    mapViewer,
                    tdMap,
                    pad.tileX + 0.5,
                    pad.tileY + 0.5,
                    towerDef.range * 64,
                );
                const label = projectWorldPoint(
                    mapViewer,
                    LUMBRIDGE_TD_MAP_X * 64 + pad.tileX + 0.5,
                    getLocalWorldHeight(tdMap, pad.tileX + 0.5, pad.tileY + 0.5) + 0.08,
                    LUMBRIDGE_TD_MAP_Y * 64 + pad.tileY + 0.5,
                );

                if (tileCorners.length === 4 && rangePolygon && label) {
                    nextPadOverlays.push({
                        id: pad.id,
                        tilePolygon: tileCorners
                            .map((corner) => `${corner.x},${corner.y}`)
                            .join(" "),
                        rangePolygon,
                        label,
                        color: towerDef.color,
                        built: tower !== undefined,
                        disabled: tower === undefined && state.gold < towerDef.cost,
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
    }, [mapViewer, routeDraft, state.gold, state.selectedTower, state.towers]);

    const startNextWave = () => {
        stateRef.current = startWave(stateRef.current);
        setState({ ...stateRef.current });
        emitLumbridgeTdStartWave({
            wave: stateRef.current.wave,
            enemyCount: stateRef.current.waveSpawnCount,
        });
    };

    const onSelectTower = (towerKind: TowerKind) => {
        stateRef.current = selectTower(stateRef.current, towerKind);
        setState({ ...stateRef.current });
    };

    const onStartBuild = (towerKind: TowerKind) => {
        stateRef.current = selectTower(stateRef.current, towerKind);
        setState({ ...stateRef.current });
        setBuildMode(towerKind);
        setBuildRotation(0);
    };

    const onPlaceTower = (padId: string) => {
        if (!buildMode) {
            return;
        }
        const pad = LUMBRIDGE_PADS.find((candidate) => candidate.id === padId);
        const world = pad
            ? padWorldAnchors[pad.id] ?? getLumbridgePadWorldAnchor(mapViewer, pad)
            : undefined;
        if (!pad || !world) {
            return;
        }
        const nextState = placeTower(stateRef.current, padId, world, buildRotation);
        if (nextState === stateRef.current) {
            return;
        }
        stateRef.current = nextState;
        setState({ ...stateRef.current });
        setBuildMode(undefined);
        setHoveredPadId(undefined);
    };

    const onReset = () => {
        stateRef.current = resetGame();
        setState({ ...stateRef.current });
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

    const onSelectEnemy = (enemyId: string) => {
        const enemy = stateRef.current.enemies.find((candidate) => candidate.id === enemyId);
        if (!enemy) {
            return;
        }
        stateRef.current = selectEnemy(stateRef.current, enemy);
        setState({ ...stateRef.current });
    };

    const onDeselectEnemy = () => {
        stateRef.current = deselectEnemy(stateRef.current);
        setState({ ...stateRef.current });
    };

    const onRouteEditorClick = (event: MouseEvent<HTMLDivElement>) => {
        const rect = routeEditorRef.current?.getBoundingClientRect();
        if (!rect) {
            return;
        }
        const normalizedX = (event.clientX - rect.left) / rect.width;
        const normalizedY = (event.clientY - rect.top) / rect.height;
        const nextRoute = [...routeDraft, routeEditorPointToLocalTile(normalizedX, normalizedY)];
        setRouteDraft(nextRoute);
        setLumbridgeTdRoute(nextRoute);
        emitLumbridgeTdReset();
    };

    const undoRoutePoint = () => {
        const nextRoute = routeDraft.slice(0, -1);
        setRouteDraft(nextRoute);
        setLumbridgeTdRoute(nextRoute);
        emitLumbridgeTdReset();
    };

    const clearRoute = () => {
        setRouteDraft([]);
        setLumbridgeTdRoute([]);
        emitLumbridgeTdReset();
    };

    const resetRoute = () => {
        const nextRoute = getDefaultLumbridgeTdRoute();
        setRouteDraft(nextRoute);
        resetLumbridgeTdRoute();
        emitLumbridgeTdReset();
    };

    const routeImageUrl = mapViewer.getMapImageUrl(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y, false);
    const routeDraftPoints = routeDraft.map(localTileToRouteEditorPoint);
    const towerKinds: TowerKind[] = ["bolt", "cannon", "mage"];
    const introLine = DUKE_HORACIO_INTRO_LINES[introStep];
    const showDeathScreen = state.gameOver;

    return (
        <div
            className="td-overlay"
            onClick={() => {
                if (state.selectedEnemy) {
                    onDeselectEnemy();
                }
            }}
        >
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

            <div className="td-build-panel rs-border rs-background">
                <div className="td-panel-title">Build Mode</div>
                <div className="td-build-copy content-text">
                    <span>Left-click to place</span>
                    <span>Right-click to cancel</span>
                </div>
                <div className="td-legend content-text">
                    <span>
                        <i className="td-legend-node" />
                        Route Node
                    </span>
                    <span>
                        <i className="td-legend-range" />
                        Tower Range
                    </span>
                    <span>
                        <i className="td-legend-preview" />
                        Tower Preview
                    </span>
                    <span>
                        <i className="td-legend-invalid" />
                        Invalid Placement
                    </span>
                </div>
            </div>

            <div className="td-right-rail">
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
                    <div className="td-summary-list content-text">
                        <div className="td-summary-row muted">
                            <span>Next Wave</span>
                            <span>None</span>
                        </div>
                    </div>
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
                            className={`td-button ${pathOverlayVisible ? "selected" : ""}`}
                            onClick={() => setPathOverlayVisible((visible) => !visible)}
                        >
                            <span>{pathOverlayVisible ? "Hide Path" : "Show Path"}</span>
                        </button>
                        <button
                            className={`td-button ${routeEditorOpen ? "selected" : ""}`}
                            onClick={() => setRouteEditorOpen((open) => !open)}
                        >
                            <span>{routeEditorOpen ? "Close Route" : "Edit Route"}</span>
                            <span>{routeDraft.length} pts</span>
                        </button>
                    </div>
                    <div className="td-footer content-text">
                        <span>
                            {state.waveInProgress
                                ? `${state.waveSpawned}/${state.waveSpawnCount} spawned`
                                : state.gameOver
                                ? "Lumbridge fell"
                                : `${state.waveSpawned}/${state.waveSpawnCount} spawned`}
                        </span>
                        <span>{state.waveInProgress ? "Combat Phase" : "Build Phase"}</span>
                    </div>
                </div>

                <div className="td-shop rs-border rs-background">
                    <div className="td-tabs content-text">
                        <button className="active">Towers</button>
                        <button>Barricades</button>
                        <button>Info</button>
                    </div>
                    <div className="td-shop-list">
                        {towerKinds.map((towerKind) => {
                            const def = TOWER_DEFS[towerKind];
                            return (
                                <div key={towerKind} className="td-shop-row">
                                    <div className={`td-shop-icon ${towerKind}`} />
                                    <div className="td-shop-copy content-text">
                                        <div className="td-shop-title">
                                            <span>{def.name}</span>
                                            <span>{def.cost}g</span>
                                        </div>
                                        <span>
                                            {towerKind === "bolt"
                                                ? "Rapid-fire bolts"
                                                : towerKind === "cannon"
                                                ? "High damage area attack"
                                                : "Magic attack"}
                                        </span>
                                        <span>
                                            {towerKind === "bolt"
                                                ? "Effective vs. weak enemies"
                                                : towerKind === "cannon"
                                                ? "Slow rate of fire"
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
                        <div className="td-shop-row disabled">
                            <div className="td-shop-icon barricade" />
                            <div className="td-shop-copy content-text">
                                <div className="td-shop-title">
                                    <span>Barricade</span>
                                    <span>10g</span>
                                </div>
                                <span>Blocks and slows enemies</span>
                                <span>Can be damaged</span>
                            </div>
                            <button className="td-build-button" disabled>
                                Build
                            </button>
                        </div>
                    </div>
                </div>

                {routeEditorOpen && (
                    <div className="td-route-editor rs-border rs-background">
                        <div className="td-route-head">
                            <div className="td-header">Route Drawer</div>
                            <select
                                className="td-route-select"
                                value="default"
                                onChange={() => resetRoute()}
                            >
                                <option value="default">Default</option>
                            </select>
                        </div>
                        <div className="td-route-actions">
                            <button
                                className="td-button"
                                onClick={undoRoutePoint}
                                disabled={routeDraft.length === 0}
                            >
                                <span>Undo</span>
                            </button>
                            <button className="td-button" onClick={resetRoute}>
                                <span>Redo</span>
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
                        </div>
                        <div className="td-route-help content-text">
                            Left-click to add node. Right-click to remove node. Drag to move
                            existing nodes.
                        </div>
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
                                                .map((point) => `${point.x * 100},${point.y * 100}`)
                                                .join(" ")}
                                        />
                                    </svg>
                                )}
                                {routeDraft.map((point, index) => {
                                    const marker = routeDraftPoints[index];
                                    const tileSize = 100 / 64;
                                    return (
                                        <Fragment key={`${point.x}-${point.y}-${index}`}>
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
                                                className="td-route-point"
                                                style={{
                                                    left: `${marker.x * 100}%`,
                                                    top: `${marker.y * 100}%`,
                                                }}
                                            >
                                                <span>{index + 1}</span>
                                            </div>
                                        </Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="td-playfield">
                {(worldRoutePolygons.length > 0 || worldPadOverlays.length > 0) && (
                    <svg
                        className="td-world-route"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                    >
                        {pathOverlayVisible && (
                            <>
                                {worldRoutePolygons.map((polygon, index) => (
                                    <polygon
                                        key={`${polygon}-${index}`}
                                        className={`td-world-route-tile ${
                                            state.waveInProgress ? "active" : "idle"
                                        }`}
                                        points={polygon}
                                    />
                                ))}
                                {worldRouteLine && (
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
                                    buildMode ? "build-active" : ""
                                } ${hoveredPadId === pad.id ? "hovered" : ""} ${
                                    pad.disabled ? "disabled" : ""
                                }`}
                            >
                                <polygon
                                    className="td-world-pad-range"
                                    points={pad.rangePolygon}
                                    style={{ stroke: pad.color }}
                                />
                                <polygon
                                    className="td-world-pad-tile"
                                    points={pad.tilePolygon}
                                    style={{ fill: pad.color, stroke: pad.color }}
                                    onMouseEnter={() => setHoveredPadId(pad.id)}
                                    onMouseLeave={() =>
                                        setHoveredPadId((current) =>
                                            current === pad.id ? undefined : current,
                                        )
                                    }
                                    onClick={() => onPlaceTower(pad.id)}
                                />
                                <text
                                    className="td-world-pad-label"
                                    x={pad.label.x}
                                    y={pad.label.y}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                >
                                    +
                                </text>
                            </g>
                        ))}
                    </svg>
                )}

                {state.projectiles.map((projectile) => {
                    const t = projectile.elapsedMs / projectile.durationMs;
                    const from = projectNormalizedTdPoint(mapViewer, projectile.from, 0.45);
                    const to = projectNormalizedTdPoint(mapViewer, projectile.to, 0.45);
                    if (!from || !to) {
                        return null;
                    }
                    const x = from.x + (to.x - from.x) * t;
                    const y = from.y + (to.y - from.y) * t;
                    return (
                        <div
                            key={projectile.id}
                            className={`td-projectile ${
                                projectile.kind === "cannon" ? "cannon" : ""
                            }`}
                            style={{
                                left: `${x}%`,
                                top: `${y}%`,
                                backgroundColor: projectile.color,
                                boxShadow: `0 0 12px ${projectile.color}`,
                            }}
                        />
                    );
                })}

                {state.enemies.map((enemy) => {
                    const enemyPoint = projectTdEnemyPoint(
                        mapViewer,
                        enemy.id,
                        samplePath(enemy.progress),
                        getFallbackEnemyOverheadHeight(enemy),
                    );
                    if (!enemyPoint) {
                        return null;
                    }
                    const healthPercent = (enemy.hp / enemy.maxHp) * 100;
                    const isSelected = state.selectedEnemy?.id === enemy.id;
                    return (
                        <div
                            key={enemy.id}
                            ref={(element) => {
                                if (element) {
                                    enemyHealthbarRefs.current.set(enemy.id, element);
                                } else {
                                    enemyHealthbarRefs.current.delete(enemy.id);
                                }
                            }}
                            className={`td-enemy-healthbar ${isSelected ? "selected" : ""}`}
                            style={{
                                left: `${enemyPoint.x}%`,
                                top: `${enemyPoint.y}%`,
                            }}
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelectEnemy(enemy.id);
                            }}
                        >
                            <div className="td-enemy-name">{enemy.archetype.name}</div>
                            <div className="td-enemy-bar">
                                <div
                                    className="td-enemy-bar-fill"
                                    style={{
                                        width: `${healthPercent}%`,
                                        backgroundColor:
                                            healthPercent > 60
                                                ? "#72ff6c"
                                                : healthPercent > 30
                                                ? "#ffcc00"
                                                : "#ff4444",
                                    }}
                                />
                            </div>
                            <div className="td-enemy-hp">
                                {enemy.hp}/{enemy.maxHp}
                            </div>
                        </div>
                    );
                })}
            </div>

            {buildMode && buildPreview && (
                <div
                    className={`td-build-ghost ${buildMode} ${hoveredPadId ? "valid" : "invalid"}`}
                    style={{
                        left: `${buildPreview.x}px`,
                        top: `${buildPreview.y}px`,
                        transform: `translate(-50%, -78%) rotate(${buildRotation * 90}deg)`,
                    }}
                >
                    <div className="td-build-ghost-model" />
                    <div className="td-build-ghost-label content-text">
                        {hoveredPadId ? "Place" : "Choose a pad"}
                    </div>
                </div>
            )}

            <div className="td-bottom-hint rs-border rs-background content-text">
                {buildMode
                    ? `Placing ${TOWER_DEFS[buildMode].name}. R or wheel rotates, left-click a pad, right-click cancels.`
                    : "Select a tower or barricade to build."}
            </div>

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

            {state.showEnemyInfo && state.selectedEnemy && (
                <div className="td-enemy-info-overlay">
                    <div className="td-enemy-info rs-border rs-background">
                        <div className="td-enemy-info-header">
                            <div className="td-header">{state.selectedEnemy.archetype.name}</div>
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

function getLocalWorldHeight(map: WebGLMapSquare, localX: number, localY: number): number {
    const x = Math.max(0, Math.min(63.99, localX));
    const y = Math.max(0, Math.min(63.99, localY));
    const tileX = Math.floor(x);
    const tileY = Math.floor(y);
    const fracX = x - tileX;
    const fracY = y - tileY;

    const h00 = map.getTileHeight(0, tileX, tileY);
    const h10 = map.getTileHeight(0, tileX + 1, tileY);
    const h01 = map.getTileHeight(0, tileX, tileY + 1);
    const h11 = map.getTileHeight(0, tileX + 1, tileY + 1);
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
    const halfSize = 1.25;
    const corners = [
        projectLocalGroundPoint(mapViewer, map, centerX, centerY - halfSize),
        projectLocalGroundPoint(mapViewer, map, centerX + halfSize, centerY),
        projectLocalGroundPoint(mapViewer, map, centerX, centerY + halfSize),
        projectLocalGroundPoint(mapViewer, map, centerX - halfSize, centerY),
    ];

    return corners.filter((corner): corner is { x: number; y: number } => corner !== undefined);
}

function getProjectedGroundCircle(
    mapViewer: MapViewer,
    map: WebGLMapSquare,
    localX: number,
    localY: number,
    radius: number,
): string | undefined {
    const points: string[] = [];
    for (let i = 0; i < 40; i++) {
        const angle = (Math.PI * 2 * i) / 40;
        const projected = projectLocalGroundPoint(
            mapViewer,
            map,
            localX + Math.cos(angle) * radius,
            localY + Math.sin(angle) * radius,
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

function syncEnemyHealthbarPositions(
    mapViewer: MapViewer,
    enemies: Enemy[],
    healthbarRefs: Map<string, HTMLDivElement>,
): void {
    const activeEnemyIds = new Set(enemies.map((enemy) => enemy.id));
    healthbarRefs.forEach((element, enemyId) => {
        if (!activeEnemyIds.has(enemyId)) {
            element.style.display = "none";
        }
    });

    for (const enemy of enemies) {
        const element = healthbarRefs.get(enemy.id);
        if (!element) {
            continue;
        }

        const enemyPoint = projectTdEnemyPoint(
            mapViewer,
            enemy.id,
            samplePath(enemy.progress),
            getFallbackEnemyOverheadHeight(enemy),
        );
        if (!enemyPoint) {
            element.style.display = "none";
            continue;
        }

        element.style.display = "";
        element.style.left = `${enemyPoint.x}%`;
        element.style.top = `${enemyPoint.y}%`;
    }
}

function projectTdEnemyPoint(
    mapViewer: MapViewer,
    enemyId: string,
    fallbackPoint: { x: number; y: number },
    overheadHeight = 0,
): { x: number; y: number } | undefined {
    const tdMap = mapViewer.renderer.mapManager.getMap(LUMBRIDGE_TD_MAP_X, LUMBRIDGE_TD_MAP_Y);
    if (tdMap instanceof WebGLMapSquare) {
        const npc = tdMap.npcs.find(
            (candidate) =>
                candidate.tdEnemyId === enemyId && candidate.tdActive && !candidate.tdCompleted,
        );
        if (npc) {
            const localX = npc.x / 128;
            const localY = npc.y / 128;
            return projectWorldPoint(
                mapViewer,
                LUMBRIDGE_TD_MAP_X * 64 + localX,
                getLocalWorldHeight(tdMap, localX, localY) -
                    Math.max(getNpcOverheadHeight(npc), overheadHeight),
                LUMBRIDGE_TD_MAP_Y * 64 + localY,
            );
        }
    }

    return projectNormalizedTdPoint(mapViewer, fallbackPoint, -overheadHeight);
}

function getNpcOverheadHeight(npc: WebGLMapSquare["npcs"][number]): number {
    const scaledHeight = npc.npcType.heightScale / 128;
    const sizeHeight = npc.npcType.size * 0.9;
    return Math.max(0.9, Math.min(4.2, sizeHeight * scaledHeight + 0.65));
}

function getFallbackEnemyOverheadHeight(enemy: Enemy): number {
    switch (enemy.archetype.name) {
        case "Hill Giant":
        case "Moss Giant":
            return 3.2;
        case "Black dragon":
        case "Demon":
            return 2.4;
        case "Spider":
            return 0.9;
        default:
            return 1.25;
    }
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
