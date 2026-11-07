// Visual effects: particles, rings, slashes, bolts, screen shake and the skill and status visuals.
import { eVerts } from "../abyss/abyss.js";
import { F, heroDown } from "../combat/combat.js";
import { S } from "../core/save.js";
import { $, anim, svgEl } from "../core/util.js";
import { enemy } from "../enemies/foes.js";
import { perf, reduce } from "./gfx.js";
import { ARENA_C } from "../gear/items.js";
import { heroModel } from "../hero/hero.js";
import { enemyCY, wType } from "../hero/orbitals.js";
import { STATUS, st } from "../hero/statuses.js";
import { VX1, view } from "../world/scene.js";

export const fx = $("fx"), world = $("world"), arena = $("arena");
export function shake(px, ms) { anim(world, [0, 1, 2, 3, 4, 5].map(i => ({ transform: i === 5 ? "translate(0px,0px)" : "translate(" + ((Math.random() * 2 - 1) * px).toFixed(1) + "px," + ((Math.random() * 2 - 1) * px).toFixed(1) + "px)" })), ms); }
export function tempFx(el, frames, ms, delay) {
  fx.appendChild(el);
  const a = anim(el, frames, { duration: ms, delay: delay || 0, easing: "ease-out", fill: "both" });
  setTimeout(() => el.remove(), a ? ms + (delay || 0) + 30 : 60);
}
export function moveFx(el, x0, y0, x1, y1, ms, mid, spin, ease) {
  fx.appendChild(el);
  const a = anim(el, mid ? [
    { transform: "translate(" + x0 + "px," + y0 + "px) rotate(0deg)" },
    { transform: "translate(" + mid[0] + "px," + mid[1] + "px) rotate(" + (spin || 0) / 2 + "deg)" },
    { transform: "translate(" + x1 + "px," + y1 + "px) rotate(" + (spin || 0) + "deg)" }
  ] : [
    { transform: "translate(" + x0 + "px," + y0 + "px) rotate(0deg)" },
    { transform: "translate(" + x1 + "px," + y1 + "px) rotate(" + (spin || 0) + "deg)" }
  ], { duration: ms, easing: ease || "ease-in", fill: "forwards" });
  setTimeout(() => el.remove(), a ? ms + 20 : 0);
}
export function zigzag(x0, y0, x1, y1, n, amp) {
  let d = "M" + x0.toFixed(1) + " " + y0.toFixed(1);
  for (let i = 1; i < n; i++) { const t = i / n; d += " L" + (x0 + (x1 - x0) * t + Math.random() * amp - amp / 2).toFixed(1) + " " + (y0 + (y1 - y0) * t + Math.random() * amp * 2 - amp).toFixed(1); }
  return d + " L" + x1.toFixed(1) + " " + y1.toFixed(1);
}
// particle budget: when the screen is already busy, extra sparks are skipped (nobody can see them anyway)
export const fxBusy = () => fx.childElementCount > (perf || S.saver ? 40 : 80);
export function sparks(x, y, n, col, dist) {
  if (reduce) return;
  if (perf || S.saver) n = Math.ceil(n / 3);
  const busy = fx.childElementCount; if (busy > (perf || S.saver ? 40 : 80)) return; if (busy > 45) n = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = dist * (.5 + Math.random() * .5);
    tempFx(svgEl("circle", { cx: x, cy: y, r: 2, fill: col }), [{ transform: "translate(0px,0px)", opacity: 1 }, { transform: "translate(" + (Math.cos(a) * d).toFixed(1) + "px," + (Math.sin(a) * d).toFixed(1) + "px)", opacity: 0 }], 320);
  }
}
export function slash(crit, slot = "weapon", t) {
  if (reduce) return;
  const ty = wType(slot), SX = t ? t.px : view.ENEMY_X, SY = t ? t.py : enemyCY();
  if (ty === "Laser" || ty === "Coil" || ty === "Drone" || ty === "Mote") {
    const w = S.equip[slot], col = w ? ARENA_C[w.r] : "#ffffff";
    sparks(SX, SY, crit ? 9 : 5, crit ? "#ff8a3d" : col, crit ? 40 : 26);
    if (crit || ty === "Laser") ringIfRoom(SX, SY, col, .4, crit ? 2.4 : 1.4, 220, 2);
    return;
  }
  const w = S.equip[slot], col = w ? ARENA_C[w.r] : "#ffffff", cy = SY, s = crit ? 1.35 : 1;
  const g = svgEl("g", { transform: "translate(" + SX + " " + cy + ") rotate(" + (Math.random() * 40 - 20).toFixed(0) + ")" });
  const d = "M" + (-20 * s) + " " + (-30 * s) + " Q" + (22 * s) + " 0 " + (-14 * s) + " " + (32 * s);
  svgEl("path", { d, fill: "none", stroke: col, "stroke-width": crit ? 7 : 5, "stroke-linecap": "round", opacity: .9 }, g);
  svgEl("path", { d, fill: "none", stroke: "#fff", "stroke-width": crit ? 2.5 : 1.5, "stroke-linecap": "round" }, g);
  tempFx(g, [{ opacity: 1 }, { opacity: 0 }], 220);
  sparks(SX, cy, crit ? 8 : 4, crit ? "#ff8a3d" : "#fff", crit ? 40 : 28);
}
export function boltFx() {
  if (reduce || !enemy) return;
  const cy = enemyCY() + (Math.random() * 20 - 10);
  const dx = view.ENEMY_X + F() * 10 - view.HERO_X;
  const path = "M" + view.HERO_X + " " + view.HERO_Y + " L" + (view.HERO_X + dx * .33) + " " + (view.HERO_Y - 6 + Math.random() * 12) + " L" + (view.HERO_X + dx * .66) + " " + (cy + Math.random() * 14 - 7) + " L" + (view.HERO_X + dx) + " " + cy;
  const g = svgEl("g", {});
  svgEl("path", { d: path, fill: "none", stroke: "#7be0d0", "stroke-width": 4, opacity: .5, "stroke-linejoin": "round" }, g);
  svgEl("path", { d: path, fill: "none", stroke: "#effffc", "stroke-width": 1.5, "stroke-linejoin": "round" }, g);
  tempFx(g, [{ opacity: 1 }, { opacity: 0 }], 160);
}
export function ripple(x, y) {
  if (reduce) return;
  const r = arena.getBoundingClientRect(), el = document.createElement("span");
  el.className = "ripple"; el.style.left = (x - r.left) + "px"; el.style.top = (y - r.top) + "px";
  arena.appendChild(el); setTimeout(() => el.remove(), 360);
}
// an expanding ring: ring() always draws (skills), ringIfRoom() skips when the effect budget is used up
export function ringIfRoom(x, y, col, from, to, ms, width) { if (!fxBusy()) ring(x, y, col, from, to, ms, width); }
export function ring(x, y, col, from, to, ms, width) {
  if (reduce) return;
  tempFx(svgEl("circle", { cx: 0, cy: 0, r: 10, fill: "none", stroke: col, "stroke-width": width || 3 }), [{ transform: "translate(" + x + "px," + y + "px) scale(" + from + ")", opacity: 1 }, { transform: "translate(" + x + "px," + y + "px) scale(" + to + ")", opacity: 0 }], ms);
}
export function burst(x, y, col, n) { ringIfRoom(x, y, col, .5, 3, 450); sparks(x, y, n, col, 40); }
export function novaFx() {
  ring(view.HERO_X, view.HERO_Y, "#effffc", 1, 17, 320, 4);
  ring(view.HERO_X, view.HERO_Y, "#7be0d0", .6, 15, 360, 8);
  const tg = enemy;
  setTimeout(() => { if (tg && !tg.dead) { ring(tg.px, tg.py, "#effffc", .5, 4, 420, 3); sparks(tg.px, tg.py, 10, "#effffc", 40); } }, 220);
}
export function dashFx(x0, y0, x1, y1) {
  if (reduce) return;
  for (let i = 0; i < 5; i++) {
    const t = i / 4, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    tempFx(svgEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 20, fill: "none", stroke: "#9ff3e6", "stroke-width": 2 }), [{ opacity: 0 }, { opacity: .55 - t * .3, offset: .2 }, { opacity: 0 }], 380, i * 40);
  }
}
export function crackFx() {
  if (!enemy) return;
  const g = enemy.el.cracks; g.innerHTML = "";
  const cy = enemy.cy;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + Math.random() * .4; let d = "M0 " + cy;
    for (let k = 1; k <= 3; k++) d += " L" + (Math.cos(a) * enemy.R * k / 3 + Math.random() * 6 - 3).toFixed(1) + " " + (cy + Math.sin(a) * enemy.R * k / 3 + Math.random() * 6 - 3).toFixed(1);
    svgEl("path", { d, fill: "none", stroke: "#fff", "stroke-width": 1.8, "stroke-linecap": "round" }, g);
  }
  g.style.display = "";
}
export function warnRing(sec) {
  if (reduce) return;
  tempFx(svgEl("circle", { cx: 0, cy: 0, r: 44, fill: "rgba(255,59,59,.08)", stroke: "#ff4d4d", "stroke-width": 2.5, "stroke-dasharray": "6 5" }), [{ transform: "translate(" + view.HERO_X + "px," + view.HERO_Y + "px) scale(1.1)", opacity: .3 }, { transform: "translate(" + view.HERO_X + "px," + view.HERO_Y + "px) scale(.55)", opacity: 1 }], sec * 1000);
}
export function evadeFx(dir) { anim(heroModel, [{ transform: "translate(0px,0px)", opacity: 1 }, { transform: "translate(" + (dir || F()) * 14 + "px,-10px)", opacity: .4, offset: .4 }, { transform: "translate(0px,0px)", opacity: 1 }], 260); }
export function blockFx(dir) { ringIfRoom(view.HERO_X - (dir || F()) * 14, view.HERO_Y, "#e8e4ff", .8, 2.2, 220, 4); }
export function shatter(e) {
  const cx = e.px, cy = e.py;
  if (reduce) return;
  const v = eVerts(e, e.R, e.rot || 0, 0, 0);
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length], mx = (a[0] + b[0]) / 3, my = (a[1] + b[1]) / 3;
    const g = svgEl("g", { transform: "translate(" + (cx + mx).toFixed(1) + " " + (cy + my).toFixed(1) + ")" });
    const poly = svgEl("polygon", { points: (-mx).toFixed(1) + "," + (-my).toFixed(1) + " " + (a[0] - mx).toFixed(1) + "," + (a[1] - my).toFixed(1) + " " + (b[0] - mx).toFixed(1) + "," + (b[1] - my).toFixed(1), fill: e.fill, stroke: e.stroke, "stroke-width": 1.5 }, g);
    const ang = Math.atan2(my, mx), dist = 30 + Math.random() * 30;
    tempFx(g, [{ opacity: 1 }, { opacity: 1, offset: .6 }, { opacity: 0 }], 650);
    anim(poly, [{ transform: "translate(0px,0px) rotate(0deg)" }, { transform: "translate(" + (Math.cos(ang) * dist).toFixed(1) + "px," + (Math.sin(ang) * dist).toFixed(1) + "px) rotate(" + (Math.random() * 360 - 180).toFixed(0) + "deg)" }], { duration: 650, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" });
  }
  ringIfRoom(cx, cy, e.stroke, 2.4, 6, 400);
  for (let i = 0; i < 5; i++) tempFx(svgEl("circle", { cx, cy, r: 2.5, fill: ARENA_C[4] }), [
    { transform: "translate(0px,0px)", opacity: 1 },
    { transform: "translate(" + (Math.random() * 30 - 15).toFixed(0) + "px,-30px)", opacity: 1, offset: .35 },
    { transform: "translate(" + (VX1() - 40 - cx).toFixed(0) + "px," + (view.VY0 + 20 - cy).toFixed(0) + "px)", opacity: 0 }
  ], 700 + i * 60);
  if (e.boss || e.elite) shake(e.boss ? 8 : 5, 450);
}
export function lootBeam(r, x, y) {
  if (reduce) return;
  const col = ARENA_C[r], g = svgEl("g", { transform: "translate(" + x.toFixed(1) + " " + (y - 128).toFixed(1) + ")" });
  svgEl("rect", { x: -5, y: 0, width: 10, height: 150, fill: "url(#beamG)" }, g);
  svgEl("rect", { x: -3, y: 0, width: 6, height: 150, fill: col, opacity: .7 }, g);
  svgEl("polygon", { points: "0,138 7,145 0,152 -7,145", fill: col }, g);
  tempFx(g, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .6 }, { opacity: 0 }], 1300);
}
export function equipFlash(r) { anim(heroModel, [{ filter: "brightness(1)" }, { filter: "brightness(2.2) drop-shadow(0 0 6px " + ARENA_C[r] + ")" }, { filter: "brightness(1)" }], 500); }
export function statusHitFx(id, big, from) {
  if (reduce) return;
  const src = from || enemy, col = STATUS[id].col, sx = src ? (src.wx != null ? src.wx : src.px) : view.HERO_X + 110, sy = src ? (src.wy != null ? src.wy : src.py) : view.HERO_Y - 40;
  const g = svgEl("g", {}); g.style.color = col;
  svgEl("circle", { cx: sx, cy: sy, r: 5, fill: col, class: "glow" }, g);
  svgEl("circle", { cx: sx + 7, cy: sy, r: 2.5, fill: col, opacity: .6 }, g);
  tempFx(g, [{ transform: "translate(0px,0px)", opacity: 1 }, { transform: "translate(" + (view.HERO_X - sx) + "px," + (view.HERO_Y - sy) + "px)", opacity: 1 }], 240);
  setTimeout(() => { ringIfRoom(view.HERO_X, view.HERO_Y, col, 1, big ? 3.6 : 2.4, 420, 3); sparks(view.HERO_X, view.HERO_Y, big ? 10 : 5, col, 36); }, 230);
}
function staticArcs() {
  const g = $("hStatic"); g.innerHTML = "";
  for (let k = 0; k < 3; k++) {
    let a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 4, d = "";
    for (let i = 0; i < 5; i++) {
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      d += (i ? " L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      a += .25 + Math.random() * .2; r += Math.random() * 6 - 1;
    }
    svgEl("path", { d }, g);
  }
}
let stFxT = 0;
export function statusFx(dt) {
  if (reduce || heroDown) return;
  stFxT -= dt;
  if (stFxT > 0) return;
  stFxT = .13;
  if (st("static")) {
    staticArcs();
    if (Math.random() < .35) sparks(view.HERO_X + Math.random() * 30 - 15, view.HERO_Y + Math.random() * 30 - 15, 2, "#4fd3e4", 14);
  }
  if (st("dim") && Math.random() < .75) {
    const x = view.HERO_X + Math.random() * 22 - 11, y = view.HERO_Y + Math.random() * 10 - 5;
    tempFx(svgEl("circle", { cx: x, cy: y, r: 1.5 + Math.random() * 1.5, fill: "#c9c4dc" }), [{ transform: "translate(0px,0px)", opacity: .9 }, { transform: "translate(" + (Math.random() * 16 - 8).toFixed(1) + "px," + (-28 - Math.random() * 18).toFixed(1) + "px)", opacity: 0 }], 900);
  }
  if (st("gravity") && Math.random() < .7) {
    const x = view.HERO_X + Math.random() * 44 - 22;
    tempFx(svgEl("line", { x1: x, y1: view.HERO_Y - 34, x2: x, y2: view.HERO_Y - 24, stroke: "#b48cff", "stroke-width": 2, "stroke-linecap": "round" }), [{ transform: "translate(0px,0px)", opacity: 0 }, { transform: "translate(0px,30px)", opacity: .9, offset: .5 }, { transform: "translate(0px,62px)", opacity: 0 }], 520);
  }
  if (st("fracture") && Math.random() < .3) {
    const a = Math.random() * Math.PI * 2, x = view.HERO_X + Math.cos(a) * 18, y = view.HERO_Y + Math.sin(a) * 18;
    const g = svgEl("g", { transform: "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")" });
    const tri = svgEl("polygon", { points: "0,-3 3,2 -3,2", fill: "#ff8463" }, g);
    tempFx(g, [{ opacity: 1 }, { opacity: 0 }], 750);
    anim(tri, [{ transform: "translate(0px,0px) rotate(0deg)" }, { transform: "translate(" + (Math.cos(a) * 10).toFixed(1) + "px,36px) rotate(" + (Math.random() * 300 - 150).toFixed(0) + "deg)" }], { duration: 750, easing: "ease-in", fill: "forwards" });
  }
  if (st("eclipse") && Math.random() < .35) {
    const a = Math.random() * Math.PI * 2;
    tempFx(svgEl("line", { x1: view.HERO_X + Math.cos(a) * 13, y1: view.HERO_Y + Math.sin(a) * 13, x2: view.HERO_X + Math.cos(a) * 22, y2: view.HERO_Y + Math.sin(a) * 22, stroke: "#ffd04d", "stroke-width": 1.5, "stroke-linecap": "round" }), [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], 500);
  }
}
