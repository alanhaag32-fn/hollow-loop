// The Abyss: endless depths of Void waves and a Guardian, its rules, Voidstone, the Altar and milestones.
import { sfx } from "../audio/sound.js";
import { heroDown, land, trueDamage } from "../combat/combat.js";
import { S, save } from "../core/save.js";
import { ST, plus, statSource } from "../core/stats.js";
import { fmt, pick, rnd, svgEl } from "../core/util.js";
import { VARIANTS, addMod, makeFoe } from "../enemies/enemies.js";
import { clearFoes, foes, newWaypoint, pickSpawnAngle, setFoePos, spawnFoe } from "../enemies/foes.js";
import { ringIfRoom, tempFx } from "../fx/effects.js";
import { reduce } from "../fx/gfx.js";
import { DASH_TIME, dashIT, recalc } from "../hero/hero.js";
import { MAIN, mode, spawn, switchMode } from "../modes/modes.js";
import { TRANS_AT } from "../progress/transcend.js";
import { action, markDirty } from "../ui/actions.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";
import { closeWindow } from "../ui/windows.js";
import { setZone, view } from "../world/scene.js";

// the Abyss's wave state: phase 1-3 are waves, 4 is the Guardian
const ab = { phase: 1, need: 0, spawned: 0, pause: 0 };
export const abyssOpen = () => (S.peak || 1) >= TRANS_AT;
const AL = id => (S.abyss && S.abyss.altar && S.abyss.altar[id]) || 0;
const abBest = () => (S.abyss && S.abyss.best) || 0;
const abMile = d => abBest() >= d;
const abyssStage = d => 143 + 2 * d;
// one new rule per depth (from depth 2); after all twelve they start stacking
const AB_RULES = [
  { id: "thick", name: "Dense", d: n => "+" + 40 * n + "% enemy health", foe: (e, n) => { e.hp *= 1 + .4 * n; e.max = e.hp; } },
  { id: "homing", name: "Seeking", d: n => "Enemy shots home in " + (50 * n) + "% harder", stats: n => ({ homing: plus(n) }) },
  { id: "hasted", name: "Frenzy", d: n => "Enemies attack " + 25 * n + "% faster", foe: (e, n) => { e.fx.push({ attackRate: c => { c.v *= 1 + .25 * n; } }); } },
  { id: "pools", name: "Corrosion", d: n => "Destroyed enemies leave poison pools (" + 3 * n + "% health per second)", fx: { kill: c => { if (c.e.void) addPool(c.e.px, c.e.py); } } },
  { id: "vicious", name: "Vicious", d: n => "+" + 30 * n + "% enemy damage", foe: (e, n) => { e.dmg *= 1 + .3 * n; } },
  { id: "halfheal", name: "Withering", d: n => "Your healing is cut to " + Math.round(Math.max(.25, Math.pow(.5, n)) * 100) + "%", stats: n => ({ healMult: Math.max(.25, Math.pow(.5, n)) }) },
  { id: "shield", name: "Warded", d: () => "Every enemy is Shielded", foe: e => addMod(e, "shielded") },
  { id: "swarm", name: "Swarm", d: n => "+" + Math.min(4, n) + " enemies per wave" },
  { id: "split", name: "Fission", d: () => "Elites split apart when destroyed", foe: e => { if (e.elite) addMod(e, "splitting"); } },
  { id: "static", name: "Null Field", d: n => "Your mana regen is " + Math.round((1 - Math.pow(.7, n)) * 100) + "% lower", stats: n => ({ mpRegen: Math.pow(.7, n) }) },
  { id: "volatile", name: "Unstable", d: () => "Every enemy is Volatile", foe: e => addMod(e, "volatile") },
  { id: "armor", name: "Plated", d: n => "Enemies take " + Math.round((1 - Math.max(.4, Math.pow(.8, n))) * 100) + "% less damage", foe: (e, n) => { e.fx.push({ take(h) { h.dmg *= Math.max(.4, Math.pow(.8, n)); } }); } }
];
function abSeq() {
  let x = (S.abyss.seed || 1) >>> 0; const ids = AB_RULES.map(r => r.id);
  for (let i = ids.length - 1; i > 0; i--) { x = (x * 1103515245 + 12345) >>> 0; const j = x % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}
const ruleCountAt = (id, d) => { const seq = abSeq(), pos = seq.indexOf(id), k = Math.max(0, d - 1); return Math.floor(k / 12) + (k % 12 > pos ? 1 : 0); };
const ruleN = id => mode === ABYSS ? ruleCountAt(id, S.abyss.depth) : 0;
statSource(give => AB_RULES.forEach(r => { const n = ruleN(r.id); if (n) give(r, n); }));
const ALTAR = [
  { id: "might", name: "Abyssal Might", max: 50, cost: r => Math.ceil(3 * Math.pow(1.22, r)), desc: r => "+" + 10 * r + "% attack and health", nx: "+10%", stats: r => ({ atk: 1 + .1 * r, maxHp: 1 + .1 * r }) },
  { id: "reson", name: "Echo Resonance", max: 20, cost: r => Math.ceil(5 * Math.pow(1.3, r)), desc: r => "+" + 5 * r + "% echoes from ascending", nx: "+5%", stats: r => ({ echoGain: 1 + .05 * r }) },
  { id: "memory", name: "Abyss Memory", max: 5, cost: r => [10, 20, 40, 70, 110][r] || 999, desc: r => "+" + r + "% attack for every depth of your best (now +" + r * abBest() + "%)", nx: "+1% per depth", stats: r => ({ atk: 1 + .01 * r * abBest() }) },
  { id: "lure", name: "Mythic Lure", max: 10, cost: r => Math.ceil(8 * Math.pow(1.35, r)), desc: r => "+" + 15 * r + "% Mythic drop chance", nx: "+15%", stats: r => ({ mythChance: 1 + .15 * r }) },
  { id: "flow", name: "Momentum", max: 5, cost: r => [6, 12, 24, 40, 60][r] || 999, desc: r => "Momentum lasts until " + (50 + 5 * r) + "% of your best stage", nx: "+5%", stats: r => ({ momentumAt: plus(.05 * r) }) },
  { id: "stone", name: "Deep Pockets", max: 10, cost: r => Math.ceil(4 * Math.pow(1.4, r)), desc: r => "+" + 10 * r + "% Voidstone", nx: "+10%", stats: r => ({ stoneGain: 1 + .1 * r }) }
];
const ALT = {};
statSource(give => ALTAR.forEach(a => give(a, AL(a.id))));
 ALTAR.forEach(a => ALT[a.id] = a);
const AB_MILES = [
  [5, "Abyssal Orbital", "Your third orbital slot opens (40% damage) even without the Star Forge", { stats: () => ({ orbit3Min: plus(.4) }) }],
  [10, "Void Step", "Dash tears a rift along its path that deals 300% attack", { fx: {
    dash(c) {
      const { x0, y0 } = c;
      setTimeout(() => {
        const x1 = view.HERO_X, y1 = view.HERO_Y, vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1;
        if (!reduce) tempFx(svgEl("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: "#c08bff", "stroke-width": 10, "stroke-linecap": "round", opacity: .5, class: "glow" }), [{ opacity: .7 }, { opacity: 0 }], 500);
        foes.forEach(f => { if (f.dead) return; const t = Math.max(0, Math.min(1, ((f.px - x0) * vx + (f.py - y0) * vy) / L2)); if (Math.hypot(f.px - (x0 + vx * t), f.py - (y0 + vy * t)) < f.R + 40) land(f, ST.atk * 3, "aoe"); });
      }, DASH_TIME * 1000 + 20);
    }
  } }],
  [25, "Rift Keystone", "+25% echo power", { stats: () => ({ echoBonus: 1.25 }) }],
  [50, "Abyss Heart", "+50% attack and health", { stats: () => ({ atk: 1.5, maxHp: 1.5 }) }],
  [100, "Endless", "Double Voidstone", { stats: () => ({ stoneGain: 2 }) }]
];
statSource(give => AB_MILES.forEach(([d, , , def]) => { if (def && abMile(d)) give(def); }));
const VOID_SHAPES = [
  { n: "Rhomb", p: [[0, -1], [.6, 0], [0, 1], [-.6, 0]] },
  { n: "Kite", p: [[0, -1], [.55, -.25], [0, 1], [-.55, -.25]] },
  { n: "Slant", p: [[-.95, -.5], [.45, -.5], [.95, .5], [-.45, .5]] },
  { n: "Trapeze", p: [[-.45, -.55], [.45, -.55], [.95, .55], [-.95, .55]] },
  { n: "Chevron", p: [[-.9, -.6], [.3, -.6], [.9, 0], [.3, .6], [-.9, .6], [-.4, 0]] },
  { n: "Bowtie", p: [[-1, -.7], [0, -.2], [1, -.7], [1, .7], [0, .2], [-1, .7]] },
  { n: "Notch", p: [[-.8, -.8], [.8, -.8], [.8, .8], [0, .25], [-.8, .8]] },
  { n: "Shard", p: [[-.9, .6], [.95, .75], [-.2, -.95]] },
  { n: "Dart", p: [[0, -1], [.7, .8], [0, .35], [-.7, .8]] },
  { n: "Warp", p: [[-.5, -.9], [.6, -.7], [1, .1], [.4, .85], [-.7, .7], [-.95, -.1]] },
  { n: "Bolt", p: [[-.3, -1], [.6, -1], [.15, -.15], [.75, -.15], [-.35, 1], [0, .15], [-.6, .15]] },
  { n: "Spark", p: [[0, -1], [.3, -.3], [1, 0], [.3, .3], [0, 1], [-.3, .3], [-1, 0], [-.3, -.3]] },
  { n: "Rift", p: [[-.9, -.3], [-.1, -1], [.8, -.6], [.85, .5], [0, .95], [.1, .2]] },
  { n: "Ell", p: [[-.7, -1], [-.1, -1], [-.1, .3], [.8, .3], [.8, .9], [-.7, .9]] }
];
function jitterShape(pts) {
  let q = pts.map(([x, y]) => [x * (.88 + Math.random() * .24), y * (.88 + Math.random() * .24)]);
  const cx = q.reduce((a, p) => a + p[0], 0) / q.length, cy = q.reduce((a, p) => a + p[1], 0) / q.length;
  q = q.map(([x, y]) => [x - cx, y - cy]);
  const m = Math.max(...q.map(([x, y]) => Math.hypot(x, y))) || 1, rot = Math.random() * 6.28, c = Math.cos(rot), sn = Math.sin(rot);
  return q.map(([x, y]) => [(x * c - y * sn) / m, (x * sn + y * c) / m]);
}
const pools = [];
let poolAcc = 0, poolT = 0;
const abWaveSize = () => 5 + Math.min(4, ruleN("swarm")) + Math.floor(S.abyss.depth / 15);
function abStartDepth(pause) { ab.phase = 1; ab.need = abWaveSize(); ab.spawned = 0; ab.pause = pause || 1.5; recalc(); }
function enterAbyss() {
  if (mode === ABYSS || !abyssOpen() || heroDown) return;
  if (!S.abyss.seed) S.abyss.seed = 1 + Math.floor(Math.random() * 1e9);
  switchMode(ABYSS); closeWindow();
  log("You enter the Abyss at depth " + S.abyss.depth + ". Clear 3 waves, then the Guardian", "r5"); sfx("chord", 0, 0);
  floatText("Depth " + S.abyss.depth, "info", "hero", "#ff5fa8");
}
function exitAbyss() {
  if (mode !== ABYSS) return;
  switchMode(MAIN);
  log("You left the Abyss. Back to stage " + S.stage, "r0");
}
function abyssCleared(e) {
  const A = S.abyss, d = A.depth, first = d > A.best;
  const g = Math.ceil((2 + Math.floor(d / 2)) * (first ? 3 : 1) * ST.stoneGain);
  A.stone += g; A.total += g;
  if (first) {
    A.best = d;
    AB_MILES.forEach(([m, n]) => { if (d === m) { log("Abyss milestone, depth " + m + ": " + n + " unlocked", "r5"); sfx("chord", 0, 300); } });
  }
  log("Depth " + d + " cleared: +" + g + " Voidstone" + (first ? " (new best)" : ""), "r5");
  floatText("+" + g + " Voidstone", "info", e || "hero", "#ff5fa8");
  A.depth = d + 1; abStartDepth(2.2); setZone(true);
  markDirty("tree"); save();
}
function abyssFail(why) {
  const A = S.abyss, back = why === "death" ? 2 : 0;
  A.depth = Math.max(1, A.depth - back); pools.length = 0;
  log(why === "death" ? "Your core collapsed in the Abyss. Back to depth " + A.depth : "The Guardian slipped away. Depth " + A.depth + " starts over", "bad");
  abStartDepth(2); markDirty("tree");
}
const ABYSS = {
  stage: () => abyssStage(S.abyss.depth),
  look: () => ({
    key: "abyss", hue: 285, sky: "radial-gradient(ellipse at 50% 50%, hsl(285 45% 10%), hsl(260 40% 3%) 75%)",
    shape: i => jitterShape(VOID_SHAPES[(i * 7) % VOID_SHAPES.length].p)
  }),
  mythic: () => true,
  lumen: () => 1,
  auto: false,
  enter() { pools.length = 0; abStartDepth(1.5); },
  leave() { pools.length = 0; },
  stepSpawns(dt) {
    if (ab.pause > 0) { ab.pause -= dt; return; }
    const live = foes.filter(f => !f.dead).length;
    if (ab.spawned < ab.need) {
      spawn.spawnT -= dt;
      const cap = ab.phase === 4 ? 1 : 6;
      if (spawn.spawnT > 0 || live >= cap) return;
      const n = ab.phase === 4 ? 1 : Math.min(1 + rnd(3), cap - live, ab.need - ab.spawned);
      const base = pickSpawnAngle();
      for (let i = 0; i < n; i++) {
        const last = ab.spawned === ab.need - 1;
        const kind = ab.phase === 4 ? "g" : last && (ab.phase === 3 || (ab.phase === 2 && S.abyss.depth >= 10)) ? "e" : "n";
        spawnFoe(makeVoid(kind), base + (i - (n - 1) / 2) * .32, i * 22); ab.spawned++;
      }
      spawn.spawnT = .7 + Math.random() * .6;
      return;
    }
    if (live > 0 || ab.phase === 4) return;
    if (ab.phase < 3) { ab.phase++; ab.need = abWaveSize(); ab.spawned = 0; ab.pause = 1.2; floatText("Wave " + ab.phase + "/3", "info", "hero", "#c08bff"); }
    else { ab.phase = 4; ab.need = 1; ab.spawned = 0; ab.pause = 1.6; floatText("Guardian", "info", "hero", "#ff5fa8"); sfx("warn"); }
  },
  step(dt) {
    const n = ruleN("pools"); poolT += dt;
    for (let i = pools.length - 1; i >= 0; i--) {
      const P = pools[i]; P.t -= dt;
      if (P.t <= 0) { pools.splice(i, 1); continue; }
      if (!heroDown && !(dashIT > 0) && Math.hypot(view.HERO_X - P.x, view.HERO_Y - P.y) < P.R) poolAcc += ST.maxHp * .03 * Math.max(1, n) * dt;
    }
    if (poolT >= .5) { poolT = 0; if (poolAcc > 0) { trueDamage(poolAcc, "Poison"); poolAcc = 0; } }
  },
  kill(e) { if (e.boss) abyssCleared(e); },
  death() { abyssFail("death"); },
  escape() { clearFoes(true); abyssFail("escape"); },
  hud() {
    const live = foes.filter(f => !f.dead).length;
    return { title: "Depth " + S.abyss.depth, button: "Leave Abyss", prog: ab.need ? (ab.spawned - live) / ab.need : 0, sub: (ab.phase === 4 ? "Guardian" : "Wave " + ab.phase + "/3") + ", best " + abBest() };
  },
  button() { exitAbyss(); }
};
function addPool(x, y) {
  pools.push({ x, y, R: 34, t: 5 });
  if (!reduce) tempFx(svgEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 34, fill: "rgba(120,255,140,.16)", stroke: "#7dff8a", "stroke-width": 1.5, "stroke-dasharray": "4 4" }), [{ opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: 1, offset: .85 }, { opacity: 0 }], 5000);
}
// Void enemies blink: every few seconds they vanish and reappear somewhere else around you
const VOID_BLINK = {
  tick(c, e) {
    if (e.boss || !e.arrived || e.stun > 0) return;
    e.blinkT -= c.dt;
    if (e.blinkT <= 0) { e.blinkT = 5 + Math.random() * 4; voidBlink(e); }
  }
};
function makeVoid(kind) {
  const d = S.abyss.depth, boss = kind === "g";
  const v = pick(VARIANTS), T0 = pick(VOID_SHAPES), shape = jitterShape(T0.p), hue = pick([280, 300, 190, 320, 165, 250]);
  const e = makeFoe({ stage: abyssStage(d), boss, elite: kind === "e", v, zone: 5 + d % 8, timer: 75 + ST.bossTime });
  Object.assign(e, {
    sides: shape.length, shape, void: true, tone: "r5", hue, fill: "hsl(" + hue + " 40% 9%)", stroke: "hsl(" + hue + " 95% 66%)",
    tier: Math.min(4, 2 + (boss ? 2 : e.elite ? 1 : 0) + (Math.random() < .3 ? 1 : 0)), R: Math.round((boss ? 36 : e.elite ? 31 : 26) * v.size),
    name: (boss ? "Guardian " : e.elite ? "Elite " : "") + "Void " + T0.n, blinkT: 3 + Math.random() * 4
  });
  e.fx.push(VOID_BLINK);
  AB_RULES.forEach(r => { const n = ruleN(r.id); if (n && r.foe) r.foe(e, n); });
  return e;
}
function voidBlink(e) {
  ringIfRoom(e.px, e.py, e.stroke, 1.5, .2, 260, 2);
  const a = Math.random() * 6.28, dist = (e.stopR || 120) + 20 + Math.random() * 60;
  e.px = view.HERO_X + Math.cos(a) * dist; e.py = view.HERO_Y + Math.sin(a) * dist; e.vx = 0; e.vy = 0;
  newWaypoint(e); setFoePos(e); ringIfRoom(e.px, e.py, e.stroke, .2, 2, 300, 2);
}
export function renderAbyss() {
  if (!abyssOpen()) return '<p class="note">Reach stage ' + TRANS_AT + " to open the Abyss.</p>";
  const A = S.abyss, d = A.depth, rules = AB_RULES.map(r => [r, ruleCountAt(r.id, d)]).filter(x => x[1] > 0);
  let h = '<div class="ascTop transTop"><div><b class="voidC">' + fmt(A.stone) + " Voidstone</b> to spend · best depth " + A.best + "</div>" +
    '<div class="note" style="margin:0">The Abyss is an endless climb that never resets, not even when you transcend. Each depth is 3 waves of Void shapes and a Guardian. Clear it for Voidstone and go one deeper. Every depth adds a rule. Die and you fall back 2 depths. Mythics can drop from Guardians. Your build comes with you; leaving puts you back on stage ' + S.stage + ".</div>" +
    '<div class="ctrls" style="margin:0"><button class="btn go" data-act="' + (mode === ABYSS ? "abLeave" : "abEnter") + '">' + (mode === ABYSS ? "Leave the Abyss" : "Enter at depth " + d) + "</button>" +
    (mode !== ABYSS && d > 1 ? '<button class="btn" data-act="abDown">Start 5 depths lower</button>' : "") + "</div></div>";
  h += '<h4 class="forgeH">Depth ' + d + " rules</h4>" + (rules.length ? rules.map(([r, n]) => '<div class="row forge"><span class="n">' + r.name + (n > 1 ? " x" + n : "") + '</span><span class="d">' + r.d(n) + "</span></div>").join("") : '<p class="note">None yet. A new rule joins at every depth from depth 2.</p>');
  h += '<h4 class="forgeH">Milestones</h4>' + AB_MILES.map(([m, n, t]) => '<div class="row forge"><span class="n">Depth ' + m + ": " + n + (A.best >= m ? " ✓" : "") + '</span><span class="d"' + (A.best >= m ? "" : ' style="opacity:.6"') + ">" + t + "</span></div>").join("");
  h += '<h4 class="forgeH">Abyss Altar</h4>';
  ALTAR.forEach(a => {
    const r = AL(a.id), maxed = r >= a.max, c = a.cost(r);
    h += '<div class="row forge"><span class="n">' + a.name + " · Rank " + r + " / " + a.max + '</span><span class="d">' + a.desc(r) + (maxed ? "" : '<span class="nx"> → ' + a.nx + "</span>") + "</span>" +
      '<div class="side">' + (maxed ? '<button class="btn" disabled>Maxed</button>' : '<button class="btn voidb" data-act="altar" data-id="' + a.id + '">' + c + " Voidstone</button>") + "</div></div>";
  });
  return h;
}
action("abEnter", () => enterAbyss());
action("abLeave", () => { exitAbyss(); closeWindow(); });
action("abDown", () => { S.abyss.depth = Math.max(1, S.abyss.depth - 5); });
action("altar", id => {
  const a = ALT[id], r = AL(id), c = a.cost(r);
  if (r >= a.max || S.abyss.stone < c) return false;
  S.abyss.stone -= c; S.abyss.altar[id] = r + 1; sfx("chord", 0, 0); log("Abyss Altar: " + a.name + " rank " + (r + 1), "r5");
});
