// The hero core: health, mana, shield and buffs, how it looks, how it moves and dashes, and recalculating stats.
import { heroDown, land } from "../combat/combat.js";
import { itemPow } from "../core/curves.js";
import { S } from "../core/save.js";
import { ST, emit, onBase, refreshStats, statSource } from "../core/stats.js";
import { $, polyPts, starPts, svgEl, vertices } from "../core/util.js";
import { foes } from "../enemies/foes.js";
import { dashFx } from "../fx/effects.js";
import { ARENA_C, reduce } from "../fx/gfx.js";
import { SET, noun } from "../gear/items.js";
import { ORBITALS, WEAPON, weaponType } from "./orbitals.js";
import { fightStage } from "../modes/modes.js";
import { SK } from "../skills/skills.js";
import { clearStatuses } from "./statuses.js";
import { markDirty } from "../ui/actions.js";
import { paused } from "../core/pause.js";

import { VH, VW, applyCam, keys, placeBackdrop, view } from "../world/scene.js";

export const hero = {
  hp: 1,
  mp: 1,
  joyX: 0,
  joyY: 0,
  shield: 0,
  shieldMax: 1,
  shieldT: 0,
  odT: 0,
  markT: 0
};
export function setCounts() {
  const c = {};
  Object.values(S.equip).forEach(it => { if (it && it.set) c[it.set] = (c[it.set] || 0) + 1; });
  return c;
}
// echo power never caps, so each ascension pushes you further even once the web is full
statSource(give => give(() => ({ echoBonus: onBase(.01 * (S.echoesTotal || 0)) })));
export const evadeChance = () => Math.min(.5, ST.evaR / (ST.evaR + 6 * itemPow(fightStage())));
// the hero's temporary combat state goes back to rest: buffs, shield and statuses
export function resetCombat() {
  hero.shield = 0; hero.odT = 0; hero.markT = 0; heroModel.classList.remove("od");
  clearStatuses();
}
export function recalc() {
  const old = refreshStats();
  hero.hp = old ? Math.min(ST.maxHp, hero.hp * (ST.maxHp / old.maxHp)) : ST.maxHp;
  hero.mp = old ? Math.min(ST.maxMp, hero.mp * (ST.maxMp / old.maxMp)) : ST.maxMp;
  drawHero();
  markDirty("stats");
}
export const heroModel = $("heroModel");
export const RING_R = 50, HP_ARC = [128, 232], MP_ARC = [52, -52];
export function arcD(r, a0, a1) {
  const P = a => (Math.cos(a * Math.PI / 180) * r).toFixed(2) + " " + (Math.sin(a * Math.PI / 180) * r).toFixed(2);
  return "M" + P(a0) + " A" + r + " " + r + " 0 " + (Math.abs(a1 - a0) > 180 ? 1 : 0) + " " + (a1 > a0 ? 1 : 0) + " " + P(a1);
}
let ringV = [-1, -1, -1];
export function drawRing(dt) {
  if (!ST) return;
  const t = [Math.max(0, Math.min(1, hero.hp / ST.maxHp)), Math.max(0, Math.min(1, hero.mp / ST.maxMp)), hero.shield > 0 ? Math.min(1, hero.shield / ST.maxHp) : 0];
  const k = reduce || ringV[0] < 0 ? 1 : Math.min(1, (dt || .016) * 12);
  const ids = ["hpArc", "mpArc", "shArc"], arcs = [HP_ARC, MP_ARC, HP_ARC], rr = [RING_R, RING_R, RING_R + 5];
  for (let i = 0; i < 3; i++) {
    const v = Math.abs(t[i] - ringV[i]) < .001 ? t[i] : ringV[i] + (t[i] - ringV[i]) * k;
    if (v === ringV[i]) continue;
    ringV[i] = v;
    const a = arcs[i];
    $(ids[i]).setAttribute("d", v < .004 ? "" : arcD(rr[i], a[0], a[0] + (a[1] - a[0]) * v));
  }
  $("hpArc").setAttribute("stroke", t[0] < .3 ? "#ff6b6b" : "#5fd38d");
}
export function shellSvg(n, c, r, into) {
  const g = into || $("hShell"); g.innerHTML = ""; g.style.color = c;
  g.classList.toggle("glow", r >= 3);
  const A = extra => Object.assign({ fill: "none", stroke: c, "stroke-width": 2.5, "stroke-linejoin": "round", opacity: r === 0 ? .7 : 1 }, extra);
  if (n === "Ring") { svgEl("circle", A({ r: 19 }), g); if (r >= 2) svgEl("circle", A({ r: 24, "stroke-width": 1.5, "stroke-dasharray": "4 4" }), g); }
  else if (n === "Lattice") { svgEl("polygon", A({ points: polyPts(6, 22, 0, 0, 0) }), g); svgEl("polygon", A({ points: polyPts(6, 16, Math.PI / 6, 0, 0), "stroke-width": 1.2, "stroke-dasharray": "3 3" }), g); }
  else if (n === "Carapace") {
    for (let i = 0; i < 4; i++) {
      const a0 = i * Math.PI / 2 + .25, a1 = a0 + Math.PI / 2 - .5, R = 20;
      svgEl("path", A({ d: "M" + (Math.cos(a0) * R).toFixed(1) + " " + (Math.sin(a0) * R).toFixed(1) + " A" + R + " " + R + " 0 0 1 " + (Math.cos(a1) * R).toFixed(1) + " " + (Math.sin(a1) * R).toFixed(1), "stroke-width": 5, "stroke-linecap": "round" }), g);
    }
  } else if (n === "Aegis") { svgEl("polygon", A({ points: polyPts(3, 25, 0, 0, 0) }), g); svgEl("polygon", A({ points: polyPts(3, 25, Math.PI, 0, 0) }), g); }
  else if (n === "Bulwark") { svgEl("polygon", A({ points: polyPts(4, 22, 0, 0, 0) }), g); svgEl("polygon", A({ points: polyPts(4, 22, Math.PI / 4, 0, 0), "stroke-width": 1.5 }), g); }
  else vertices(8, 22, 0, 0, 0).forEach(([x, y]) => svgEl("polygon", { points: [[x, y - 4.5], [x + 3, y], [x, y + 4.5], [x - 3, y]].map(p => p.map(v => v.toFixed(1)).join(",")).join(" "), fill: c, opacity: r === 0 ? .7 : 1 }, g));
  if (r >= 4) svgEl("circle", { r: 28, fill: c, opacity: .08 }, g);
}
export function coronaSvg(n, c, r, into, into2) {
  const g = into || $("hCorona"), s = into2 || $("hCoronaStatic");
  g.innerHTML = ""; s.innerHTML = ""; g.style.color = s.style.color = c;
  g.classList.toggle("glow", r >= 3); s.classList.toggle("glow", r >= 3);
  if (n === "Sunburst") for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r2 = i % 2 ? 22 : 29; svgEl("line", { x1: (Math.cos(a) * 15).toFixed(1), y1: (Math.sin(a) * 15).toFixed(1), x2: (Math.cos(a) * r2).toFixed(1), y2: (Math.sin(a) * r2).toFixed(1), stroke: c, "stroke-width": 2, "stroke-linecap": "round" }, g); }
  else if (n === "Petal") for (let i = 0; i < 6; i++) svgEl("path", { d: "M0 -13 Q8 -22 0 -33 Q-8 -22 0 -13 Z", fill: c, opacity: .7, transform: "rotate(" + i * 60 + ")" }, g);
  else if (n === "Spire") for (let i = 0; i < 8; i++) svgEl("polygon", { points: i % 2 ? "-2,-14 0,-24 2,-14" : "-3,-14 0,-36 3,-14", fill: c, transform: "rotate(" + i * 45 + ")" }, g);
  else if (n === "Ember") for (let i = 0; i < 8; i++) svgEl("path", { d: "M0 -14 Q5 -21 0 -30 Q-5 -21 0 -14 Z", fill: c, opacity: i % 2 ? .55 : .95, transform: "rotate(" + i * 45 + ")" }, g);
  else if (n === "Halo") { svgEl("ellipse", { cx: 0, cy: -29, rx: 13, ry: 3.6, fill: "none", stroke: c, "stroke-width": 2.5 }, s); for (let i = 0; i < 6; i++) svgEl("circle", { cx: (Math.cos(i * Math.PI / 3) * 18).toFixed(1), cy: (Math.sin(i * Math.PI / 3) * 18).toFixed(1), r: 1.8, fill: c }, g); }
  else [-1, 1].forEach(side => [0, 1, 2].forEach(k => svgEl("path", { d: "M0 0 Q12 -10 26 -4 Q15 -1 0 3 Z", fill: c, opacity: (1 - k * .22).toFixed(2), transform: "translate(" + side * 14 + " " + (-3 + k * 5) + ") scale(" + side + " 1) rotate(" + (-20 + k * 18) + ")" }, s)));
}
export function lensSvg(n, c, r, into) {
  const g = into || $("hLens"); g.innerHTML = ""; g.style.color = c;
  g.classList.toggle("glow", r >= 2);
  const t = svgEl("g", { transform: into ? "" : "translate(0 28)" }, g);
  if (n === "Prism") svgEl("polygon", { points: "0,-6 5,0 0,6 -5,0", fill: c }, t);
  else if (n === "Eye") { svgEl("path", { d: "M-7 0 Q0 -7 7 0 Q0 7 -7 0 Z", fill: c }, t); svgEl("circle", { r: 2, fill: "#120f1c" }, t); }
  else if (n === "Sigil") svgEl("polygon", { points: polyPts(3, 6, 0, 0, 0), fill: c }, t);
  else if (n === "Moon") svgEl("path", { d: "M3 -5.2 A6 6 0 1 0 3 5.2 A5.5 5.5 0 0 1 3 -5.2 Z", fill: c }, t);
  else if (n === "Star") svgEl("polygon", { points: starPts(5, 7, 3), fill: c }, t);
  else { svgEl("polygon", { points: polyPts(6, 6.5, 0, 0, 0), fill: c }, t); svgEl("path", { d: "M0 0 L0 -6.5 M0 0 L5.6 3.2 M0 0 L-5.6 3.2", stroke: "#120f1c", "stroke-width": 1 }, t); }
}
function drawHero() {
  const w = S.equip.weapon, a = S.equip.armor, b = S.equip.boots, c = S.equip.charm, hw = $("hWeapon");
  hw.setAttribute("d", WEAPON[w ? weaponType(w) : "Mote"].path);
  hw.setAttribute("fill", w ? ARENA_C[w.r] : "#effffc");
  hw.style.color = w ? ARENA_C[w.r] : "#7be0d0";
  hw.classList.toggle("glow", !w || w.r >= 3);
  ORBITALS.slice(1).forEach(o => {
    const wo = o.open() ? S.equip[o.key] : null, el = $(o.ids[2]);
    $(o.ids[0]).style.display = wo ? "" : "none";
    if (wo) { el.setAttribute("d", WEAPON[weaponType(wo)].path); el.setAttribute("fill", ARENA_C[wo.r]); el.style.color = ARENA_C[wo.r]; el.classList.toggle("glow", wo.r >= 3); }
  });
  if (a) shellSvg(noun(a), ARENA_C[a.r], a.r); else $("hShell").innerHTML = "";
  if (b) coronaSvg(noun(b), ARENA_C[b.r], b.r); else { $("hCorona").innerHTML = ""; $("hCoronaStatic").innerHTML = ""; }
  if (c) lensSvg(noun(c), ARENA_C[c.r], c.r); else $("hLens").innerHTML = "";
  const sc = setCounts(); let best = null;
  for (const k in sc) if (sc[k] >= 2 && (!best || sc[k] > sc[best])) best = k;
  const aura = $("hAura");
  if (best) {
    aura.style.display = "";
    aura.setAttribute("fill", SET[best].col); aura.setAttribute("fill-opacity", sc[best] >= 4 ? .2 : .1);
    aura.setAttribute("stroke", SET[best].col); aura.setAttribute("stroke-dasharray", sc[best] >= 4 ? "none" : "3 5"); aura.setAttribute("stroke-width", 1.5);
  } else aura.style.display = "none";
}
const HERO_SPD = 170;
export let hvx = 0, hvy = 0, dashT = 0, dashIT = 0, dashVX = 0, dashVY = 0, dashHit = null, dashD = 0;
const DASH_TIME = .2;
export function startDash(L) {
  // direction: where you're steering, else where you're drifting, else straight away from the nearest foe
  let dx = hero.joyX, dy = hero.joyY;
  const kx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), ky = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (kx || ky) { dx = kx; dy = ky; }
  // a second finger on the button can briefly interrupt the stick, so fall back to the last steered direction
  if (Math.hypot(dx, dy) < .2 && performance.now() - lastDT < 900) { dx = lastDX; dy = lastDY; }
  if (Math.hypot(dx, dy) < .2) { dx = hvx; dy = hvy; }
  if (Math.hypot(dx, dy) < 5) {
    let best = null, bd = 1e9; for (const f of foes) { if (f.dead) continue; const d = Math.hypot(f.px - view.HERO_X, f.py - view.HERO_Y); if (d < bd) { bd = d; best = f; } }
    if (best) { dx = view.HERO_X - best.px; dy = view.HERO_Y - best.py; } else { dx = 0; dy = -1; }
  }
  const l = Math.hypot(dx, dy) || 1, v = SK.dash.dist(L) / DASH_TIME;
  dashVX = dx / l * v; dashVY = dy / l * v; dashT = DASH_TIME; dashIT = SK.dash.guard(L); dashHit = new Set(); dashD = SK.dash.dmg(L);
  const x0 = view.HERO_X, y0 = view.HERO_Y;
  dashD *= ST.dashPow; dashIT += ST.dashGuard;
  dashFrom = { x0, y0 };
  emit("dash", dashFrom);
  dashFx(x0, y0, x0 + dashVX * DASH_TIME, y0 + dashVY * DASH_TIME);
  heroModel.classList.add("dashing");
}
let lastDX = 0, lastDY = 0, lastDT = 0, dashFrom = null;
export function stepHero(dt) {
  let ix = hero.joyX, iy = hero.joyY;
  const kx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), ky = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (kx || ky) { const l = Math.hypot(kx, ky); ix = kx / l; iy = ky / l; }
  if (Math.hypot(ix, iy) > .2) { lastDX = ix; lastDY = iy; lastDT = performance.now(); }
  if (heroDown || paused()) { ix = 0; iy = 0; dashT = 0; }
  if (dashIT > 0) { dashIT -= dt; if (dashIT <= 0) heroModel.classList.remove("dashing"); }
  if (dashT > 0) {
    const st2 = Math.min(dt, dashT); dashT -= st2;
    view.HERO_X += dashVX * st2; view.HERO_Y += dashVY * st2;
    hvx = dashVX * .25; hvy = dashVY * .25;
    for (const f of foes) if (!f.dead && !dashHit.has(f) && Math.hypot(f.px - view.HERO_X, f.py - view.HERO_Y) < f.R + 34) { dashHit.add(f); land(f, dashD, "storm"); }
  }
  // the dash is over (or was cut short): effects that need where it ended hook dashEnd, with where it started
  if (dashFrom && !(dashT > 0)) { const c = dashFrom; dashFrom = null; emit("dashEnd", c); }
  const k = 1 - Math.exp(-dt * 18);
  const spd = HERO_SPD * (ST ? ST.move : 1);
  hvx += (ix * spd - hvx) * k; hvy += (iy * spd - hvy) * k;
  if (dashT > 0) {} else if (Math.abs(hvx) + Math.abs(hvy) > .5) {
    view.HERO_X += hvx * dt; view.HERO_Y += hvy * dt;
  } else { hvx = 0; hvy = 0; }
  const tx = view.HERO_X - VW / 2, ty = view.HERO_Y - VH * .49, c = 1 - Math.exp(-dt * 11);
  view.CAMX += (tx - view.CAMX) * c; view.CAMY += (ty - view.CAMY) * c;
  if (Math.abs(tx - view.CAMX) < .05 && Math.abs(ty - view.CAMY) < .05) { view.CAMX = tx; view.CAMY = ty; }
  view.VX0 = view.CAMX; view.VY0 = view.CAMY;
  applyCam(); placeBackdrop();
}

