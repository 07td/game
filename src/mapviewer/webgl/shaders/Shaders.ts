import { ProgramSource, prependDefines } from "./ShaderUtil";
import frameFxaaFragShader from "./frame-fxaa.frag.glsl";
import frameFxaaVertShader from "./frame-fxaa.vert.glsl";
import frameFragShader from "./frame.frag.glsl";
import frameVertShader from "./frame.vert.glsl";
import mainFragShader from "./main.frag.glsl";
import mainVertShader from "./main.vert.glsl";
import npcVertShader from "./npc.vert.glsl";

export function createProgram(
    vertShader: string,
    fragShader: string,
    hasMultiDraw: boolean,
    discardAlpha: boolean,
): ProgramSource {
    const defines: string[] = [];
    if (hasMultiDraw) {
        defines.push("MULTI_DRAW");
    }
    if (discardAlpha) {
        defines.push("DISCARD_ALPHA");
    }
    return [prependDefines(vertShader, defines), prependDefines(fragShader, defines)];
}

export function createMainProgram(hasMultiDraw: boolean, discardAlpha: boolean): ProgramSource {
    return createProgram(mainVertShader, mainFragShader, hasMultiDraw, discardAlpha);
}

export function createNpcProgram(hasMultiDraw: boolean, discardAlpha: boolean): ProgramSource {
    return createProgram(npcVertShader, mainFragShader, hasMultiDraw, discardAlpha);
}

export const TD_ROUTE_PROGRAM: ProgramSource = [
    `#version 300 es
layout(std140) uniform SceneUniforms {
    mat4 u_viewProjMatrix;
    mat4 u_viewMatrix;
    mat4 u_projectionMatrix;
    vec4 u_skyColor;
    vec2 u_cameraPos;
    float u_renderDistance;
    float u_fogDepth;
    float u_currentTime;
    float u_brightness;
    float u_colorBanding;
    float u_isNewTextureAnim;
};

layout(location=0) in vec3 a_position;

void main() {
    gl_Position = u_projectionMatrix * u_viewMatrix * vec4(a_position, 1.0);
}`,
    `#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 fragColor;

    void main() {
        fragColor = u_color;
    }`,
];

export const FRAME_PROGRAM = [frameVertShader, frameFragShader];
export const FRAME_FXAA_PROGRAM = [frameFxaaVertShader, frameFxaaFragShader];
