// Wisps: stray lights that drift across the arena now and then. Tap one before it leaves and it bursts into a boon.
import { sfx } from "../audio/sound.js";
import { heroDown } from "../combat/combat.js";
import { lumenAt } from "../core/curves.js";
import { tell } from "../core/events.js";
import { S } from "../core/save.js";
import { ST, effectSource, statSource } from "../core/stats.js";
import { $, fmt, starPts, svgEl } from "../core/util.js";
import { burst } from "../fx/effects.js";
import { receive } from "../gear/inventory.js";
import { RARITY, makeItem } from "../gear/items.js";
import { hero, recalc } from "../hero/hero.js";
import { fightStage } from "../modes/modes.js";
import { addEchoes, addGold, addShards, shardAmt } from "../progress/currency.js";
import { cds } from "../skills/skills.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";
import { ARENA_B, ARENA_T, VW, view } from "../world/scene.js";

// they start appearing once you've reached this stage; a tap this close catches one; how fast they cross the screen
const WISP_FROM = 3, WISP_REACH = 34, WISP_SPEED = 55, WISP_COL = "#ffe9a8";
const wispGap = () => 70 + Math.random() * 50;
// What a wisp can hold. w: how likely; run(): an instant boon, returns what it gave;
// time: a timed boon instead, with stats or fx like any other bonus; ok(): whether it can come up yet
const BOONS = [
  { id: "cache", w: 3, run() { const g = Math.ceil(lumenAt(fightStage()) * 40 * ST.gold); addGold(g, true); return "+" + fmt(g) + " lumen"; } },
  { id: "shards", w: 2, run() { const n = Math.max(1, Math.round(6 * shardAmt(fightStage()) * ST.shardF)); addShards(n); return "+" + n + " shards"; } },
  { id: "frenzy", w: 2, time: 20, name: "Frenzy", desc: "double attack speed", fx: { attackSpeed: c => { c.v *= 2; } } },
  { id: "gild", w: 2, time: 30, name: "Gilded", desc: "triple lumen", stats: () => ({ gold: 3 }) },
  { id: "renew", w: 2, run() { hero.hp = ST.maxHp; hero.mp = ST.maxMp; for (const k in cds) cds[k] = 0; return "Renewed: full health and mana, every skill ready"; } },
  { id: "gift", w: 1, run() { const it = receive(makeItem(fightStage(), false, 2), true); return RARITY[it.r].name + " " + it.name; } },
  { id: "echo", w: .4, ok: () => (S.peak || 1) >= 20, run() { addEchoes(1); return "+1 echo"; } }
];
// seconds left on each timed boon
const boonLeft = {};
const boonOn = b => boonLeft[b.id] > 0;
function startBoon(b) {
  const fresh = !boonOn(b);
  boonLeft[b.id] = b.time * ST.boonTime;
  if (b.stats && fresh) recalc();
  return b.name + ": " + b.desc + " for " + Math.round(boonLeft[b.id]) + "s";
}
// timed boons run down with the fight, like statuses
const BOON_CLOCK = { tick(c) { for (const b of BOONS) if (boonOn(b) && (boonLeft[b.id] -= c.dt) <= 0) { boonLeft[b.id] = 0; if (b.stats) recalc(); } } };
effectSource(() => [BOON_CLOCK].concat(BOONS.filter(b => b.fx && boonOn(b)).map(b => b.fx)));
statSource(give => BOONS.forEach(b => { if (b.stats && boonOn(b)) give(b); }));
// the chips under your mana bar for the boons running now
export const boonChips = () => BOONS.filter(boonOn).map(b => '<span class="stChip" style="--sc:' + WISP_COL + '" title="' + b.desc + '">' + b.name + " " + Math.ceil(boonLeft[b.id]) + "s</span>").join("");

// the wisp on screen, if any. sx, sy: where it is on the screen (in scene units), so it stays in view while you move
let wisp = null, wispIn = 45, wispSeen = false;
const wispX = () => view.VX0 + wisp.sx, wispY = () => view.VY0 + wisp.sy;
function placeWisp() { wisp.el.setAttribute("transform", "translate(" + wispX().toFixed(1) + " " + wispY().toFixed(1) + ")"); }
export function spawnWisp() {
  if (wisp) return;
  const dir = Math.random() < .5 ? 1 : -1, y0 = ARENA_T + 70 + Math.random() * Math.max(40, ARENA_B - ARENA_T - 170);
  const el = svgEl("g", { class: "wisp" }, $("wisps"));
  svgEl("circle", { r: 15, fill: WISP_COL, opacity: .22, class: "pulse" }, el);
  svgEl("polygon", { points: starPts(4, 12, 4.5), fill: WISP_COL, stroke: "#fff", "stroke-width": 1 }, svgEl("g", { class: "spinSlow" }, el));
  wisp = { el, dir, sx: dir > 0 ? -24 : VW + 24, sy: y0, y0, t: 0 };
  placeWisp(); sfx("shard", 0, 0);
  if (!wispSeen) { wispSeen = true; log("A wisp of stray light drifts in. Tap it before it leaves for a boon", "r4"); }
}
function endWisp() { wisp.el.remove(); wisp = null; wispIn = wispGap(); }
function catchWisp() {
  const x = wispX(), y = wispY(), pool = BOONS.filter(b => !b.ok || b.ok());
  endWisp();
  let r = Math.random() * pool.reduce((a, b) => a + b.w, 0), got = pool[0];
  for (const b of pool) { r -= b.w; if (r <= 0) { got = b; break; } }
  const text = got.time ? startBoon(got) : got.run();
  burst(x, y, WISP_COL, 12); sfx("loot", 2, 0);
  floatText(text, "info", "hero", WISP_COL); log("Wisp: " + text, "r4");
  tell("wisp", 1);
}
// a tap at this spot in the arena: catches the wisp if it's there
export function tapWisp(x, y) {
  if (!wisp || Math.hypot(wispX() - x, wispY() - y) > WISP_REACH) return false;
  catchWisp(); return true;
}
// each frame: the wait for the next wisp, and the one on screen drifting across (or flying to the core with Lodestar)
export function stepWisp(dt) {
  if (!wisp) {
    if (heroDown || (S.peak || 1) < WISP_FROM) return;
    wispIn -= dt; if (wispIn <= 0) spawnWisp();
    return;
  }
  wisp.t += dt;
  if (ST.wispPull > 0 && wisp.t > 1.2) {
    const dx = view.HERO_X - wispX(), dy = view.HERO_Y - wispY(), d = Math.hypot(dx, dy) || 1, go = Math.min(d, 260 * dt);
    wisp.sx += dx / d * go; wisp.sy += dy / d * go;
    if (d < 30) { catchWisp(); return; }
  } else {
    wisp.sx += wisp.dir * WISP_SPEED * dt; wisp.sy = wisp.y0 + Math.sin(wisp.t * 1.6) * 34;
    if (wisp.sx < -40 || wisp.sx > VW + 40) { endWisp(); return; }
  }
  placeWisp();
}
