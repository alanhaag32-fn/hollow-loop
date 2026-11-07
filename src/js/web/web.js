// The ascension web: nodes and what they do, buying and refunding, and the web window with its gestures.
import { abyssOpen, renderAbyss } from "../abyss/abyss.js";
import { sfx } from "../audio/sound.js";
import { alive, hit } from "../combat/combat.js";
import { cds } from "../skills/skills.js";
import { lumenAt } from "../core/curves.js";
import { addGold } from "../progress/currency.js";
import { S } from "../core/save.js";
import { ST, cutBy, plus, statSource } from "../core/stats.js";
import { $, fmt, starPts } from "../core/util.js";
import { burst, novaFx } from "../fx/effects.js";
import { reduce } from "../fx/gfx.js";
import { hero } from "../hero/hero.js";
import { throwBlade, wDelay } from "../hero/orbitals.js";
import { fightStage } from "../modes/modes.js";
import { ascGain, ascMin, doAscend, runStart, startStage } from "../progress/ascend.js";
import { renderTrans, transOpen } from "../progress/transcend.js";
import { buildSkillbar } from "../skills/skills.js";
import { action, confirmTap, markDirty, panel } from "../ui/actions.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";
import { refreshPanel, tab } from "../ui/windows.js";
import { view } from "../world/scene.js";

