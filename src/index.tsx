import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./index.css";
import MapViewerApp from "./lib/mapviewer/MapViewerApp";
import { TowerDefenseApp } from "./towerdefense/TowerDefenseApp";
import reportWebVitals from "./reportWebVitals";
import { Bzip2 } from "./rs/compression/Bzip2";
import { Gzip } from "./rs/compression/Gzip";

Bzip2.initWasm();
Gzip.initWasm();

window.wallpaperPropertyListener = {
    applyGeneralProperties: (properties: any) => {
        if (properties.fps) {
            window.wallpaperFpsLimit = properties.fps;
        }
    },
};

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const isTowerDefenseMode = process.env.REACT_APP_TD === "1";
root.render(
    // <React.StrictMode>
    <BrowserRouter>
        {isTowerDefenseMode ? <TowerDefenseApp /> : <MapViewerApp />}
    </BrowserRouter>,
    // </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
