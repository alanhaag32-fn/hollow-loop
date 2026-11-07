// Enemies on the field: their SVG, movement, targeting, spawning and each one's turn.
import { sfx } from "../audio/sound.js";
import { crush, heroDown } from "../combat/combat.js";
import { foeEmit } from "../core/stats.js";
import { $, polyPts, starPts, svgEl } from "../core/util.js";
import { MODS, ePts, eVerts, makeChild } from "./enemies.js";
import { FAR_RATE, enemyAttack } from "./shots.js";
import { ringIfRoom, shake, sparks, warnRing } from "../fx/effects.js";
import { anim, reduce } from "../fx/gfx.js";
import { ARENA_C } from "../gear/items.js";
import { RING_R, arcD } from "../hero/hero.js";
import { STATUS } from "../hero/statuses.js";
import { fightStage, mode } from "../modes/modes.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";
import { buildReticle, holdTag } from "../ui/reticle.js";
import { ARENA_B, ARENA_T, ENGAGE, SC, VH, VW, VX1, VY1, setZone, view } from "../world/scene.js";

const FOE_TPL = '<g class="eModel"><g class="hover"><g class="eBody"><g class="eSpin"><g class="eRing"></g><polygon class="ePlate" fill="none" stroke-width="3" stroke-linejoin="round"/><g class="eSpikes"></g><polygon class="ePoly" stroke-width="2.5" stroke-linejoin="round"/><polygon class="eInner" fill="none" stroke-width="1.5" opacity=".7"/><g class="eDeco"></g><g class="eCracks" style="display:none"></g></g><g class="eTrail"></g><g class="eCrown"></g><circle class="eEye" r="5" fill="#fff"/><circle class="ePupil" r="2.2"/></g><g class="eFacetWrap"><g class="eFacets spinSlow"></g></g><g class="eMoteWrap"><g class="eMotes spinRev"></g></g><g class="eModMarks"></g><g class="eArm"><g class="eSwing"><g class="eAim"><path class="eWeapon" stroke="#000" stroke-opacity=".35" stroke-width="1"/><g transform="translate(0 -22)"><g class="eSaw sawSpin"></g></g></g></g></g></g></g><g class="eMini" fill="none"><path class="mBg" stroke="rgba(255,255,255,.14)" stroke-width="2.2"/><path class="mFg" stroke="#ff6b6b" stroke-width="2.2"/></g>';
export const foes = [];
export let moveT = 0;
export const targeting = {
  focus: null
};
function makeFoeEl() {
  const g = svgEl("g", { class: "ePos" }, $("foes"));
  g.innerHTML = FOE_TPL;
  const q = c => g.querySelector("." + c);
  const el = { pos: g };
  [["model", "eModel"], ["hov", "hover"], ["body", "eBody"], ["spin", "eSpin"], ["trail", "eTrail"], ["ring", "eRing"], ["plate", "ePlate"], ["spikes", "eSpikes"], ["poly", "ePoly"], ["inner", "eInner"], ["deco", "eDeco"], ["cracks", "eCracks"], ["crown", "eCrown"], ["eye", "eEye"], ["pupil", "ePupil"], ["facetWrap", "eFacetWrap"], ["facets", "eFacets"], ["moteWrap", "eMoteWrap"], ["motes", "eMotes"], ["modMarks", "eModMarks"], ["arm", "eArm"], ["swing", "eSwing"], ["aim", "eAim"], ["weapon", "eWeapon"], ["saw", "eSaw"], ["mini", "eMini"], ["mBg", "mBg"], ["mFg", "mFg"]].forEach(([k, c]) => el[k] = q(c));
  el.hov.style.animationDelay = "-" + (Math.random() * 2).toFixed(2) + "s";
  el.ind = svgEl("g", { style: "display:none" }, $("inds"));
  el.indP = svgEl("polygon", { points: "8,0 -4,-6 -1,0 -4,6", stroke: "#000", "stroke-opacity": .4, "stroke-width": 1 }, el.ind);
  return el;
}
export const fdir = e => e && e.px < view.HERO_X ? 1 : -1;
export function setFoePos(e) {
  if (!e.el) return;
  e.el.pos.setAttribute("transform", "translate(" + e.px.toFixed(1) + " " + (e.py - e.cy).toFixed(1) + ")");
}
// translate toward (d > 0) or away from (d < 0) the hero
export function lungeT(e, d) {
  const dx = view.HERO_X - e.px, dy = view.HERO_Y - e.py, L = Math.hypot(dx, dy) || 1;
  return "translate(" + (d * dx / L).toFixed(1) + "px," + (d * dy / L).toFixed(1) + "px)";
}
// each frame: the body turns slowly, the weapon slides along its edges and keeps aiming at the core, the eye watches the core
export function poseFoe(e, dt) {
  const E = e.el; if (!E) return;
  if (!reduce && dt) e.rot += e.spinV * dt;
  const cy = e.cy, n = e.sides, seg = 2 * Math.PI / n;
  E.spin.setAttribute("transform", "rotate(" + (e.rot * 57.2958).toFixed(2) + " 0 " + cy.toFixed(1) + ")");
  // the weapon glides along the edges but stays on the side facing the core, sweeping slowly back and forth
  const toH = Math.atan2(view.HERO_Y - e.py, view.HERO_X - e.px);
  if (!reduce && dt) e.wt += dt;
  const goal = toH + (reduce ? 0 : Math.sin(e.wt * e.wf + e.wBase) * .75);
  if (!(e.wAng === e.wAng)) e.wAng = goal;
  let wd = goal - e.wAng; wd = Math.atan2(Math.sin(wd), Math.cos(wd));
  e.wAng += reduce || !dt ? wd : wd * (1 - Math.exp(-dt * 3));
  const wa = e.wAng;
  let rel = wa - (e.rot - Math.PI / 2 + seg / 2);
  rel = ((rel % seg) + seg) % seg; if (rel > seg / 2) rel -= seg;
  const Rb = e.R + (e.tier >= 1 ? 5 : e.v.id === "bastion" ? 3.5 : 0) + 1.5;
  const dist = Rb * Math.cos(Math.PI / n) / Math.cos(rel);
  const mx = Math.cos(wa) * dist, my = cy + Math.sin(wa) * dist;
  const hx = view.HERO_X - e.px, hy = view.HERO_Y - e.py, hd = Math.hypot(hx, hy) || 1, ux = hx / hd, uy = hy / hd;
  const aim = Math.atan2(hy - (my - cy), hx - mx) * 57.2958;
  E.arm.setAttribute("transform", "translate(" + mx.toFixed(1) + " " + my.toFixed(1) + ") rotate(" + (aim + 90).toFixed(1) + ")");
  e.wx = e.px + mx; e.wy = e.py + my - cy; e.wa = aim;
  const ex = ux * e.R * .2, ey = cy + uy * e.R * .2;
  E.eye.setAttribute("cx", ex.toFixed(1)); E.eye.setAttribute("cy", ey.toFixed(1));
  E.pupil.setAttribute("cx", (ex + ux * 2).toFixed(1)); E.pupil.setAttribute("cy", (ey + uy * 2).toFixed(1));
  const off = e.px < view.VX0 - 4 || e.px > VX1() + 4 || e.py < view.VY0 - 4 || e.py > VY1() + 4;
  if (off !== e.offShown) { e.offShown = off; E.ind.style.display = off ? "" : "none"; }
  if (off) {
    const top = view.VY0 + 128 / SC, bot = VY1() - 96 / SC;
    const ix = Math.max(view.VX0 + 12, Math.min(VX1() - 12, e.px)), iy = Math.max(top, Math.min(bot, e.py));
    E.ind.setAttribute("transform", "translate(" + ix.toFixed(1) + " " + iy.toFixed(1) + ") rotate(" + (Math.atan2(e.py - iy, e.px - ix) * 57.2958).toFixed(0) + ")");
  }
  if (e.v.id === "pale") E.trail.setAttribute("transform", "rotate(" + (Math.atan2(-uy, -ux) * 57.2958).toFixed(1) + " 0 " + cy.toFixed(1) + ")");
}
function spinInit(e) {
  e.rot = Math.random() * 6.28;
  e.spinV = e.v.spin * (.8 + Math.random() * .4) * (e.boss ? .6 : 1) * (Math.random() < .5 ? -1 : 1);
  e.wBase = Math.random() * 6.28; e.wt = 0; e.wf = .45 + Math.random() * .3; e.wAng = NaN;
  e.curl = (.15 + Math.random() * .3) * (Math.random() < .5 ? -1 : 1);
  e.orb = (16 + Math.random() * 14) * e.v.move * (e.boss ? .5 : 1) * pace() * (Math.random() < .5 ? -1 : 1);
  e.rf = .4 + Math.random() * .4; e.jT = .8 + Math.random() * 2;
}
export const inView = f => { const m = f.R + 60; return f.px > view.VX0 - m && f.px < VX1() + m && f.py > view.VY0 - m && f.py < VY1() + m; };
export function syncTarget() { if (enemy) { view.ENEMY_X = enemy.px; view.ENEMY_Y = enemy.py - enemy.cy; } }
export function setTarget(t) {
  if (enemy && enemy.el) { enemy.el.mini.style.display = ""; enemy.el.modMarks.style.display = ""; }
  if (t !== enemy) holdTag();
  enemy = t;
  buildReticle(t);
  if (!t) return;
  t.el.mini.style.display = "none"; t.el.modMarks.style.display = "none";
  $("eName").textContent = t.name;
  $("eMods").innerHTML = t.statuses.list.map(id => '<span class="sts" style="--sc:' + STATUS[id].col + '" title="' + STATUS[id].desc + '">' + STATUS[id].name + "</span>").join("") + t.mods.map(k => '<span title="' + MODS[k].desc + '">' + MODS[k].name + "</span>").join("");
  syncTarget();
}
export function pickTarget() {
  let t = targeting.focus && !targeting.focus.dead && foes.includes(targeting.focus) && inView(targeting.focus) ? targeting.focus : null;
  if (!t) {
    targeting.focus = null; let bd = 1e9;
    const score = f => Math.hypot(f.px - view.HERO_X, f.py - view.HERO_Y) + (f.px < view.VX0 || f.px > VX1() || f.py < view.VY0 || f.py > VY1() ? 400 : 0);
    for (const f of foes) { if (f.dead || !inView(f)) continue; const d = score(f); if (d < bd) { bd = d; t = f; } }
    // stick with the current target unless another is clearly closer, so aim and labels don't flicker
    if (t && enemy && t !== enemy && !enemy.dead && foes.includes(enemy) && inView(enemy) && score(enemy) < bd + 40) t = enemy;
  }
  if (t !== enemy) setTarget(t);
}
export function pickSpawnAngle() {
  const used = foes.filter(f => !f.dead).map(f => Math.atan2(f.py - view.HERO_Y, f.px - view.HERO_X));
  let best = 0, bestD = -1;
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = used.length ? Math.min(...used.map(u => Math.abs(((a - u + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI))) : 9;
    if (d > bestD) { bestD = d; best = a; }
  }
  return best;
}
// a new enemy enters from the edge of the screen, toward angle angIn (random if left out), extra units further out
export function spawnFoe(e, angIn, extra) {
  setZone();
  const ang = angIn == null ? pickSpawnAngle() : angIn, c = Math.cos(ang), sn = Math.sin(ang);
  const tx = c > 0 ? (VX1() - view.HERO_X) / c : c < 0 ? (view.VX0 - view.HERO_X) / c : 1e9, ty = sn > 0 ? (VY1() - view.HERO_Y) / sn : sn < 0 ? (view.VY0 - view.HERO_Y) / sn : 1e9;
  const dist = Math.min(tx, ty) + e.R + 45 + (extra || 0);
  e.px = view.HERO_X + c * dist; e.py = view.HERO_Y + sn * dist;
  e.stopR = ENGAGE + (e.boss ? 36 : e.elite ? 10 : 0) + Math.random() * 14 - 4;
  const mv = e.v.move * pace();
  e.speed = Math.max(55, Math.min(170, (dist - e.stopR) / 3.5)) * mv * (e.boss ? .7 : e.elite ? .85 : 1);
  e.cruise = (55 + Math.random() * 25) * mv * (e.boss ? .55 : e.elite ? .8 : 1);
  e.ph = Math.random() * 6.28; e.arrived = false; e.age = 0; e.cd = .5 + Math.random() * .7;
  e.vx = -c * e.speed * .5; e.vy = -sn * e.speed * .5;
  spinInit(e); newWaypoint(e, true);
  return placeFoe(e, 500);
}
// a Splitting enemy's smaller copy, right where it died
export function spawnChild(parent) {
  const e = makeChild(parent);
  Object.assign(e, { px: parent.px, py: parent.py, arrived: parent.arrived, speed: parent.speed, cruise: parent.cruise, stopR: parent.stopR, age: parent.age, ph: Math.random() * 6.28, vx: 0, vy: 0, cd: .8, removed: false, el: null });
  spinInit(e); newWaypoint(e, !e.arrived);
  return placeFoe(e, 200);
}
function placeFoe(e, fadeMs) {
  e.cy = -e.R - 12; e.el = makeFoeEl();
  drawFoe(e); setFoePos(e); poseFoe(e, 0);
  foes.push(e);
  anim(e.el.model, [{ opacity: 0 }, { opacity: 1 }], fadeMs);
  if (e.boss) { log("A " + e.name + " drifts in. Defeat it within " + Math.round(e.timer) + "s of it reaching you", e.tone || "r4"); shake(6, 400); sfx("bossIn"); }
  else if (e.elite) { log("An " + e.name + " is closing in", "r3"); sfx("eliteIn"); }
  return e;
}
function arrive(e) { e.arrived = true; setFoePos(e); }
// free roaming: each foe wanders between waypoints around the core. The roaming area starts wide
// and tightens, so foes drift around while honing in on you
function roamR(e) {
  const far = Math.max(e.stopR + 60, Math.hypot(VW, VH) * .36), near = e.stopR + (e.boss ? 20 : 35);
  const f = Math.min(1, (e.age || 0) / (e.boss ? 8 : 12));
  return { lo: e.stopR * .85, hi: far + (near - far) * f };
}
export function newWaypoint(e, first) {
  const { lo, hi } = roamR(e), cur = Math.atan2(e.py - view.HERO_Y, e.px - view.HERO_X);
  const m = e.R + 12, x0 = view.VX0 + m, x1 = VX1() - m, y0 = view.VY0 + ARENA_T + m, y1 = view.VY0 + ARENA_B - m;
  for (let k = 0; k < 6; k++) {
    const a = cur + (Math.random() * 2 - 1) * (first ? .45 : 1.5), c = Math.cos(a), sn = Math.sin(a);
    // how far the visible arena reaches from the core in this direction, so waypoints spread across the screen
    const room = Math.min(c > 0 ? (x1 - view.HERO_X) / c : c < 0 ? (x0 - view.HERO_X) / c : 1e9, sn > 0 ? (y1 - view.HERO_Y) / sn : sn < 0 ? (y0 - view.HERO_Y) / sn : 1e9);
    const top = Math.min(hi, room);
    if (top < lo + 10 && k < 5) continue;
    const r = first ? Math.min(top, e.stopR + Math.random() * Math.max(10, Math.min(130, top - e.stopR))) : lo + Math.random() * Math.max(0, top - lo);
    e.gx = view.HERO_X + c * r; e.gy = view.HERO_Y + sn * r; break;
  }
  e.gx = Math.max(x0, Math.min(x1, e.gx)); e.gy = Math.max(y0, Math.min(y1, e.gy));
  e.wT = (1.5 + Math.random() * 2.2) / (.6 + sporadic() * .5);
}
// smooth floating: each foe steers toward a target velocity with inertia, curving in, easing to a stop,
// then drifting slowly around the core while keeping its distance from other foes
const pace = () => 1 + Math.min(.55, (fightStage() - 1) * .008);
const sporadic = () => Math.min(1.05, .45 + fightStage() * .01);
let bumpFxT = 0;
export function moveFoes(dt) { while (dt > 1e-4) { const h = Math.min(dt, .05); moveStep(h); dt -= h; } }
function moveStep(dt) {
  moveT += dt; bumpFxT -= dt;
  const k = 1 - Math.exp(-dt * 2.2), spor = sporadic();
  for (const e of foes) {
    if (e.dead) continue;
    let tx = 0, ty = 0;
    e.age = (e.age || 0) + dt;
    if (!(e.stun > 0)) {
      if (e.gx == null) newWaypoint(e, !e.arrived);
      let wx = e.gx - e.px, wy = e.gy - e.py, wd = Math.hypot(wx, wy) || 1;
      if (e.arrived) {
        e.wT -= dt;
        if (Math.hypot(e.gx - view.HERO_X, e.gy - view.HERO_Y) > roamR(e).hi + 140) e.wT = 0;
      }
      if (wd < 16 || e.wT <= 0 || (!e.arrived && e.age > 7)) {
        if (!e.arrived) arrive(e);
        newWaypoint(e); wx = e.gx - e.px; wy = e.gy - e.py; wd = Math.hypot(wx, wy) || 1;
      }
      // head for the waypoint on a gently curving path, easing off as it gets close
      const hd0 = Math.hypot(e.px - view.HERO_X, e.py - view.HERO_Y);
      const sp = (e.arrived ? e.cruise : e.speed) * Math.max(.35, Math.min(1, wd / 60)) * (1 + Math.min(1.5, Math.max(0, hd0 - 260) / 220));
      const curl = (e.curl + (reduce ? 0 : Math.sin(moveT * .7 + e.ph) * .25)) * Math.min(1, wd / 120);
      const c = Math.cos(curl), sn = Math.sin(curl), ux = wx / wd, uy = wy / wd;
      tx = (ux * c - uy * sn) * sp; ty = (ux * sn + uy * c) * sp;
      if (e.arrived) {
        const m = e.R + 6;
        const L = view.VX0 + m, R = VX1() - m, Tp = view.VY0 + ARENA_T + m, B = view.VY0 + ARENA_B - m, cap = 90;
        if (e.px < L) tx += Math.min(cap, (L - e.px) * 3); else if (e.px > R) tx -= Math.min(cap, (e.px - R) * 3);
        if (e.py < Tp) ty += Math.min(cap, (Tp - e.py) * 3); else if (e.py > B) ty -= Math.min(cap, (e.py - B) * 3);
      }
      // sporadic jinks
      if (!reduce) {
        e.jT = (e.jT || 1) - dt;
        if (e.jT <= 0) {
          e.jT = (1.4 + Math.random() * 2.4) / (.5 + spor * .7);
          const a = Math.random() * 6.28, mj = (22 + Math.random() * 30) * spor * (e.boss ? .5 : 1);
          e.vx += Math.cos(a) * mj; e.vy += Math.sin(a) * mj;
          if (e.arrived && Math.random() < .25) newWaypoint(e);
        }
      }
    }
    e.vx = (e.vx || 0) + (tx - (e.vx || 0)) * k; e.vy = (e.vy || 0) + (ty - (e.vy || 0)) * k;
    const sf = e.slowT > performance.now() ? .8 : 1;
    e.px += e.vx * dt * sf; e.py += e.vy * dt * sf;
    if (e.kb > .05) {
      const push = e.kb * Math.min(1, dt * 6); e.kb -= push;
      const hx = e.px - view.HERO_X, hy = e.py - view.HERO_Y, hd = Math.hypot(hx, hy) || 1, nx = e.px + hx / hd * push, ny = e.py + hy / hd * push, mm = e.R + 6;
      // never push a foe into the screen edge, where the wall would shove it straight back
      if (!e.arrived || (nx > view.VX0 + mm && nx < VX1() - mm && ny > view.VY0 + ARENA_T + mm && ny < view.VY0 + ARENA_B - mm)) { e.px = nx; e.py = ny; } else e.kb = 0;
    }
  }
  // bumps: foes bounce off each other and off the core's ring
  for (let i = 0; i < foes.length; i++) {
    const a = foes[i]; if (a.dead) continue;
    for (let j = i + 1; j < foes.length; j++) {
      const b = foes[j]; if (b.dead) continue;
      const sx = b.px - a.px, sy = b.py - a.py, sd = Math.hypot(sx, sy) || .01, mn = a.R + b.R + 10;
      if (sd >= mn) continue;
      const nx = sx / sd, ny = sy / sd, ov = mn - sd, wa = a.boss ? .15 : b.boss ? .85 : .5;
      a.px -= nx * ov * wa; a.py -= ny * ov * wa; b.px += nx * ov * (1 - wa); b.py += ny * ov * (1 - wa);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const jm = -1.8 * rv / 2;
        a.vx -= jm * nx * (a.boss ? .3 : 1); a.vy -= jm * ny * (a.boss ? .3 : 1); b.vx += jm * nx * (b.boss ? .3 : 1); b.vy += jm * ny * (b.boss ? .3 : 1);
        if (bumpFxT <= 0 && rv < -15 && !document.hidden) { bumpFxT = .15; sparks(a.px + nx * a.R, a.py + ny * a.R, 3, "#fff", 10); }
      }
    }
    const hx = a.px - view.HERO_X, hy = a.py - view.HERO_Y, hd = Math.hypot(hx, hy) || .01, mh = RING_R + a.R + 4;
    if (hd < mh) {
      const nx = hx / hd, ny = hy / hd;
      a.px = view.HERO_X + nx * mh; a.py = view.HERO_Y + ny * mh;
      const vr = a.vx * nx + a.vy * ny;
      if (vr < 0) {
        a.vx -= 1.9 * vr * nx; a.vy -= 1.9 * vr * ny;
        if (!document.hidden && vr < -12) ringIfRoom(view.HERO_X + nx * RING_R, view.HERO_Y + ny * RING_R, "#9ff3e6", .3, 1.1, 240, 2);
      }
    }
  }
  for (const e of foes) if (!e.dead) setFoePos(e);
}
// a tiny kickback along the line of fire when something hits an enemy
export function knock(e, m) {
  if (!e || e.dead || reduce) return;
  // builds a small pending push away from the core that plays out over ~0.1s, capped so rapid hits can't stack it up
  m *= (e.boss ? .15 : e.elite ? .35 : 1) * .25;
  e.kb = Math.min(e.boss ? 2 : e.elite ? 4 : 6, (e.kb || 0) + m);
}
export function removeFoe(e, fade) {
  const i = foes.indexOf(e); if (i >= 0) foes.splice(i, 1);
  if (e.el && e.el.ind) e.el.ind.remove();
  if (targeting.focus === e) targeting.focus = null;
  if (enemy === e) setTarget(null);
  const g = e.el && e.el.pos;
  if (!g) return;
  if (fade && !reduce) { anim(g, [{ opacity: 1 }, { opacity: 0 }], 300); setTimeout(() => g.remove(), 290); } else g.remove();
}
export function clearFoes(fade) { foes.slice().forEach(f => removeFoe(f, fade)); setTarget(null); targeting.focus = null; }
export let enemy = null;
function drawFoe(e) {
  const E = e.el, h = e.hue, cy = e.cy, tc = ARENA_C[e.tier];
  E.indP.setAttribute("fill", e.stroke); E.indP.setAttribute("transform", e.boss ? "scale(1.5)" : e.elite ? "scale(1.25)" : "");
  E.poly.setAttribute("points", ePts(e, e.R, 0, 0, cy));
  E.poly.setAttribute("fill", e.fill);
  E.poly.setAttribute("stroke", e.stroke);
  E.inner.setAttribute("points", e.shape ? ePts(e, e.R * .5, 0, 0, cy) : polyPts(e.sides, e.R * .55, Math.PI / e.sides, 0, cy));
  E.inner.setAttribute("stroke", e.stroke);
  drawVariant(e, cy);
  const plate = E.plate;
  plate.style.display = e.tier >= 1 ? "" : "none";
  plate.setAttribute("points", ePts(e, e.R + 5, 0, 0, cy));
  plate.setAttribute("stroke", tc);
  const spikes = E.spikes; spikes.innerHTML = "";
  if (e.tier >= 2) eVerts(e, e.R + 5, 0, 0, cy).forEach(([x, y]) => {
    const ang = Math.atan2(y - cy, x), px = -Math.sin(ang) * 4, py = Math.cos(ang) * 4;
    svgEl("polygon", { points: (x + px) + "," + (y + py) + " " + (x + Math.cos(ang) * 10) + "," + (y + Math.sin(ang) * 10) + " " + (x - px) + "," + (y - py), fill: tc }, spikes);
  });
  spikes.style.color = tc; spikes.classList.toggle("glow", e.tier >= 4);
  const crown = E.crown; crown.innerHTML = "";
  const top = cy - e.R - 8;
  if (e.boss) {
    svgEl("path", { d: "M-14 " + (top + 6) + " L-10 " + (top - 8) + " L-4 " + (top + 1) + " L0 " + (top - 12) + " L4 " + (top + 1) + " L10 " + (top - 8) + " L14 " + (top + 6) + " Z", fill: ARENA_C[4] }, crown);
    crown.style.color = ARENA_C[4]; crown.classList.add("glow");
  } else if (e.elite) {
    svgEl("path", { d: "M-16 " + (top + 10) + " L-22 " + (top - 10) + " L-7 " + (top + 6) + " Z M16 " + (top + 10) + " L22 " + (top - 10) + " L7 " + (top + 6) + " Z", fill: "#ff6b6b" }, crown);
    crown.style.color = "#ff6b6b"; crown.classList.add("glow");
  } else crown.classList.remove("glow");
  const ring = E.ring; ring.innerHTML = "";
  if (e.elite) svgEl("circle", { cx: 0, cy, r: e.R + 12, fill: "none", stroke: "#ff6b6b", "stroke-width": 1.5, "stroke-dasharray": "5 5", opacity: .8 }, ring);
  E.pupil.setAttribute("fill", e.elite ? "#ff3b3b" : "hsl(" + ((h + 180) % 360) + " 90% 45%)");
  const ew = E.weapon;
  ew.setAttribute("d", e.weapon); ew.setAttribute("fill", tc); ew.style.color = tc; ew.classList.toggle("glow", e.tier >= 3);
  const saw = E.saw; saw.innerHTML = "";
  if (e.v.id === "crimson") { svgEl("polygon", { points: starPts(10, 11, 7.5), fill: tc, stroke: "#000", "stroke-opacity": .35 }, saw); svgEl("circle", { r: 3, fill: "#120f1c" }, saw); }
  E.facetWrap.setAttribute("transform", "translate(0 " + cy + ")");
  E.moteWrap.setAttribute("transform", "translate(0 " + cy + ")");
  // targeted: a segmented ring; everyone else: a short arc underneath
  e.ringR = e.R + (e.boss ? 24 : e.tier >= 2 ? 21 : 15);
  e.mr = e.R + (e.tier >= 2 ? 19 : e.elite ? 17 : 11);
  E.mini.setAttribute("transform", "translate(0 " + cy + ")");
  E.mBg.setAttribute("d", arcD(e.mr, 40, 140)); e.mFrac = -1;
  const mm = E.modMarks; mm.innerHTML = "";
  mm.setAttribute("transform", "translate(0 " + (cy + e.mr + 4).toFixed(1) + ")");
  e.mods.forEach((k, i) => { const x = (i - (e.mods.length - 1) / 2) * 11; svgEl("polygon", { points: x + ",0 " + (x + 4) + ",5 " + x + ",10 " + (x - 4) + ",5", fill: "#ff8463" }, mm); });
}
function drawVariant(e, cy) {
  const v = e.v, g = e.el.deco, poly = e.el.poly, inner = e.el.inner, R = e.R;
  g.innerHTML = ""; e.el.trail.innerHTML = "";
  poly.setAttribute("stroke-width", v.id === "bastion" ? 5 : v.id === "pale" ? 1.5 : 2.5);
  poly.setAttribute("stroke-dasharray", v.id === "umbral" ? "7 4" : "none");
  inner.setAttribute("fill", v.id === "bastion" ? "hsl(" + v.hue + " " + v.sat + "% " + (v.lit - 14) + "%)" : "none");
  inner.setAttribute("stroke-dasharray", v.id === "pale" ? "3 3" : "none");
  inner.setAttribute("opacity", v.id === "bastion" ? 1 : .7);
  e.el.model.classList.toggle("umbral", v.id === "umbral");
  const verts = eVerts(e, R, 0, 0, cy);
  if (v.id === "pale") {
    svgEl("polygon", { points: ePts(e, R, 0, 9, cy), fill: "none", stroke: e.stroke, "stroke-width": 1, opacity: .3 }, g);
    [-8, 0, 8].forEach((dy, i) => svgEl("line", { x1: R * .95, y1: cy + dy, x2: R * .95 + 10 + i * 4, y2: cy + dy, stroke: e.stroke, "stroke-width": 1.5, "stroke-linecap": "round", opacity: .55 }, e.el.trail));
  } else if (v.id === "bastion") {
    verts.forEach(([x, y]) => svgEl("circle", { cx: (x * .78).toFixed(1), cy: (cy + (y - cy) * .78).toFixed(1), r: 2.4, fill: e.stroke }, g));
    svgEl("polygon", { points: ePts(e, R + 3.5, 0, 0, cy), fill: "none", stroke: "hsl(" + v.hue + " 20% 25%)", "stroke-width": 2 }, g);
  } else if (v.id === "crimson") {
    verts.forEach(([x, y], i) => {
      const [x2, y2] = verts[(i + 1) % verts.length], mx = (x + x2) / 2, my = (y + y2) / 2, a = Math.atan2(my - cy, mx), px = -Math.sin(a) * 3.5, py = Math.cos(a) * 3.5;
      svgEl("polygon", { points: (mx + px).toFixed(1) + "," + (my + py).toFixed(1) + " " + (mx + Math.cos(a) * 9).toFixed(1) + "," + (my + Math.sin(a) * 9).toFixed(1) + " " + (mx - px).toFixed(1) + "," + (my - py).toFixed(1), fill: e.stroke }, g);
    });
    svgEl("path", { d: "M" + (-R * .45) + " " + (cy + R * .35) + " L" + (R * .4) + " " + (cy - R * .3), stroke: "#2a0606", "stroke-width": 2.5, "stroke-linecap": "round" }, g);
  } else {
    svgEl("circle", { cx: 0, cy, r: R * .32, fill: "#07050d", stroke: e.stroke, "stroke-width": 1.5 }, g);
    [0, 1, 2].forEach(i => { const a = i * 2.09 + .5; svgEl("circle", { cx: (Math.cos(a) * (R + 9)).toFixed(1), cy: (cy + Math.sin(a) * (R + 9)).toFixed(1), r: 2, fill: e.stroke, opacity: .6 }, g); });
  }
}
export function stepFoe(e, dt) {
  if (e.dead || !foes.includes(e)) return;
  if (e.slowT > performance.now()) dt *= .8;
  foeEmit(e, "tick", { dt });
  if (e.stun > 0) { e.stun -= dt; if (e.stun <= 0) e.el.model.classList.remove("stun"); }
  if (e.boss && e.arrived) {
    e.timer -= dt;
    if (e.timer <= 0) { mode.escape(); return; }
    if (!e.enraged && e.timer <= 10) { e.enraged = true; e.el.model.classList.add("enr"); log(e.name + " is enraged", "bad"); }
    if (!(e.stun > 0)) {
      if (e.tele > 0) {
        e.tele -= dt;
        if (e.tele <= 0) { crush(e); if (heroDown) return; }
      } else {
        e.specT -= dt;
        if (e.specT <= 0) { e.specT = 6.5; e.tele = 1.3; e.crX = view.HERO_X; e.crY = view.HERO_Y; e.el.model.classList.add("tele"); warnRing(1.3); sfx("warn"); floatText("Crush incoming", "hurt", e); }
      }
      foeEmit(e, "bossTurn", { dt });
      if (heroDown || e.dead) return;
    }
  }
  e.cd -= dt;
  if (e.cd <= 0 && !(e.tele > 0) && !(e.stun > 0)) { e.cd += 1 / foeEmit(e, "attackRate", { v: e.v.spd }).v * (e.arrived ? 1 : FAR_RATE); enemyAttack(e); }
}