const BR_COL = { core: "var(--ink)", edge: "var(--c3)", ward: "var(--c1)", drive: "var(--c2)", fortune: "var(--c4)", bridge: "var(--hero)" };
const BR_NAME = { core: "Core", edge: "Edge", ward: "Ward", drive: "Drive", fortune: "Fortune", bridge: "Bridge" };
// Second Wind and Undying are one revive on one cooldown; Undying makes it stronger.
const SECOND_WIND = {
  order: -1, cd: 0,
  tick(c) { if (this.cd > 0) this.cd -= c.dt; },
  revive(c) {
    if (c.done || this.cd > 0) return;
    const u = T("k2"); hero.hp = ST.maxHp * (u ? .6 : .3); this.cd = u ? 30 : 60; c.done = true;
    log("Second wind", "good"); burst(view.HERO_X, view.HERO_Y, "#7be0d0", 8);
  }
};
export const TREE = [
  { id: "core", br: "core", x: 0, y: 0, s: "Core", name: "The Core", max: 1, c: 0, desc: "Your starting point. Every path grows outward from here." },
  { id: "e1", br: "edge", x: 0, y: -70, s: "Sharpen", name: "Sharpened Light", max: 20, c: 1, desc: "x1.10 attack per rank, compounding", stats: n => ({ atk: Math.pow(1.1, n) }) },
  { id: "e2", br: "edge", x: -45, y: -130, s: "Keen", name: "Keen Mind", max: 10, c: 2, desc: "+2% crit chance per rank", stats: n => ({ crit: plus(.02 * n) }) },
  { id: "e4", br: "edge", x: 45, y: -130, s: "Hand", name: "Hand of Light", max: 10, c: 1, desc: "+25% tap damage per rank", stats: n => ({ tap: 1 + .25 * n }) },
  { id: "e3", br: "edge", x: -75, y: -190, s: "Cruelty", name: "Cruelty", max: 10, c: 2, desc: "+15% crit damage per rank", stats: n => ({ critDmg: 1 + .15 * n }) },
  { id: "e9", br: "edge", x: 0, y: -185, s: "Thirst", name: "Bloodthirst", max: 10, c: 2, desc: "+0.5% life steal per rank", stats: n => ({ leech: plus(.005 * n) }) },
  { id: "e5", br: "edge", x: 75, y: -190, s: "Echo tap", name: "Echoing Tap", max: 10, c: 2, desc: "+5% chance per rank for taps to strike twice", fx: { tap: (c, n) => { if (Math.random() < .05 * n) hit(c.base, 140, "tap"); } } },
  { id: "e6", br: "edge", x: -60, y: -250, s: "Execute", name: "Execute", max: 5, c: 3, desc: "+10% damage per rank to enemies under 30% health", fx: { deal: (h, n) => { if (h.e.hp / h.e.max < .3) h.dmg *= 1 + .1 * n; } } },
  { id: "e7", br: "edge", x: 60, y: -250, s: "Slayer", name: "Giant Slayer", max: 10, c: 3, desc: "+10% damage per rank to bosses", stats: n => ({ bossDmg: 1 + .1 * n }) },
  { id: "e8", br: "edge", x: 0, y: -290, s: "Supernova", name: "Supernova", max: 1, c: 15, cap: true, desc: "Nova strikes twice", fx: { cast: c => { if (c.id === "nova") setTimeout(() => { if (alive()) { novaFx(); hit(c.dmg, 220, "nova"); } }, 350); } } },
  { id: "w1", br: "ward", x: 70, y: 0, s: "Vital", name: "Vital Core", max: 20, c: 1, desc: "x1.10 health per rank, compounding", stats: n => ({ maxHp: Math.pow(1.1, n) }) },
  { id: "w2", br: "ward", x: 130, y: -45, s: "Spring", name: "Mana Spring", max: 10, c: 2, desc: "+10% max mana and mana regen per rank", stats: n => ({ maxMp: 1 + .1 * n, mpRegen: 1 + .1 * n }) },
  { id: "w3", br: "ward", x: 130, y: 45, s: "Thick", name: "Thick Shell", max: 10, c: 2, desc: "-3% damage taken per rank", stats: n => ({ dmgTaken: cutBy("armor", .03 * n) }) },
  { id: "w4", br: "ward", x: 190, y: -75, s: "Leech", name: "Leech Lord", max: 10, c: 2, desc: "+0.5% life steal per rank", stats: n => ({ leech: plus(.005 * n) }) },
  { id: "w9", br: "ward", x: 190, y: 0, s: "Guarded", name: "Guarded", max: 10, c: 2, desc: "+2% block chance per rank", stats: n => ({ block: plus(.02 * n) }) },
  { id: "w10", br: "ward", x: 190, y: 75, s: "Phase", name: "Phase Step", max: 10, c: 2, desc: "+10% evasion rating per rank", stats: n => ({ evaR: 1 + .1 * n }) },
  { id: "w6", br: "ward", x: 250, y: -60, s: "2nd wind", name: "Second Wind", max: 1, c: 8, desc: "Survive a fatal hit with 30% health, once a minute", fx: SECOND_WIND },
  { id: "w7", br: "ward", x: 240, y: 0, s: "Barrier+", name: "Barrier Mastery", max: 5, c: 3, desc: "+20% Barrier strength per rank", stats: n => ({ aegis: 1 + .2 * n }) },
  { id: "w5", br: "ward", x: 250, y: 60, s: "Resolve", name: "Resilience", max: 5, c: 3, desc: "Boss crush attacks deal 8% less per rank", stats: n => ({ crushTaken: 1 - .08 * n }) },
  { id: "w8", br: "ward", x: 292, y: 0, s: "Last light", name: "Last Light", max: 1, c: 15, cap: true, desc: "+50% damage while under 30% health", fx: { deal: h => { if (hero.hp < ST.maxHp * .3) h.dmg *= 1.5; } } },
  { id: "d1", br: "drive", x: 0, y: 70, s: "Momentum", name: "Momentum", max: 15, c: 1, desc: "+4% attack speed per rank", stats: n => ({ spd: 1 + .04 * n }) },
  { id: "d2", br: "drive", x: -45, y: 130, s: "Quick", name: "Quick Cast", max: 10, c: 2, desc: "-5% skill cooldowns per rank", stats: n => ({ cdr: 1 - .05 * n }) },
  { id: "d4", br: "drive", x: 45, y: 130, s: "Overflow", name: "Overflow", max: 5, c: 2, desc: "+1s Surge duration per rank", stats: n => ({ surgeTime: plus(n) }) },
  { id: "d3", br: "drive", x: -75, y: 190, s: "Efficient", name: "Efficiency", max: 10, c: 2, desc: "-5% skill mana cost per rank", stats: n => ({ costMult: cutBy("skill", .05 * n) }) },
  { id: "d9", br: "drive", x: 0, y: 185, s: "Deep mana", name: "Deep Mana", max: 10, c: 2, desc: "+10% max mana per rank", stats: n => ({ maxMp: 1 + .1 * n }) },
  { id: "d6", br: "drive", x: 75, y: 190, s: "Chain", name: "Chain Blades", max: 10, c: 3, desc: "+4% chance per rank for attacks to hit twice", fx: { attack: (c, n) => { if (Math.random() < .04 * n) setTimeout(() => { if (alive()) { throwBlade(false, 1); hit(ST.atk, wDelay(), "blade"); } }, 120); } } },
  { id: "d5", br: "drive", x: -60, y: 250, s: "Amplify", name: "Amplify", max: 10, c: 3, desc: "+8% skill power per rank", stats: n => ({ skillPow: 1 + .08 * n }) },
  { id: "d7", br: "drive", x: 60, y: 250, s: "Time fold", name: "Time Fold", max: 5, c: 3, desc: "+3s on boss timers per rank", stats: n => ({ bossTime: plus(3 * n) }) },
  { id: "d8", br: "drive", x: 0, y: 290, s: "Eternal", name: "Storm Eternal", max: 1, c: 15, cap: true, desc: "Storm throws 3 more blades", stats: n => ({ stormBlades: plus(3) }) },
  { id: "f1", br: "fortune", x: -70, y: 0, s: "Greed", name: "Greed", max: 20, c: 1, desc: "x1.10 lumen per rank, compounding", stats: n => ({ gold: Math.pow(1.1, n) }) },
  { id: "f2", br: "fortune", x: -130, y: -45, s: "Scavenge", name: "Scavenger", max: 10, c: 2, desc: "+5% loot drop chance per rank", stats: n => ({ drop: 1 + .05 * n }) },
  { id: "f4", br: "fortune", x: -130, y: 45, s: "Salvager", name: "Salvager", max: 10, c: 1, desc: "+20% salvage lumen per rank", stats: n => ({ salv: plus(.2 * n) }) },
  { id: "f3", br: "fortune", x: -190, y: -75, s: "Lucky", name: "Lucky Star", max: 10, c: 2, desc: "+10% chance per rank for Rare or better", stats: n => ({ luck: plus(.1 * n) }) },
  { id: "f9", br: "fortune", x: -190, y: 0, s: "Trophy", name: "Trophy Hunter", max: 10, c: 2, desc: "+10% lumen from elites and bosses per rank", stats: n => ({ bigGold: plus(.1 * n) }) },
  { id: "f6", br: "fortune", x: -190, y: 75, s: "Bounty", name: "Bounty Hunter", max: 10, c: 2, desc: "+20% bounty lumen per rank", stats: n => ({ bountyGold: 1 + .2 * n }) },
  { id: "f5", br: "fortune", x: -250, y: -60, s: "Set seek", name: "Set Seeker", max: 5, c: 3, desc: "+10% set item chance per rank", stats: n => ({ setChance: 1 + .1 * n }) },
  { id: "f7", br: "fortune", x: -250, y: 60, s: "Head start", name: "Head Start", max: 5, c: 3, desc: "Start each ascension 5 stages further per rank", stats: n => ({ startStage: plus(5 * n) }) },
  { id: "f8", br: "fortune", x: -292, y: 0, s: "Echoes", name: "Echo Chamber", max: 1, c: 15, cap: true, desc: "+25% echoes from ascending", stats: n => ({ echoGain: 1.25 }) },
  { id: "b1", br: "bridge", x: 100, y: -100, s: "Bladeward", name: "Bladeward", max: 10, c: 2, desc: "+5% attack and +5% health per rank", stats: n => ({ atk: 1 + .05 * n, maxHp: 1 + .05 * n }) },
  { id: "b2", br: "bridge", x: 100, y: 100, s: "Steady", name: "Steady Pulse", max: 10, c: 2, desc: "+10% health regen per rank", stats: n => ({ hpRegen: 1 + .1 * n }) },
  { id: "b3", br: "bridge", x: -100, y: 100, s: "Tinker", name: "Tinker", max: 10, c: 2, desc: "+4% skill power and +10% salvage lumen per rank", stats: n => ({ skillPow: 1 + .04 * n, salv: plus(.1 * n) }) },
  { id: "b4", br: "bridge", x: -100, y: -100, s: "Lucky hits", name: "Lucky Strikes", max: 10, c: 2, desc: "+1% crit chance and +3% drop chance per rank", stats: n => ({ crit: plus(.01 * n), drop: 1 + .03 * n }) },
  { id: "o1", br: "bridge", x: 150, y: -150, s: "Predator", name: "Predator", max: 5, c: 3, desc: "+10% damage to elites per rank", stats: n => ({ eliteDmg: 1 + .1 * n }) },
  { id: "o2", br: "bridge", x: 150, y: 150, s: "Ghost", name: "Ghost Step", max: 10, c: 2, desc: "+8% evasion rating and +2% attack speed per rank", stats: n => ({ evaR: 1 + .08 * n, spd: 1 + .02 * n }) },
  { id: "o3", br: "bridge", x: -150, y: 150, s: "Clockwork", name: "Clockwork", max: 10, c: 2, desc: "-3% skill mana cost and +3% lumen per rank", stats: n => ({ costMult: cutBy("skill", .03 * n), gold: 1 + .03 * n }) },
  { id: "o4", br: "bridge", x: -150, y: -150, s: "Jackpot", name: "Jackpot", max: 10, c: 2, desc: "+5% crit damage and +5% rarity luck per rank", stats: n => ({ critDmg: 1 + .05 * n, luck: plus(.05 * n) }) },
  { id: "e11", br: "edge", x: -110, y: -320, s: "Nova+", name: "Nova Attunement", max: 3, c: 4, att: "nova", desc: "Nova starts each run 3 levels higher per rank" },
  { id: "e12", br: "edge", x: 110, y: -320, s: "Storm+", name: "Storm Attunement", max: 3, c: 4, att: "storm", desc: "Rank 1 unlocks Storm from stage 1. Each rank after starts it 3 levels higher" },
  { id: "e10", br: "edge", x: -60, y: -350, s: "Precision", name: "Precision Core", max: 10, c: 3, desc: "+1% crit chance and +10% crit damage per rank", stats: n => ({ crit: plus(.01 * n), critDmg: 1 + .1 * n }) },
  { id: "e13", br: "edge", x: 60, y: -350, s: "Opener", name: "Opening Strike", max: 5, c: 3, desc: "+50% damage per rank on your first hit against each enemy", fx: { deal: (h, n) => { if (h.first) h.dmg *= 1 + .5 * n; } } },
  { id: "k1", br: "edge", x: 0, y: -392, s: "Avatar", name: "Avatar of Light", max: 1, c: 25, cap: true, key: true, desc: "Keystone. Every 5th tap also fires your orbital for full attack damage", fx: { tap: c => { if (c.count % 5 === 0) { throwBlade(false, 1); hit(ST.atk, wDelay(), "blade"); } } } },
  { id: "w11", br: "ward", x: 320, y: -110, s: "Barrier+", name: "Barrier Attunement", max: 3, c: 4, att: "barrier", desc: "Rank 1 unlocks Barrier from stage 1. Each rank after starts it 3 levels higher" },
  { id: "w12", br: "ward", x: 320, y: 110, s: "Dash+", name: "Dash Attunement", max: 3, c: 4, att: "dash", desc: "Rank 1 unlocks Dash from stage 1. Each rank after starts it 3 levels higher" },
  { id: "w13", br: "ward", x: 350, y: -60, s: "Thorns", name: "Thorns", max: 10, c: 2, desc: "Reflect 10% of damage taken back at the attacker per rank", stats: n => ({ thorn: plus(.1 * n) }) },
  { id: "w14", br: "ward", x: 350, y: 60, s: "Fortress", name: "Fortress", max: 10, c: 2, desc: "+1% block chance and +3% health per rank", stats: n => ({ block: plus(.01 * n), maxHp: 1 + .03 * n }) },
  { id: "k2", br: "ward", x: 392, y: 0, s: "Undying", name: "Undying", max: 1, c: 25, cap: true, key: true, desc: "Keystone. Survive a fatal hit every 30s, returning with 60% health", fx: SECOND_WIND },
  { id: "d10", br: "drive", x: 110, y: 320, s: "Surge+", name: "Surge Attunement", max: 3, c: 4, att: "overdrive", desc: "Rank 1 unlocks Surge from stage 1. Each rank after starts it 3 levels higher" },
  { id: "d11", br: "drive", x: -110, y: 320, s: "Shatter+", name: "Shatter Attunement", max: 3, c: 6, att: "shatter", desc: "Rank 1 unlocks Shatter from stage 1. Each rank after starts it 3 levels higher" },
  { id: "d12", br: "drive", x: 60, y: 350, s: "Font", name: "Mana Font", max: 10, c: 2, desc: "+15% mana regen per rank", stats: n => ({ mpRegen: 1 + .15 * n }) },
  { id: "d13", br: "drive", x: -60, y: 350, s: "Echo cast", name: "Echo Cast", max: 5, c: 4, desc: "+4% chance per rank for a skill's cooldown to reset instantly", fx: { cast: (c, n) => { if (Math.random() < .04 * n) { cds[c.id] = 0; floatText("Echo cast", "info", "hero"); } } } },
  { id: "k3", br: "drive", x: 0, y: 392, s: "Perpetual", name: "Perpetual Motion", max: 1, c: 25, cap: true, key: true, desc: "Keystone. Casting a skill takes 1s off every other skill's cooldown", fx: { cast: c => { for (const k in cds) if (k !== c.id && cds[k] > 0) cds[k] = Math.max(0, cds[k] - 1); } } },
  { id: "f10", br: "fortune", x: -320, y: -110, s: "Golden", name: "Golden Touch", max: 10, c: 2, desc: "2% chance per rank for a tap to shake loose lumen", fx: { tap: (c, n) => { if (Math.random() < .02 * n) { const g = Math.ceil(lumenAt(fightStage()) / 2 * ST.gold); addGold(g, true); floatText("+" + fmt(g) + " lumen", "gold", "enemy"); } } } },
  { id: "f12", br: "fortune", x: -320, y: 110, s: "Spoils", name: "Elite Spoils", max: 5, c: 3, desc: "+15% chance per rank for elites to drop a second item", stats: n => ({ eliteSpoils: plus(.15 * n) }) },
  { id: "f11", br: "fortune", x: -350, y: -60, s: "Extra pin", name: "Extra Pin", max: 1, c: 10, desc: "Adds a fourth pin to the bounty board", stats: n => ({ bountySlots: plus(1) }) },
  { id: "f13", br: "fortune", x: -350, y: 60, s: "Swift", name: "Swift Postings", max: 5, c: 3, desc: "New bounties arrive 10% sooner per rank", stats: n => ({ postTime: 1 - .1 * n }) },
  { id: "k4", br: "fortune", x: -392, y: 0, s: "Midas", name: "Midas", max: 1, c: 25, cap: true, key: true, desc: "Keystone. Bosses have a 25% chance to drop an echo", fx: { kill: c => { if (c.e.boss && Math.random() < .25) { S.echoes++; S.echoesTotal++; markDirty("tree"); log("Midas: the boss left an echo", "r4"); } } } },
  { id: "x1", br: "bridge", x: 228, y: -228, s: "Juggernaut", name: "Juggernaut", max: 10, c: 3, desc: "+6% damage per rank while above 80% health", fx: { deal: (h, n) => { if (hero.hp > ST.maxHp * .8) h.dmg *= 1 + .06 * n; } } },
  { id: "x2", br: "bridge", x: 228, y: 228, s: "Arcane", name: "Arcane Shell", max: 5, c: 3, desc: "Barrier also restores 8% mana per rank", fx: { cast: (c, n) => { if (c.id === "barrier") hero.mp = Math.min(ST.maxMp, hero.mp + ST.maxMp * .08 * n); } } },
  { id: "x3", br: "bridge", x: -228, y: 228, s: "Fingers", name: "Quick Fingers", max: 10, c: 2, desc: "+10% tap damage and +2% attack speed per rank", stats: n => ({ tap: 1 + .1 * n, spd: 1 + .02 * n }) },
  { id: "x4", br: "bridge", x: -228, y: -228, s: "Bounty blade", name: "Bounty Blades", max: 5, c: 4, desc: "+0.5% attack per rank for every bounty you've completed, up to +50%", stats: n => ({ atk: 1 + Math.min(.5, .005 * n * S.bountyDone) }) }
];
const NODE = {};
statSource(give => TREE.forEach(n => { const r = T(n.id); if (r) give(n, r); }));
 TREE.forEach(n => NODE[n.id] = n);
