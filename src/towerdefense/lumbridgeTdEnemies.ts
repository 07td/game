export type LumbridgeTdEnemyArchetype = {
    name: string;
    npcId: number;
    color: string;
    outline: string;
    hp: number;
    speed: number;
    reward: number;
    barricadeAttackSeqId?: number;
};

export const LUMBRIDGE_TD_ENEMY_ARCHETYPES: LumbridgeTdEnemyArchetype[] = [
    {
        name: "Black dragon",
        npcId: 253,
        color: "#84c45e",
        outline: "#355f23",
        hp: 38,
        speed: 0.056,
        reward: 7,
        barricadeAttackSeqId: 80,
    },
    {
        name: "Imp",
        npcId: 5007,
        color: "#e36060",
        outline: "#5e2020",
        hp: 55,
        speed: 0.068,
        reward: 9,
        barricadeAttackSeqId: 169,
    },
    {
        name: "Spider",
        npcId: 4561,
        color: "#9c8f80",
        outline: "#3d2e22",
        hp: 90,
        speed: 0.05,
        reward: 14,
        barricadeAttackSeqId: 6249,
    },
    {
        name: "Hill Giant",
        npcId: 2103,
        color: "#b6b25f",
        outline: "#58551b",
        hp: 150,
        speed: 0.044,
        reward: 22,
        barricadeAttackSeqId: 4652,
    },
    {
        name: "Moss Giant",
        npcId: 8736,
        color: "#6ec570",
        outline: "#1d5a2e",
        hp: 220,
        speed: 0.04,
        reward: 30,
        barricadeAttackSeqId: 4658,
    },
    {
        name: "Demon",
        npcId: 2005,
        color: "#a86af5",
        outline: "#45236d",
        hp: 330,
        speed: 0.043,
        reward: 45,
        barricadeAttackSeqId: 64,
    },
];
