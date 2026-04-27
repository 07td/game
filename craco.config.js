const { when, whenDev, addBeforeLoader, loaderByName } = require("@craco/craco");
const path = require("path");

const ThreadsPlugin = require("threads-plugin");

const express = require("express");

module.exports = {
    webpack: {
        configure: (webpackConfig) => {
            const glslLoader = {
                test: /\.(glsl|vs|fs)$/,
                loader: "ts-shader-loader",
            };

            // Kind of a hack to get the glsl loader to work
            // https://github.com/dilanx/craco/issues/486
            for (const rule of webpackConfig.module.rules) {
                if (rule.oneOf) {
                    rule.oneOf.unshift(glslLoader);
                    break;
                }
            }

            webpackConfig.module.rules.push({
                resourceQuery: /url/,
                type: "asset/resource",
            });
            webpackConfig.module.rules.push({
                resourceQuery: /source/,
                type: "asset/source",
            });

            // addBeforeLoader(webpackConfig, loaderByName('file-loader'), glslLoader);

            webpackConfig.resolve.fallback = {
                fs: false,
            };
            webpackConfig.resolve.alias = {
                ...webpackConfig.resolve.alias,
                "@rs-map-viewer/mapviewer": path.resolve(__dirname, "src/lib/mapviewer"),
                "@rs-map-viewer/rs": path.resolve(__dirname, "src/rs"),
                "@rs-map-viewer/towerdefense": path.resolve(__dirname, "src/towerdefense"),
            };

            webpackConfig.resolve.extensions = [".web.js", ...webpackConfig.resolve.extensions];

            if (process.env.DISABLE_JSON_MINIMIZER !== "1") {
                try {
                    const JsonMinimizerPlugin = require("json-minimizer-webpack-plugin");
                    webpackConfig.optimization.minimizer.push(new JsonMinimizerPlugin());
                } catch (error) {
                    console.warn("Skipping json minimizer:", error.message);
                }
            }

            return webpackConfig;
        },
        plugins: [new ThreadsPlugin()],
    },
    devServer: {
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
        client: {
            overlay: {
                errors: true,
                warnings: false,
                runtimeErrors: (error) => {
                    if (error instanceof DOMException && error.name === "AbortError") {
                        return false;
                    }
                    return true;
                },
            },
        },
        setupMiddlewares: (middlewares, devServer) => {
            if (!devServer) {
                throw new Error("webpack-dev-server is not defined");
            }

            devServer.app.use("/caches", express.static("caches"));

            return middlewares;
        },
    },
};
