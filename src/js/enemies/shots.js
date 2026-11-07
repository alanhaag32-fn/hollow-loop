// Enemy attacks: projectiles, beams and lobs that land on the hero.
import { field, heroDown, hurt, land } from "../combat/combat.js";
import { ST, foeEmit } from "../core/stats.js";
import { fmt, polyPts, starPts, svgEl } from "../core/util.js";
import { lungeT } from "./foes.js";
import { fx, moveFx, ringIfRoom, shake, sparks, tempFx } from "../fx/effects.js";
import { ARENA_C, anim, reduce } from "../fx/gfx.js";

import { dashIT, hero, hvx, hvy } from "../hero/hero.js";
import { applyStatus } from "../hero/statuses.js";
import { fightStage } from "../modes/modes.js";
import { floatText } from "../ui/floats.js";
import { VX1, VY1, view } from "../world/scene.js";

// every enemy attack is a projectile or beam; the damage lands when it reaches the core
const FAR_DMG = .4;
export const FAR_RATE = 1.5;
let lastBurnFloat = 0;
export function enemyAttack(e) {
  const heavy = !!(e.v.crit && Math.random() < e.v.crit), dmg = e.dmg * (e.enraged ? 2 : 1) * (heavy ? 2 : 1) * (.9 + Math.random() * .2) * (e.arrived ? 1 : FAR_DMG);
  let statusDone = false;
  const land = (mult) => {
    if (heroDown) return;
    const landed = hurt(dmg * (mult || 1), false, e);
    if (e.boss) shake(3, 160);
    if (!landed || heroDown) return;
    if (heavy) { shake(5, 200); floatText("Heavy blow", "hurt", "hero"); }
    if (e.v.burn) { const b = Math.min(hero.mp, 100 * e.v.burn); hero.mp -= b; if (b > 1 && performance.now() - lastBurnFloat > 900) { lastBurnFloat = performance.now(); floatText("-" + fmt(b) + " mana", "info", "hero", "#6aa8ff"); } }

    if (statusDone) return; statusDone = true;
    foeEmit(e, "landed", {});
    e.statuses.list.forEach(id => { if (Math.random() < e.statuses.chance) applyStatus(id, 5, false, e); });
  };
  // on screen, shots are real projectiles you can sidestep; from off screen they still land on their own
  const mx = e.wx != null ? e.wx : e.px, my = e.wy != null ? e.wy : e.py;
  if (!document.hidden && mx > view.VX0 - 30 && mx < VX1() + 30 && my > view.VY0 - 30 && my < VY1() + 30) { fireShot(e, heavy, land); return; }
  if (field.decoy) return;
  const t = enemyAttackFx(e, heavy);
  if (t > 0 && !document.hidden) setTimeout(() => land(), t); else land();
}
const eshots = [];
// Each variant's attack. spd, r: its projectile's speed and size. shot(e, heavy, land, tc, sp): fired on screen as real
// projectiles you can sidestep. far(e, heavy, k): how it looks from off screen, where it can't miss; returns the ms until
// it lands. k holds the shooter's aim helpers (see enemyAttackFx).
const ATTACK = {
  // twin darts: fast, aimed ahead of you, slight homing
  pale: { spd: 560, r: 4.5, shot(e, heavy, land, tc, sp) {
    [0, 1].forEach(i => setTimeout(() => {
      if (e.dead || heroDown) return;
      kick(e, 4, 120);
      const a = aimFrom(e), sd = i ? 4 : -4, g = svgEl("g", {}, fx);
      svgEl("line", { x1: -16, y1: 0, x2: -4, y2: 0, stroke: tc, "stroke-width": 1.6, "stroke-linecap": "round", opacity: .6 }, g);
      svgEl("polygon", { points: "-7,-2.2 8,0 -7,2.2", fill: "#fff" }, g);
      const o = addShot({ src: e, g, x: a.x - a.uy * sd, y: a.y + a.ux * sd, vx: a.ux * sp.spd, vy: a.uy * sp.spd, r: sp.r, deg: a.deg, life: (a.d + 220) / sp.spd, hit: () => land(.5), col: tc, home: 1.4 * shotSkill(e), homeT: .35 });
      const [lx, ly] = leadPt(o.x, o.y, sp.spd, Math.min(1, (.4 + Math.random() * .7) * shotSkill(e))); steer(o, lx, ly); placeShot(o);
    }, i * 110));
  }, far(e, heavy, { tc, aim, hitPt, recoil, flash, travel }) {
    // needler: two quick darts, one from each barrel
    const T = travel(620, 140, 700);
    [0, 1].forEach(i => setTimeout(() => {
      if (e.dead) return;
      recoil(4, 120);
      if (reduce) return;
      const a = aim(), sd = i ? 4 : -4, sx = a.mx - a.uy * sd, sy = a.my + a.ux * sd, [hx, hy] = hitPt(a);
      flash(sx, sy, 3.5, "#fff");
      const g = svgEl("g", {}), rot = "rotate(" + a.deg.toFixed(1) + ")";
      svgEl("line", { x1: -18, y1: 0, x2: -5, y2: 0, stroke: tc, "stroke-width": 1.6, "stroke-linecap": "round", opacity: .6, transform: rot }, g);
      svgEl("polygon", { points: "-7,-1.9 7,0 -7,1.9", fill: "#fff", transform: rot }, g);
      moveFx(g, sx, sy, hx - a.uy * sd * .5, hy + a.ux * sd * .5, T, null, 0, "linear");
      setTimeout(() => sparks(hx, hy, 3, tc, 12), T);
    }, i * 85));
    return T;
  } },
  // saw: homes in on you and curves after you
  crimson: { spd: 290, r: 10, shot(e, heavy, land, tc, sp) {
    kick(e, 6, 200);
    if (e.el && e.el.saw) anim(e.el.saw, [{ opacity: 0, transform: "scale(.2)" }, { opacity: 0, transform: "scale(.2)", offset: .3 }, { opacity: 1, transform: "scale(1)" }], 650);
    const a = aimFrom(e), g = svgEl("g", {}, fx); g.style.color = tc;
    svgEl("polygon", { points: starPts(10, heavy ? 13 : 11, heavy ? 9 : 7.5), fill: tc, stroke: "#000", "stroke-opacity": .35, class: heavy ? "glow" : "" }, g);
    svgEl("circle", { r: 3, fill: "#120f1c" }, g);
    addShot({ src: e, g, x: a.x, y: a.y, vx: a.ux * sp.spd * (.9 + .15 * shotSkill(e)), vy: a.uy * sp.spd * (.9 + .15 * shotSkill(e)), r: heavy ? 12 : sp.r, spin: 900, life: 2.6, hit: () => land(), col: "#ffb36b", home: 2.1 * shotSkill(e), homeT: 1.6 });
  }, far(e, heavy, { tc, E, aim, hitPt, recoil, travel }) {
    // ripper: the loaded saw launches off the rails and a new one spins up
    const T = travel(470, 240, 1000);
    recoil(6, 200);
    if (reduce) return T;
    const a = aim(), [hx, hy] = hitPt(a);
    anim(E.saw, [{ opacity: 0, transform: "scale(.2)" }, { opacity: 0, transform: "scale(.2)", offset: .3 }, { opacity: 1, transform: "scale(1)" }], 650);
    const g = svgEl("g", {}); g.style.color = tc;
    svgEl("polygon", { points: starPts(10, heavy ? 13 : 11, heavy ? 9 : 7.5), fill: tc, stroke: "#000", "stroke-opacity": .35, class: heavy ? "glow" : "" }, g);
    svgEl("circle", { r: 3, fill: "#120f1c" }, g);
    moveFx(g, a.mx, a.my, hx, hy, T, null, 900 + T * 1.5, "linear");
    setTimeout(() => sparks(hx, hy, heavy ? 12 : 6, "#ffb36b", heavy ? 34 : 22), T);
    return T;
  } },
  // mortar shell: aimed where you're heading, wide burst
  bastion: { spd: 240, r: 8, shot(e, heavy, land, tc, sp) {
    // mortar: lobs a shell, marked on the ground, and bursts there
    const a0 = aimFrom(e), [tx, ty] = leadPt(a0.x, a0.y, sp.spd, Math.min(1.1, (.5 + Math.random() * .6) * shotSkill(e))), R = (heavy ? 48 : 40) * (.9 + .15 * shotSkill(e));
    const mark = svgEl("circle", { cx: tx.toFixed(1), cy: ty.toFixed(1), r: R, fill: "rgba(255,90,90,.07)", stroke: "#ff6b6b", "stroke-width": 1.6, "stroke-dasharray": "5 5", opacity: .9 }, fx);
    const C = 170;
    setTimeout(() => {
      if (e.dead || heroDown) { mark.remove(); return; }
      kick(e, 8, 260);
      const a = aimFrom(e), sx = a.x, sy = a.y, d = Math.hypot(tx - sx, ty - sy) || 1, T = Math.max(.35, d / sp.spd);
      const g = svgEl("g", {}, fx); g.style.color = tc;
      svgEl("polygon", { points: polyPts(6, heavy ? 8 : 6.5, 0, 0, 0), fill: tc, stroke: "#fff", "stroke-width": 1.2, class: "glow" }, g);
      svgEl("circle", { r: 2.2, fill: "#fff" }, g);
      addShot({ src: e, g, mark, x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy) / T, r: 0, spin: 240, life: T, lob: { tx, ty, R }, hit: () => land(), col: tc });
    }, C);
  }, far(e, heavy, { tc, E, aim, hitPt, recoil, flash, travel }) {
    // mortar: a short charge glow, a hard kick, then a slow heavy shell
    const C = 170, T = travel(300, 380, 1500);
    if (!reduce) { const a = aim(); const g = svgEl("g", { transform: "translate(" + a.mx.toFixed(1) + " " + a.my.toFixed(1) + ")" }); g.style.color = tc; const c = svgEl("circle", { r: 6, fill: tc, class: "glow" }, g); tempFx(g, [{ opacity: 0 }, { opacity: 1 }], C); anim(c, [{ transform: "scale(.2)" }, { transform: "scale(1)" }], C); }
    setTimeout(() => {
      if (e.dead) return;
      recoil(8, 260);
      anim(E.model, [{ transform: "translate(0px,0px)" }, { transform: lungeT(e, -6), offset: .25 }, { transform: "translate(0px,0px)" }], 300);
      if (reduce) return;
      const a = aim(), [hx, hy] = hitPt(a);
      flash(a.mx, a.my, 8, "#fff");
      const g = svgEl("g", {}); g.style.color = tc;
      svgEl("polygon", { points: polyPts(6, heavy ? 8 : 6.5, 0, 0, 0), fill: tc, stroke: "#fff", "stroke-width": 1.2, class: "glow" }, g);
      svgEl("circle", { r: 2.2, fill: "#fff" }, g);
      moveFx(g, a.mx, a.my, hx, hy, T, null, 240 + T * .3, "linear");
      setTimeout(() => { ringIfRoom(hx, hy, tc, .5, 3, 300, 4); sparks(hx, hy, 6, tc, 24); }, T);
    }, C);
    return C + T;
  } },
  // lance: tracks you, locks at the last moment, instant beam
  umbral: { spd: 0, r: 0, shot(e, heavy, land) {
    // locks onto where you are, shows a thin aim line, then fires down that line
    const C = Math.max(380, 560 - 80 * shotSkill(e)), LOCK = Math.max(120, 230 - 50 * shotSkill(e));
    let a = aimFrom(e), len = a.d + 160, ex = a.x + a.ux * len, ey = a.y + a.uy * len;
    const tel = svgEl("line", { x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: ex.toFixed(1), y2: ey.toFixed(1), stroke: "#b48cff", "stroke-width": 1.4, "stroke-dasharray": "6 6", opacity: .75 }, fx);
    if (e.el) anim(e.el.weapon, [{ filter: "brightness(1)" }, { filter: "brightness(2.6)", offset: .8 }, { filter: "brightness(1)" }], C + 120);
    // the aim line follows you, then locks (turns solid) a moment before the beam
    const t0 = performance.now();
    const track = () => {
      const el = performance.now() - t0;
      if (el >= C - LOCK || e.dead) { tel.setAttribute("stroke-dasharray", "none"); tel.setAttribute("stroke-width", 2.2); tel.setAttribute("opacity", 1); return; }
      a = aimFrom(e); len = a.d + 160; ex = a.x + a.ux * len; ey = a.y + a.uy * len;
      tel.setAttribute("x1", a.x.toFixed(1)); tel.setAttribute("y1", a.y.toFixed(1)); tel.setAttribute("x2", ex.toFixed(1)); tel.setAttribute("y2", ey.toFixed(1));
      requestAnimationFrame(track);
    };
    requestAnimationFrame(track);
    setTimeout(() => {
      tel.remove();
      if (e.dead || heroDown) return;
      kick(e, 3, 160);
      const g = svgEl("g", {}, fx); g.style.color = "#b48cff";
      svgEl("line", { x1: a.x, y1: a.y, x2: ex, y2: ey, stroke: "#b48cff", "stroke-width": heavy ? 9 : 6, "stroke-linecap": "round", class: "glow", opacity: .85 }, g);
      svgEl("line", { x1: a.x, y1: a.y, x2: ex, y2: ey, stroke: "#1a0f2e", "stroke-width": 2 }, g);
      tempFx(g, [{ opacity: 1 }, { opacity: .5, offset: .4 }, { opacity: 0 }], 260);
      // distance from the core to the beam's line segment
      const vx = ex - a.x, vy = ey - a.y, t = Math.max(0, Math.min(1, ((view.HERO_X - a.x) * vx + (view.HERO_Y - a.y) * vy) / (vx * vx + vy * vy))), px = a.x + vx * t, py = a.y + vy * t;
      if (Math.hypot(view.HERO_X - px, view.HERO_Y - py) < (heavy ? 22 : 17) + 10) { land(); ringIfRoom(view.HERO_X, view.HERO_Y, "#b48cff", 1.2, .5, 240, 3); }
    }, C);
  }, far(e, heavy, { E, aim, hitPt, recoil }) {
    // gathers a void orb at the tip, then a beam
    const C = 240;
    anim(E.weapon, [{ filter: "brightness(1)" }, { filter: "brightness(2.6)", offset: .8 }, { filter: "brightness(1)" }], C + 120);
    if (!reduce) {
      const a = aim(), g = svgEl("g", { transform: "translate(" + a.mx.toFixed(1) + " " + a.my.toFixed(1) + ")" }); g.style.color = "#b48cff";
      const c = svgEl("circle", { r: 6, fill: "#1a0f2e", stroke: "#b48cff", "stroke-width": 2, class: "glow" }, g);
      tempFx(g, [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 1 }], C);
      anim(c, [{ transform: "scale(.2)" }, { transform: "scale(1.1)" }], C);
    }
    setTimeout(() => {
      if (e.dead) return;
      recoil(3, 160);
      if (reduce) return;
      const a = aim(), [hx, hy] = hitPt(a), g = svgEl("g", {});
      g.style.color = "#b48cff";
      svgEl("line", { x1: a.mx, y1: a.my, x2: hx, y2: hy, stroke: "#b48cff", "stroke-width": 6, "stroke-linecap": "round", class: "glow", opacity: .8 }, g);
      svgEl("line", { x1: a.mx, y1: a.my, x2: hx, y2: hy, stroke: "#1a0f2e", "stroke-width": 2 }, g);
      tempFx(g, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: .5, offset: .4 }, { opacity: 1, offset: .6 }, { opacity: 0 }], 260);
      ringIfRoom(hx, hy, "#b48cff", 1.2, .5, 240, 3);
    }, C);
    return C + 20;
  } }
};
const shotSkill = e => Math.min(1.6, .55 + fightStage() / 70) * (e.boss ? 1.35 : e.elite ? 1.2 : 1);
// aim point: where the core will be when the shot arrives (partly; sometimes they guess, sometimes they don't)
const tgtX = () => field.decoy ? field.decoy.x : view.HERO_X, tgtY = () => field.decoy ? field.decoy.y : view.HERO_Y;
function leadPt(fromX, fromY, spd, f) {
  if (field.decoy) return [field.decoy.x, field.decoy.y];
  const d = Math.hypot(view.HERO_X - fromX, view.HERO_Y - fromY), t = spd > 0 ? d / spd : .4;
  return [view.HERO_X + hvx * t * f, view.HERO_Y + hvy * t * f];
}
function steer(o, x, y) { const l = Math.hypot(x - o.x, y - o.y) || 1, sp = Math.hypot(o.vx, o.vy); o.vx = (x - o.x) / l * sp; o.vy = (y - o.y) / l * sp; o.deg = Math.atan2(o.vy, o.vx) * 57.2958; }
function aimFrom(e) {
  const ax = e.wx != null ? e.wx : e.px, ay = e.wy != null ? e.wy : e.py, dx = tgtX() - ax, dy = tgtY() - ay, l = Math.hypot(dx, dy) || 1, L = e.v.muzzle;
  return { x: ax + dx / l * L, y: ay + dy / l * L, ux: dx / l, uy: dy / l, d: l, deg: Math.atan2(dy, dx) * 57.2958 };
}
function kick(e, px, ms) {
  if (!e.el) return;
  anim(e.el.weapon, [{ transform: "translate(0px,0px)" }, { transform: "translate(0px," + px + "px)", offset: .2 }, { transform: "translate(0px,0px)" }], ms);
}
function addShot(o) {
  o.t = 0;
  const k = (1 - (ST ? ST.wake : 0)) * (o.src && o.src.slowT > performance.now() ? .8 : 1);
  if (k < 1) { o.vx *= k; o.vy *= k; o.life /= k; if (o.homeT) o.homeT /= k; }
  if (o.home && o.src && ST.homing) o.home *= 1 + .5 * ST.homing;
  eshots.push(o); placeShot(o); return o;
}
function placeShot(o) { if (o.g) o.g.setAttribute("transform", "translate(" + o.x.toFixed(1) + " " + o.y.toFixed(1) + ")" + (o.spin ? " rotate(" + (o.t * o.spin).toFixed(0) + ")" : o.deg != null ? " rotate(" + o.deg.toFixed(1) + ")" : "")); }
function killShot(o, burst) {
  const i = eshots.indexOf(o); if (i >= 0) eshots.splice(i, 1);
  if (o.mark) o.mark.remove();
  if (!o.g) return;
  if (burst) { anim(o.g, [{ opacity: 1 }, { opacity: 0 }], 160); setTimeout(() => o.g.remove(), 150); } else o.g.remove();
}
function fireShot(e, heavy, land) {
  const A = ATTACK[e.v.id] || ATTACK.umbral;
  A.shot(e, heavy, land, ARENA_C[e.tier], A);
}
const HERO_HIT = 15;
export function stepEShots(dt) {
  for (let i = eshots.length - 1; i >= 0; i--) {
    const o = eshots[i]; if (!o) continue;
    o.t += dt;
    if (o.home && o.t < o.homeT && !heroDown) {
      // turn toward the core, limited by the shot's turn rate
      const want = Math.atan2(tgtY() - o.y, tgtX() - o.x), cur = Math.atan2(o.vy, o.vx), sp = Math.hypot(o.vx, o.vy);
      let dA = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI; dA = Math.max(-o.home * dt, Math.min(o.home * dt, dA));
      o.vx = Math.cos(cur + dA) * sp; o.vy = Math.sin(cur + dA) * sp; if (!o.spin) o.deg = (cur + dA) * 57.2958;
    }
    o.x += o.vx * dt; o.y += o.vy * dt; placeShot(o);
    if (o.lob) {
      if (o.t >= o.life) {
        ringIfRoom(o.lob.tx, o.lob.ty, o.col, .5, o.lob.R / 9, 300, 4); sparks(o.lob.tx, o.lob.ty, 6, o.col, 24);
        if (Math.hypot(view.HERO_X - o.lob.tx, view.HERO_Y - o.lob.ty) < o.lob.R + 8 && !(dashIT > 0)) o.hit();
        killShot(o, false);
      }
      continue;
    }
    if (!(dashIT > 0) && !heroDown && Math.hypot(view.HERO_X - o.x, view.HERO_Y - o.y) < o.r + HERO_HIT) {
      // Mirror shells can bounce the shot back at whoever fired it
      if (ST.reflect > 0 && o.src && !o.src.dead && Math.random() < ST.reflect) { floatText("Reflect", "info", "hero", "#cfe9ff"); sparks(o.x, o.y, 4, "#cfe9ff", 16); land(o.src, ST.atk * 2, "aoe"); killShot(o, false); continue; }
      sparks(o.x, o.y, 4, o.col, 16); o.hit(); killShot(o, false); continue;
    }
    if (o.t >= o.life) killShot(o, true);
  }
}
function enemyAttackFx(e, heavy) {
  const tc = ARENA_C[e.tier], E = e.el, L = e.v.muzzle;
  // aim is re-read at fire time because the shooter keeps moving
  const aim = () => {
    const ax = e.wx != null ? e.wx : e.px, ay = e.wy != null ? e.wy : e.py, dx = view.HERO_X - ax, dy = view.HERO_Y - ay, l = Math.hypot(dx, dy) || 1;
    return { mx: ax + dx / l * L, my: ay + dy / l * L, ux: dx / l, uy: dy / l, deg: Math.atan2(dy, dx) * 57.2958 };
  };
  const hitPt = a => [view.HERO_X - a.ux * 13, view.HERO_Y - a.uy * 13];
  const recoil = (px, ms) => {
    anim(E.weapon, [{ transform: "translate(0px,0px)" }, { transform: "translate(0px," + px + "px)", offset: .2 }, { transform: "translate(0px,0px)" }], ms);
    const a = aim(); e.vx = (e.vx || 0) - a.ux * px * 2; e.vy = (e.vy || 0) - a.uy * px * 2;
  };
  const flash = (x, y, r, col) => tempFx(svgEl("circle", { cx: x, cy: y, r, fill: col }), [{ opacity: 1 }, { opacity: 0 }], 130);
  const travel = (spd, lo, hi) => { const a = aim(), [hx, hy] = hitPt(a); return Math.round(Math.max(lo, Math.min(hi, Math.hypot(hx - a.mx, hy - a.my) / spd * 1000))); };
  if (E.ind && e.offShown) anim(E.indP, [{ filter: "brightness(2.6)" }, { filter: "brightness(1)" }], 300);
  return (ATTACK[e.v.id] || ATTACK.umbral).far(e, heavy, { tc, E, aim, hitPt, recoil, flash, travel });
}