const EDGES = [
  ["core", "e1"], ["core", "w1"], ["core", "d1"], ["core", "f1"],
  ["e1", "e2"], ["e1", "e4"], ["e2", "e3"], ["e4", "e5"], ["e2", "e9"], ["e4", "e9"], ["e3", "e6"], ["e5", "e7"], ["e6", "e8"], ["e7", "e8"], ["e9", "e8"],
  ["w1", "w2"], ["w1", "w3"], ["w2", "w4"], ["w3", "w10"], ["w2", "w9"], ["w3", "w9"], ["w4", "w6"], ["w10", "w5"], ["w9", "w7"], ["w6", "w8"], ["w5", "w8"], ["w7", "w8"],
  ["d1", "d2"], ["d1", "d4"], ["d2", "d3"], ["d4", "d6"], ["d2", "d9"], ["d4", "d9"], ["d3", "d5"], ["d6", "d7"], ["d5", "d8"], ["d7", "d8"], ["d9", "d8"],
  ["f1", "f2"], ["f1", "f4"], ["f2", "f3"], ["f4", "f6"], ["f2", "f9"], ["f4", "f9"], ["f3", "f5"], ["f6", "f7"], ["f5", "f8"], ["f7", "f8"], ["f9", "f8"],
  ["e4", "b1"], ["w2", "b1"], ["w3", "b2"], ["d4", "b2"], ["d2", "b3"], ["f4", "b3"], ["f2", "b4"], ["e2", "b4"],
  ["e5", "o1"], ["w4", "o1"], ["w10", "o2"], ["d6", "o2"], ["d3", "o3"], ["f6", "o3"], ["f3", "o4"], ["e3", "o4"],
  ["e6", "e11"], ["e7", "e12"], ["e6", "e10"], ["e11", "e10"], ["e7", "e13"], ["e12", "e13"], ["e10", "k1"], ["e13", "k1"], ["e8", "k1"],
  ["w6", "w11"], ["w5", "w12"], ["w6", "w13"], ["w11", "w13"], ["w5", "w14"], ["w12", "w14"], ["w13", "k2"], ["w14", "k2"], ["w8", "k2"],
  ["d7", "d10"], ["d5", "d11"], ["d7", "d12"], ["d10", "d12"], ["d5", "d13"], ["d11", "d13"], ["d12", "k3"], ["d13", "k3"], ["d8", "k3"],
  ["f5", "f10"], ["f7", "f12"], ["f5", "f11"], ["f10", "f11"], ["f7", "f13"], ["f12", "f13"], ["f11", "k4"], ["f13", "k4"], ["f8", "k4"],
  ["e12", "x1"], ["w11", "x1"], ["o1", "x1"], ["w12", "x2"], ["d10", "x2"], ["o2", "x2"], ["d11", "x3"], ["f12", "x3"], ["o3", "x3"], ["f10", "x4"], ["e11", "x4"], ["o4", "x4"]
];
const NEIGH = {};
 TREE.forEach(n => NEIGH[n.id] = []);