export const heal = n => { hero.hp = Math.min(ST.maxHp, hero.hp + emit("heal", { v: n }).v * ST.healMult); };

export function initHero() {
  $("hBarrier").setAttribute("points", polyPts(6, 31, Math.PI / 6, 0, 0));
  (function buildRing() {
    const segs = (arc, n) => { const L = RING_R * Math.abs(arc[1] - arc[0]) * Math.PI / 180, per = L / n; return (per - 1.7).toFixed(2) + " 1.7"; };
    [["hpTrack", HP_ARC], ["hpArc", HP_ARC], ["mpTrack", MP_ARC], ["mpArc", MP_ARC]].forEach(([id, arc]) => $(id).setAttribute("stroke-dasharray", segs(arc, 10)));
    $("hpTrack").setAttribute("d", arcD(RING_R, HP_ARC[0], HP_ARC[1]));
    $("mpTrack").setAttribute("d", arcD(RING_R, MP_ARC[0], MP_ARC[1]));
    const g = $("ringMarks");
    [HP_ARC[0], HP_ARC[1], MP_ARC[0], MP_ARC[1]].forEach(a => {
      const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
      svgEl("line", { x1: (c * (RING_R - 4)).toFixed(1), y1: (s * (RING_R - 4)).toFixed(1), x2: (c * (RING_R + 4)).toFixed(1), y2: (s * (RING_R + 4)).toFixed(1), stroke: "rgba(255,255,255,.35)", "stroke-width": 1 }, g);
    });
    svgEl("polygon", { points: polyPts(4, 2.6, 0, 0, -RING_R), fill: "rgba(255,255,255,.3)" }, g);
  })();
}
