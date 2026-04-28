import { Enemy, LumbridgeTdState } from "./lumbridgeTd";

export type LumbridgeTdLocalSpeaker = {
    id: string;
    npcId: number;
    name: string;
    tileX: number;
    tileY: number;
    level: number;
    wanderRadius: number;
};

export type LumbridgeTdCommentaryEvent =
    | "waveStart"
    | "towerBuilt"
    | "towerUpgraded"
    | "enemyLeak"
    | "pressure"
    | "kill"
    | "waveClear"
    | "idle";

type CommentaryLine = {
    speakerId: string;
    text: string;
};

export const LUMBRIDGE_TD_LOCAL_SPEAKERS: LumbridgeTdLocalSpeaker[] = [
    {
        id: "gate-guard",
        npcId: 6709,
        name: "Guard",
        tileX: 28,
        tileY: 11,
        level: 0,
        wanderRadius: 3,
    },
    {
        id: "cook",
        npcId: 4626,
        name: "Cook",
        tileX: 28,
        tileY: 18,
        level: 0,
        wanderRadius: 2,
    },
    {
        id: "guide",
        npcId: 306,
        name: "Lumbridge Guide",
        tileX: 38,
        tileY: 20,
        level: 0,
        wanderRadius: 4,
    },
];

const LOCAL_COMMENTARY: Record<LumbridgeTdCommentaryEvent, CommentaryLine[]> = {
    waveStart: [
        { speakerId: "gate-guard", text: "Shields up! They're coming!" },
        { speakerId: "gate-guard", text: "Hold the road! Don't give them an inch!" },
        { speakerId: "guide", text: "Stay calm. Aim for the front rank." },
        { speakerId: "cook", text: "Oh dear, not again." },
    ],
    towerBuilt: [
        { speakerId: "gate-guard", text: "Good. That lane is covered." },
        { speakerId: "guide", text: "Nice placement. Keep the gaps closed." },
        { speakerId: "cook", text: "That's sturdier than my kitchen table." },
    ],
    towerUpgraded: [
        { speakerId: "gate-guard", text: "That's more like it!" },
        { speakerId: "guide", text: "Stronger defenses. Excellent." },
        { speakerId: "cook", text: "Now that's proper craftsmanship." },
    ],
    enemyLeak: [
        { speakerId: "gate-guard", text: "One got through!" },
        { speakerId: "guide", text: "They breached the line!" },
        { speakerId: "cook", text: "Mind the civilians!" },
    ],
    pressure: [
        { speakerId: "gate-guard", text: "They're at the gate!" },
        { speakerId: "guide", text: "Focus fire on the lead monsters!" },
        { speakerId: "cook", text: "Too close. Far too close." },
    ],
    kill: [
        { speakerId: "gate-guard", text: "That's one down!" },
        { speakerId: "guide", text: "Good hit. Keep firing." },
        { speakerId: "cook", text: "That should slow them down." },
    ],
    waveClear: [
        { speakerId: "gate-guard", text: "Road's clear. For now." },
        { speakerId: "guide", text: "Well defended. Prepare for the next wave." },
        { speakerId: "cook", text: "Marvelous. I can breathe again." },
    ],
    idle: [
        { speakerId: "gate-guard", text: "Eyes on the road." },
        { speakerId: "guide", text: "Remember: thin their front line first." },
        { speakerId: "cook", text: "I've seen worse. I think." },
    ],
};

const ENEMY_CHATTER: Record<string, string[]> = {
    Imp: ["Catch us if you can!", "Tiny horns, big trouble!", "Hehehe!"],
    Spider: ["Skitter skitter.", "Fresh webs for Lumbridge.", "Closer. Closer."],
    "Hill Giant": ["Smash the town!", "Big boots, bigger trouble!", "Out of the way!"],
    "Moss Giant": ["Lumbridge falls today.", "The walls won't hold.", "We keep marching."],
    Demon: ["Burn it all.", "Your defenses are nothing.", "This town is ours."],
    "Black dragon": ["Ashes and ruin.", "I smell smoke already.", "Kneel before dragonfire."],
};

function pickRandom<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) {
        return undefined;
    }

    return items[Math.floor(Math.random() * items.length)];
}

export function getLocalSpeakerById(speakerId: string): LumbridgeTdLocalSpeaker | undefined {
    return LUMBRIDGE_TD_LOCAL_SPEAKERS.find((speaker) => speaker.id === speakerId);
}

export function pickEnemyAmbientLine(enemy: Pick<Enemy, "archetype">): string | undefined {
    return pickRandom(
        ENEMY_CHATTER[enemy.archetype.name] ?? ["Forward!", "Charge!", "Keep moving!"],
    );
}

export function pickLocalCommentary(
    event: LumbridgeTdCommentaryEvent,
): { speaker: LumbridgeTdLocalSpeaker; text: string } | undefined {
    const line = pickRandom(LOCAL_COMMENTARY[event]);
    if (!line) {
        return undefined;
    }

    const speaker = getLocalSpeakerById(line.speakerId);
    if (!speaker) {
        return undefined;
    }

    return {
        speaker,
        text: line.text,
    };
}

export function getFurthestEnemyProgress(state: Pick<LumbridgeTdState, "enemies">): number {
    return state.enemies.reduce((furthest, enemy) => Math.max(furthest, enemy.progress), 0);
}