EDGES.forEach(([a, b]) => { NEIGH[a].push(b); NEIGH[b].push(a); });
export const T = id => id === "core" ? 1 : (S.tree[id] || 0);
let treeSel = null;
const nodeCost = n => n.c * ((S.tree[n.id] || 0) + 1);
const owned = n => T(n.id) > 0;
const avail = n => n.id === "core" || NEIGH[n.id].some(id => T(id) > 0);
const nodeR = n => n.key ? 20 : n.cap ? 17 : n.id === "core" ? 16 : n.br === "bridge" ? 12 : n.c >= 2 ? 13 : 11;
function renderTree() {
  $("transBody").innerHTML = renderTrans();
  $("abyssBody").innerHTML = renderAbyss();
  const g = ascGain(), can = S.maxStage >= ascMin() && g >= 1;
  $("ascTop").innerHTML = '<div class="ascTop"><div><b>' + S.echoes + ' echoes</b> to spend. Every node must connect to one you own.</div>' +
    '<div class="note" style="margin:0"><b style="color:#b48cff">Echo power +' + fmt(Math.round(ST.echoBonus * 100)) + '%</b> attack and health, from ' + fmt(S.echoesTotal || 0) + " echoes earned in total (+1% each, never capped).</div>" +
    '<div class="note" style="margin:0">' + (can ? "Ascend to gain " + g + " echoes" + (runStart() > 1 ? " (only stages past " + runStart() + ", where this run began, count)" : "") + ". You restart at stage " + startStage() + " and lose lumen, gear, training and skill levels. The web and bounties stay. Skills relock and return as you reach their stages again. Each ascension also gives enemies more modifiers and you +5% echoes."
      : "Reach stage " + ascMin() + " to ascend" + (ascMin() > 20 ? " (10 stages past where this run began)" : "") + ". Highest this run: stage " + S.maxStage + ".") + "</div>" +
    '<div class="ctrls" style="margin:0"><button class="btn go' + (can ? "" : " dim") + '" data-act="ascend">' + "Ascend" + '</button><button class="btn" data-act="refund">Refund web</button></div></div>';
  let h = "";
  EDGES.forEach(([a, b]) => {
    const A = NODE[a], B = NODE[b], oa = owned(A), ob = owned(B);
    const colN = A.br === "core" ? B : A;
    const st = oa && ob ? "stroke:" + BR_COL[colN.br] + ";stroke-width:3.5" : (oa || ob) ? "stroke:var(--muted);stroke-width:2;opacity:.75" : "stroke:var(--line);stroke-width:1.5;stroke-dasharray:4 4";
    h += '<line x1="' + A.x + '" y1="' + A.y + '" x2="' + B.x + '" y2="' + B.y + '" style="' + st + '"/>';
  });
  TREE.forEach(n => {
    const r = nodeR(n), own = owned(n), av = avail(n), c = BR_COL[n.br], rank = T(n.id);
    h += '<g class="nd" data-node="' + n.id + '" transform="translate(' + n.x + " " + n.y + ')">';
    h += '<circle r="' + (r + 10) + '" style="fill:transparent"/><circle r="' + r + '" style="fill:var(--panel)"/>';
    if (treeSel === n.id) h += '<circle r="' + (r + 6) + '" style="fill:none;stroke:var(--ink);stroke-width:2;stroke-dasharray:3 3"/>';
    h += '<circle r="' + r + '" style="fill:' + (own || av ? c : "var(--panel)") + ";fill-opacity:" + (own ? 1 : av ? .22 : 1) + ";stroke:" + (own || av ? c : "var(--line)") + ";stroke-width:" + (n.cap ? 4 : 2.5) + ";opacity:" + (own || av ? 1 : .5) + '"/>';
    if (n.cap) h += '<circle r="' + (r - 6) + '" style="fill:none;stroke:' + (own ? "var(--panel)" : c) + ';stroke-width:1.5;opacity:' + (own || av ? 1 : .5) + '"/>';
    if (n.key) h += '<polygon points="' + starPts(4, 8, 3) + '" style="fill:' + (own ? "var(--panel)" : c) + ';opacity:' + (own || av ? 1 : .5) + '"/>';
    if (n.max > 1 && (own || av)) {
      // the dark band under the notches lets them read against any branch color
      const R = r + 5, C = 2 * Math.PI * R, seg = C / n.max, gap = Math.min(2.4, seg * .32), done = rank >= n.max;
      h += '<circle r="' + R + '" style="fill:none;stroke:#0d0b16;stroke-width:5.5"/>';
      h += '<circle r="' + R + '" transform="rotate(-90)" style="fill:none;stroke:#ffffff;stroke-opacity:.2;stroke-width:3;stroke-dasharray:' + (seg - gap).toFixed(2) + " " + gap.toFixed(2) + '"/>';
      if (rank > 0) h += '<circle r="' + R + '" transform="rotate(-90)" style="fill:none;stroke:' + (done ? "#ffd04d" : "#ffffff") + ';stroke-width:3;stroke-dasharray:' + Array.from({ length: rank }, () => (seg - gap).toFixed(2) + " " + gap.toFixed(2)).join(" ") + " 0 " + C.toFixed(1) + '"/>';
    }
    // dark disc so the rank number reads on every branch color
    if (own && n.max > 1) h += '<circle r="' + Math.min(9, r * .62).toFixed(1) + '" style="fill:#0d0b16;fill-opacity:.82"/><text class="rkt" y="3.6" style="fill:' + (rank >= n.max ? "#ffd04d" : "#ffffff") + '">' + rank + "</text>";
    if (n.id !== "core" && av && rank < n.max && S.echoes >= nodeCost(n)) h += '<g class="upB" transform="translate(' + (r * .78).toFixed(1) + " " + (-r * .78).toFixed(1) + ')"><circle r="6.5" style="fill:#ffd04d;stroke:var(--panel);stroke-width:1.5"/><path d="M-3 0 H3 M0 -3 V3" style="stroke:#1a1430;stroke-width:1.8;stroke-linecap:round"/></g>';
    else if (own && rank < n.max && n.max > 1) h += '<circle r="2.6" cx="' + (r * .78).toFixed(1) + '" cy="' + (-r * .78).toFixed(1) + '" style="fill:' + c + ';stroke:var(--panel);stroke-width:1"/>';
    h += '<text class="lbl" y="' + (r + (n.max > 1 && (own || av) ? 18 : 12)) + '">' + n.s + "</text></g>";
  });
  $("web").innerHTML = h;
  if (!treeSel || !NODE[treeSel]) { $("nodeCard").innerHTML = ""; return; }
  const n = NODE[treeSel], r = T(n.id), maxed = r >= n.max, av = avail(n);
  let btn;
  if (n.id === "core") btn = '<button class="btn" disabled>Owned</button>';
  else if (maxed) btn = '<button class="btn" disabled>Maxed</button>';
  else btn = '<button class="btn echoc" data-act="node" data-id="' + n.id + '" data-cost="' + nodeCost(n) + '" data-cur="echo"' + (av ? "" : " disabled") + ">" + nodeCost(n) + " echo" + (nodeCost(n) > 1 ? "es" : "") + "</button>";
  $("nodeCard").innerHTML = '<div class="nodeCard" style="--bc:' + BR_COL[n.br] + '"><span class="n">' + n.name + '</span><button type="button" class="ncX" data-ncx aria-label="Close details"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button><span class="rk">' + BR_NAME[n.br] + (n.id === "core" ? "" : ", rank " + r + " of " + n.max) + '</span><span class="ef">' + n.desc + '</span><span class="st">' +
    (n.id === "core" ? "Tap a tinted node next to the Core to start a path. You have " + S.echoes + " echoes." : !av ? "Not connected yet. Learn a neighboring node first." : maxed ? "Fully learned" : S.echoes < nodeCost(n) ? "Need " + nodeCost(n) + " echoes, you have " + S.echoes + ". Earn echoes by ascending at stage 20+ or from Gold seal bounties." : owned(n) ? "Owned. Tap the button to add a rank." : "Connected and ready to learn") + "</span>" + btn + "</div>";
}
panel("tree", {
  render: renderTree,
  tabs: () => [["web", "Web"], ["asc", "Ascend"]].concat(transOpen() ? [["trans", "Transcend"]] : [], abyssOpen() ? [["abyss", "Abyss"]] : []),
  fill: sub => sub === "web" ? "web" : "",
  shown: centerWeb
});
action("node", id => {
  const n = NODE[id], c = nodeCost(n);
  if (!avail(n) || (S.tree[id] || 0) >= n.max || S.echoes < c) return false;
  sfx("chord", 0, 0); S.echoes -= c; S.tree[id] = (S.tree[id] || 0) + 1; buildSkillbar();
});
action("refund", () => {
  let back = 0;
  TREE.forEach(n => { const r = S.tree[n.id] || 0; back += n.c * r * (r + 1) / 2; });
  if (!back) return false;
  S.echoes += back; S.tree = {}; treeSel = null; buildSkillbar();
  log("Refunded " + back + " echoes", "good");
});
action("ascend", (id, b) => {
  if (S.maxStage < ascMin() || ascGain() < 1) return false;
  if (!confirmTap(b, "Tap again to ascend")) return false;
  doAscend();
});
const WEB = { cx: 0, cy: 0, z: 0, W: 300, H: 380 };
function webLimits() {
  const w = $("webWrap"); WEB.W = w.clientWidth || WEB.W; WEB.H = w.clientHeight || WEB.H;
  return { zmin: Math.min(WEB.W, WEB.H) / 880, zmax: 2.6 };
}
function webApply() {
  const L = webLimits();
  WEB.z = Math.max(L.zmin, Math.min(L.zmax, WEB.z || 1));
  const vw = WEB.W / WEB.z, vh = WEB.H / WEB.z, mx = Math.max(0, 440 - vw / 2), my = Math.max(0, 440 - vh / 2);
  const nc = $("nodeCard"), extra = nc && nc.firstChild ? (nc.offsetHeight + 12) / WEB.z : 0;
  WEB.cx = Math.max(-mx, Math.min(mx, WEB.cx)); WEB.cy = Math.max(-my, Math.min(my + extra, WEB.cy));
  $("web").setAttribute("viewBox", (WEB.cx - vw / 2).toFixed(1) + " " + (WEB.cy - vh / 2).toFixed(1) + " " + vw.toFixed(1) + " " + vh.toFixed(1));
}
function webZoomAt(f, px, py) {
  const ux = WEB.cx + (px - WEB.W / 2) / WEB.z, uy = WEB.cy + (py - WEB.H / 2) / WEB.z, L = webLimits();
  WEB.z = Math.max(L.zmin, Math.min(L.zmax, WEB.z * f));
  WEB.cx = ux - (px - WEB.W / 2) / WEB.z; WEB.cy = uy - (py - WEB.H / 2) / WEB.z;
  webApply();
}
let webTw = 0;
function webTween(z1, cx1, cy1) {
  const z0 = WEB.z, x0 = WEB.cx, y0 = WEB.cy, t0 = performance.now(), id = ++webTw;
  if (reduce) { WEB.z = z1; WEB.cx = cx1; WEB.cy = cy1; webApply(); return; }
  const tick = now => {
    if (id !== webTw) return;
    const u = Math.min(1, (now - t0) / 220), k = 1 - Math.pow(1 - u, 3);
    WEB.z = z0 * Math.pow(z1 / z0, k); WEB.cx = x0 + (cx1 - x0) * k; WEB.cy = y0 + (cy1 - y0) * k; webApply();
    if (u < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function centerWeb() {
  const L = webLimits();
  if (!WEB.z) { WEB.z = Math.max(L.zmin, Math.min(1.1, WEB.W / 520)); WEB.cx = 0; WEB.cy = 0; }
  webApply();
}

export function initWeb() {
  (function webGestures() {
    const w = $("webWrap"), pts = new Map();
    let moved = 0, pinch = null;
    const local = e => { const r = w.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    w.addEventListener("pointerdown", e => {
      if (e.target.closest(".webZoom, #nodeCard")) return;
      pts.set(e.pointerId, local(e)); webTw++;
      if (pts.size === 1) moved = 0; else pinch = null;
      w.classList.add("drag");
    });
    addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e), prev = pts.get(e.pointerId); pts.set(e.pointerId, p);
      if (pts.size === 1) {
        const dx = p[0] - prev[0], dy = p[1] - prev[1];
        moved += Math.abs(dx) + Math.abs(dy);
        WEB.cx -= dx / WEB.z; WEB.cy -= dy / WEB.z; webApply();
      } else {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (pinch) { WEB.cx -= (mx - pinch.mx) / WEB.z; WEB.cy -= (my - pinch.my) / WEB.z; webZoomAt(d / pinch.d, mx, my); }
        pinch = { d, mx, my }; moved = 99;
      }
    });
    const up = e => { if (!pts.delete(e.pointerId)) return; if (pts.size < 2) pinch = null; if (!pts.size) w.classList.remove("drag"); };
    addEventListener("pointerup", up); addEventListener("pointercancel", up);
    w.addEventListener("wheel", e => { if (e.target.closest("#nodeCard")) return; e.preventDefault(); const [px, py] = local(e); webTw++; webZoomAt(Math.exp(-e.deltaY * .0015), px, py); }, { passive: false });
    // a drag shouldn't count as tapping the node it ended on
    w.addEventListener("click", e => { if (moved > 8 && !e.target.closest(".webZoom, #nodeCard")) { e.stopPropagation(); e.preventDefault(); } }, true);
    w.querySelector(".webZoom").addEventListener("click", e => {
      const b = e.target.closest("[data-zoom]"); if (!b) return;
      const L = webLimits(), z = b.dataset.zoom;
      if (z === "fit") webTween(L.zmin, 0, 0);
      else {
        const z1 = Math.max(L.zmin, Math.min(L.zmax, WEB.z * (z === "in" ? 1.45 : 1 / 1.45)));
        webTween(z1, WEB.cx, WEB.cy);
      }
    });
    addEventListener("resize", () => { if (tab === "tree") webApply(); });
  })();
  $("web").addEventListener("click", e => {
    const g = e.target.closest("[data-node]");
    if (!g) { if (treeSel) { treeSel = null; renderTree(); refreshPanel(); } return; }
    treeSel = g.dataset.node; renderTree(); refreshPanel();
    // if the card would cover the node, glide the map up a little
    requestAnimationFrame(() => {
      const n = NODE[treeSel], card = $("nodeCard"); if (!n || !card.offsetHeight) return;
      const py = (n.y - WEB.cy) * WEB.z + WEB.H / 2, room = WEB.H - card.offsetHeight - 16;
      if (py > room - 20) webTween(WEB.z, WEB.cx, n.y - (room / 2 - WEB.H / 2) / WEB.z);
    });
  });
  $("nodeCard").addEventListener("click", e => { if (e.target.closest("[data-ncx]")) { treeSel = null; renderTree(); refreshPanel(); } });
}
