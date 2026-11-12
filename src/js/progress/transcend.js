// Transcending: Stardust, Star Power, the Star Forge, and the Transcend tab.
import { sfx } from "../audio/sound.js";
import { listen } from "../core/events.js";
import { CYCLE, RUN, S } from "../core/save.js";
import { ST, plus, statSource } from "../core/stats.js";
import { fmt } from "../core/util.js";
import { fillOrbital } from "../gear/inventory.js";
import { ORBIT } from "../hero/orbitals.js";
import { whenNewBest } from "../modes/modes.js";
import { finishedBounties, startRun } from "./ascend.js";
import { autoOn } from "./automation.js";
import { renderStars, starPoints } from "./stars.js";
import { buildSkillbar } from "../skills/skills.js";
import { TRAIN } from "../train/train.js";
import { action, confirmTap, markDirty, sheet } from "../ui/actions.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";

const FR = id => (S.forge && S.forge[id]) || 0;
const FORGE = [
  { id: "capT", grp: "Caps", name: "Expanded Training", max: 10, cost: r => Math.ceil(5 * Math.pow(1.6, r)), desc: r => "+" + 10 * r + " level cap on every capped training upgrade", nx: "+10 more", stats: r => ({ trainCap: plus(10 * r) }) },
  { id: "mast", grp: "Caps", name: "Skill Mastery", max: 5, cost: r => Math.ceil(6 * Math.pow(1.7, r)), desc: r => "Skill level cap " + (40 + 5 * r) + ", and the stage cap runs " + 2 * r + " levels ahead", nx: "+5 cap", stats: r => ({ skillMastery: plus(r) }) },
  { id: "gild", grp: "Gear", name: "Gilded Gear", max: 3, cost: r => [10, 25, 60][r] || 999, desc: r => ["No extra bonus stats yet", "Rare and better roll 1 extra bonus stat", "Magic items also roll 1 extra", "Legendaries roll another (5 total)"][r], nx: ["Rare+ +1 stat", "Magic +1 stat", "Legendary +1 more"], stats: r => ({ gild: plus(r) }) },
  { id: "craft", grp: "Gear", name: "Fine Craft", max: 5, cost: r => Math.ceil(4 * Math.pow(1.6, r)), desc: r => "+" + 10 * r + "% bonus stat values on new items", nx: "+10%", stats: r => ({ affixPow: 1 + .1 * r }) },
  { id: "head", grp: "Start", name: "Head Start", max: 13, cost: r => Math.ceil(5 * Math.pow(1.5, r)), desc: r => r ? "Each ascension starts at stage " + (1 + headStart(r)) + " with a Rare starter kit" : "Ascensions start at stage 1", nx: "+10 stages", stats: r => ({ startStage: plus(headStart(r)), starterKit: plus(r ? 1 : 0) }) },
  { id: "orb3", grp: "Combat", name: "Third Orbital", max: 3, cost: r => [25, 50, 90][r] || 999, desc: r => r ? "A third orbital slot, firing at " + SLOT3_DMG[r] * 100 + "% damage" : "Opens a third orbital slot", nx: r => SLOT3_DMG[r + 1] * 100 + "% damage", stats: r => ({ orbit3: plus(SLOT3_DMG[r]) }), bought: () => fillOrbital(ORBIT.weapon3) },
  { id: "boss", grp: "Combat", name: "Boss Hunter", max: 5, cost: r => Math.ceil(6 * Math.pow(1.6, r)), desc: r => "+" + 5 * r + "s boss timer and +" + 10 * r + "% damage to bosses", nx: "+5s, +10%", stats: r => ({ bossTime: plus(5 * r), bossDmg: 1 + .1 * r }) },
  { id: "ocd", grp: "Combat", name: "Overcharge Discount", max: 5, cost: r => Math.ceil(8 * Math.pow(1.6, r)), desc: r => "Each Overcharge level costs x" + (2 - .1 * r).toFixed(1) + " the last", nx: r => "x" + (1.9 - .1 * r).toFixed(1), stats: r => ({ ocGrowth: plus(-.1 * r) }) },
  { id: "bb", grp: "Economy", name: "Bounty Board+", max: 3, cost: r => [8, 16, 30][r] || 999, desc: r => r ? "+" + r + " bounty slot" + (r > 1 ? "s" : "") + ", new notices post " + 15 * r + "% faster" : "No extra bounty slots", nx: "+1 slot, 15% faster", stats: r => ({ bountySlots: plus(r), postTime: 1 - .15 * r }) },
  { id: "off", grp: "Economy", name: "Offline Mastery", max: 5, cost: r => Math.ceil(5 * Math.pow(1.55, r)), desc: r => "Offline farming at " + (50 + 10 * r) + "% speed, up to " + OFF_H[r] + " hours", nx: r => (60 + 10 * r) + "%, " + OFF_H[r + 1] + "h", stats: r => ({ offRate: plus(.1 * r), offHours: plus(OFF_H[r] - OFF_H[0]) }) }
];
const SLOT3_DMG = [0, .4, .7, 1];
const headStart = r => 10 * r;
const OFF_H = [8, 12, 16, 20, 24, 24];
const FG = {};
statSource(give => FORGE.forEach(f => give(f, FR(f.id))));
statSource(give => give(() => ({ atk: starPow(), maxHp: starPow(), echoGain: starEcho() })));
 FORGE.forEach(f => FG[f.id] = f);
const starEff = () => { const t = S.stardustTotal || 0; return Math.min(t, 50) + Math.max(0, t - 50) * .5; };
const starPow = () => 1 + .03 * starEff();
const starEcho = () => 1 + .02 * starEff();
export const TRANS_AT = 150;
export const ECHO_K = .09;
export const transOpen = () => (S.peak || 1) >= TRANS_AT || (S.stardustTotal || 0) > 0;
// every Transcend needs stage 150 reached in the current cycle, not just once ever
export const cycleBest = () => Math.max(S.cyclePeak || 1, S.maxStage || 1);
const canTrans = () => cycleBest() >= TRANS_AT && dustGain() >= 1;
// Stardust follows the echoes earned this cycle. Up to a fair amount for your best stage (about 8 full ascensions
// there) it grows in step with them, so several small Transcends pay the same as one big one. Echoes past that
// count only 5%, so echoes farmed from an exploit or endless grinding can't inflate a Transcend
const dustEchoCap = best => Math.round(8 * ECHO_K * starEcho() * Math.pow(best, 1.5));
const dustAt = best => { const E = S.echoesTotal || 0, C = dustEchoCap(best); return Math.floor((E < C ? E / Math.sqrt(C) : Math.sqrt(C + .05 * (E - C))) * best / TRANS_AT); };
const dustGain = () => dustAt(cycleBest());
// the share of this cycle's echoes that keeps counting toward echo power after a Transcend
const echoKept = () => Math.floor(ST.echoKeep * (S.echoesTotal || 0));
// A Transcend resets what an ascension does plus this cycle's echo power and ascension count.
// The web, unspent echoes and finished bounties stay (they are KEPT fields)
function doTranscend() {
  const g = dustGain(), kept = echoKept();
  if (!transOpen() || !canTrans()) return false;
  Object.assign(S, CYCLE(), RUN(), { stardust: (S.stardust || 0) + g, stardustTotal: (S.stardustTotal || 0) + g, transcends: (S.transcends || 0) + 1, echoMemory: (S.echoMemory || 0) + kept, bounties: finishedBounties() });
  startRun();
  log("Transcended for " + g + " Stardust. Spend it in the Star Forge", "r4"); sfx("ascend", 0, 0);
  log("Your web and echoes came with you, and " + fmt(kept) + " echoes stay in your echo power for good. Star Power: +" + Math.round((starPow() - 1) * 100) + "% attack and health", "r3");
  if (starPoints()) log("A star has awakened. Choose it in the Transcend tab", "r4");
  return true;
}
function renderTrans() {
  if (!transOpen()) return '<p class="note">Reach stage ' + TRANS_AT + " to unlock Transcend.</p>";
  // before stage 150 this cycle, the tab shows what a Transcend there would pay
  const g = dustGain(), bestC = cycleBest(), E = S.echoesTotal || 0, C = dustEchoCap(Math.max(bestC, TRANS_AT));
  let h = '<div class="ascTop transTop"><div><b class="dustC">' + fmt(S.stardust || 0) + " Stardust</b> to spend · " + fmt(S.stardustTotal || 0) + " earned in total</div>" +
    '<div class="note" style="margin:0"><b class="dustC">Star Power</b>: +' + Math.round((starPow() - 1) * 100) + "% attack and health, +" + Math.round((starEcho() - 1) * 100) + "% echo gain" + ((S.stardustTotal || 0) > 50 ? " (Stardust past 50 counts half)" : "") + "</div>" +
    '<div class="note" style="margin:0">' + (bestC < TRANS_AT ? "<b>Reach stage " + TRANS_AT + " this cycle to transcend</b> (best this cycle: " + bestC + "). " : "") + (bestC < TRANS_AT ? "At stage " + TRANS_AT + " you would get about " : "Transcend now for ") + '<b class="dustC">' + (bestC < TRANS_AT ? dustAt(TRANS_AT) : g) + " Stardust</b> (best stage this cycle " + bestC + ", " + fmt(E) + " echoes earned this cycle" + (E > C ? "; echoes past " + fmt(C) + " count only 5% at this stage" : "; Stardust grows with them up to " + fmt(C) + " echoes, and with your best stage") + ").</div>" +
    '<div class="note" style="margin:0"><b>You keep</b> your whole web, your unspent echoes, ' + Math.round(ST.echoKeep * 100) + "% of this cycle's echo power for good" + (E ? " (" + fmt(echoKept()) + " of " + fmt(E) + " echoes)" : "") + ", finished bounties, Stardust, the Star Forge, your stars, the Index and the Abyss. <b>You lose</b> what an ascension resets (lumen, gear, training and skill levels), the rest of this cycle's echo power, and your ascension count, so enemy modifiers start over. You restart at stage " + (1 + headStart(FR("head"))) + ".</div>" +
    '<div class="ctrls" style="margin:0"><button class="btn go' + (canTrans() ? "" : " dim") + '" data-act="transcend">' + "Transcend" + "</button></div></div>";
  h += renderStars();
  let grp = "";
  FORGE.forEach(f => {
    if (f.grp !== grp) { grp = f.grp; h += '<h4 class="forgeH">' + grp + "</h4>"; }
    const r = FR(f.id), maxed = r >= f.max, c = f.cost(r), nx = Array.isArray(f.nx) ? f.nx[r] : typeof f.nx === "function" ? f.nx(r) : f.nx;
    h += '<div class="row forge"><span class="n">' + f.name + (f.max > 1 ? " · Rank " + r + " / " + f.max : r ? " · Unlocked" : "") + '</span><span class="d">' + f.desc(r) + (maxed || !nx ? "" : '<span class="nx"> → ' + nx + "</span>") + "</span>" +
      '<div class="side">' + (maxed ? '<button class="btn" disabled>' + (f.max > 1 ? "Maxed" : "Owned") + "</button>" : '<button class="btn dustb" data-act="forge" data-id="' + f.id + '" data-cost="' + c + '" data-cur="dust">' + c + " Stardust</button>") + "</div>" + "</div>";
  });
  h += '<h4 class="forgeH">Automation</h4>';
  if (!autoOn()) return h + '<p class="note">Auto-Train, Auto-Push, Auto-Ascend and Smart Cast unlock for free on your first Transcend.</p>';
  const row = (n, d, chips) => '<div class="row forge"><span class="n">' + n + '</span><span class="d">' + d + '</span><div class="chips">' + chips + "</div></div>";
  h += row("Auto-Train", "Buys training for you every 2 seconds. Tap a name to skip it.", '<button class="chip' + (S.autoCfg.trainOn !== false ? " on" : "") + '" data-act="aTrainOn">' + (S.autoCfg.trainOn !== false ? "On" : "Off") + "</button>" + TRAIN.map(t => '<button class="chip' + (S.autoCfg.train[t.id] === false ? "" : " on") + '" data-act="aTrainT" data-id="' + t.id + '">' + t.name + "</button>").join(""));
  h += row("Auto-Push", "Goes back to pushing after farming for a while.", '<span>Push again after</span>' + [0, 30, 60, 120].map(v => '<button class="chip' + ((S.autoCfg.push ?? 60) === v ? " on" : "") + '" data-act="aPushD" data-id="' + v + '">' + (!v ? "Off" : v < 60 ? v + "s" : v / 60 + " min") + "</button>").join(""));
  h += row("Auto-Ascend", "Ascends for you at a stage you choose, or when stuck.", '<span>Ascend at stage</span>' + [0, 40, 60, 80, 100, 120, 150, 200].map(v => '<button class="chip' + ((S.autoCfg.ascAt || 0) === v ? " on" : "") + '" data-act="aAscAt" data-id="' + v + '">' + (v ? v : "Off") + "</button>").join("") + '<button class="chip' + (S.autoCfg.ascStall ? " on" : "") + '" data-act="aAscStall">When stuck 5 min</button>');
  h += row("Smart Cast", "Auto-cast saves big skills for elites, bosses and groups.", '<button class="chip' + (S.autoCfg.smart !== false ? " on" : "") + '" data-act="smartT">' + (S.autoCfg.smart !== false ? "On" : "Off") + "</button>");
  return h;
}
sheet("tree", "trans", { label: "Transcend", at: 1, open: () => transOpen(), body: "transBody", render: renderTrans });
whenNewBest((before, now, kind) => {
  if (kind !== "peak" || before >= TRANS_AT || now < TRANS_AT) return;
  log("Stage " + TRANS_AT + " reached: Transcend is open in the Tree window. Enemies grow faster from here, and transcending is how you outgrow them", "r4");
  floatText("Transcend unlocked", "info", "hero", "#ffe7a3"); sfx("chord", 0, 300); markDirty("tree");
});
// a nudge, once a session, for anyone falling back near the wall who hasn't transcended yet
let nudged = false;
listen(type => {
  if (type !== "setback" || nudged || (S.transcends || 0) > 0 || (S.peak || 1) < TRANS_AT || S.maxStage < TRANS_AT - 10) return;
  nudged = true;
  log("Stuck around stage " + TRANS_AT + "? Enemies past it outgrow what ascending alone gives. Transcend in the Tree window: you keep your web and echoes", "r4");
});
action("transcend", (id, b) => {
  if (!transOpen() || !canTrans()) return false;
  if (!confirmTap(b, "Tap again to transcend")) return false;
  doTranscend();
});
action("forge", id => {
  const f = FG[id], r = FR(id), c = f.cost(r);
  if (r >= f.max || S.stardust < c) return false;
  S.stardust -= c; S.forge[id] = r + 1; sfx("chord", 0, 0);
  if (f.bought) f.bought();
  buildSkillbar();
  log("Star Forge: " + f.name + " rank " + (r + 1), "r4");
});
action("aTrainT", id => { S.autoCfg.train[id] = S.autoCfg.train[id] === false; });
action("aTrainOn", () => { S.autoCfg.trainOn = S.autoCfg.trainOn === false; });
action("aPushD", id => { S.autoCfg.push = Number(id); });
action("aAscAt", id => { S.autoCfg.ascAt = Number(id); });
action("aAscStall", () => { S.autoCfg.ascStall = !S.autoCfg.ascStall; });
action("smartT", () => { S.autoCfg.smart = S.autoCfg.smart === false; });
