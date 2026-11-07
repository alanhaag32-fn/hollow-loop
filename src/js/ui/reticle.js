// The target's ring (health, boss timer, mechanic progress) and the name tag above it.
import { $, polyPts, svgEl } from "../core/util.js";
import { enemy, targeting } from "../enemies/foes.js";
import { reduce } from "../fx/gfx.js";
import { RING_R, arcD } from "../hero/hero.js";
import { enemyCY } from "../hero/orbitals.js";
import { SC, SH, SW, VX1, VY1, view } from "../world/scene.js";

// the target's ring: health (segmented), boss timer and mechanic progress, plus slowly turning marker ticks
const FR_A = [-45, 225];
export let rEls = null, rV = [-1, -1, -1];
export const mech = {
  mechFrac: 0
};
export function buildReticle(t) {
  const r = $("reticle"); r.innerHTML = ""; rEls = null; rV = [-1, -1, -1];
  if (!t) return;
  const R = t.ringR, L = R * 270 * Math.PI / 180, n = Math.max(12, Math.round(L / 11)), dash = (L / n - 1.8).toFixed(2) + " 1.8";
  const g = svgEl("g", { fill: "none" }, r);
  svgEl("path", { d: arcD(R, FR_A[0], FR_A[1]), stroke: "rgba(255,255,255,.13)", "stroke-width": 3, "stroke-dasharray": dash }, g);
  rEls = { hp: svgEl("path", { stroke: "#ff6b6b", "stroke-width": 3, "stroke-dasharray": dash }, g) };
  if (t.boss) { svgEl("path", { d: arcD(R + 5, FR_A[0], FR_A[1]), stroke: "rgba(255,208,77,.15)", "stroke-width": 1.4 }, g); rEls.tm = svgEl("path", { stroke: "#ffd04d", "stroke-width": 1.4 }, g); }
  rEls.mech = svgEl("path", { stroke: "#b48cff", "stroke-width": 1.4 }, g);
  FR_A.forEach(a => { const c = Math.cos(a * Math.PI / 180), sn = Math.sin(a * Math.PI / 180); svgEl("line", { x1: (c * (R - 4)).toFixed(1), y1: (sn * (R - 4)).toFixed(1), x2: (c * (R + 4)).toFixed(1), y2: (sn * (R + 4)).toFixed(1), stroke: "rgba(255,255,255,.35)", "stroke-width": 1 }, g); });
  const tk = svgEl("g", { class: "spinSlow" }, r), tr = R + (t.boss ? 12 : 8);
  [0, 1, 2].forEach(i => { const a = i * 2.094; svgEl("polygon", { points: polyPts(3, 3.4, a + Math.PI, Math.cos(a - Math.PI / 2) * tr, Math.sin(a - Math.PI / 2) * tr) }, tk); });
  rEls.ticks = tk;
}
export function placeReticle(dt) {
  const r = $("reticle");
  if (!enemy || enemy.dead || !rEls) { r.style.display = "none"; return; }
  r.style.display = "";
  r.setAttribute("transform", "translate(" + view.ENEMY_X.toFixed(1) + " " + enemyCY().toFixed(1) + ")");
  rEls.ticks.setAttribute("fill", targeting.focus === enemy ? "#4fd3e4" : "rgba(255,255,255,.6)");
  const e = enemy, t = [Math.max(0, e.hp / e.max), e.boss ? Math.max(0, e.timer / e.timerMax) : 0, mech.mechFrac];
  const k = reduce ? 1 : Math.min(1, (dt || .016) * 12), els = [rEls.hp, rEls.tm, rEls.mech], rad = [e.ringR, e.ringR + 5, e.ringR + (e.boss ? 10 : 5)];
  for (let i = 0; i < 3; i++) {
    if (!els[i]) continue;
    const v = rV[i] < 0 || Math.abs(t[i] - rV[i]) < .001 ? t[i] : rV[i] + (t[i] - rV[i]) * k;
    if (v === rV[i]) continue;
    rV[i] = v;
    els[i].setAttribute("d", v < .004 ? "" : arcD(rad[i], FR_A[0], FR_A[0] + 270 * v));
  }
}
let tagCache = "", tagSide = null, tagFor = null;
let tagX = 0, tagY = 0, tagVis = false, tagHold = 0, tagMeasT = 0, tagW = 150, tagH = 40, htH = 30;
// keep the old target's tag up a moment while the new one takes over
export function holdTag() { if (tagVis) tagHold = .12; }
export function retag() { tagCache = ""; }
export function placeTags(dt) {
  const ht = $("heroTag"), ft = $("foeTag");
  const hx = (view.HERO_X - view.VX0) * SC, hy = (view.HERO_Y + RING_R - 8 - view.VY0) * SC, hk = hx.toFixed(0) + "," + hy.toFixed(0);
  if (hk !== tagCache) { tagCache = hk; ht.style.left = hx + "px"; ht.style.top = hy + "px"; }
  const e = enemy, m = e ? e.R * .35 : 0;
  // only show the name once the enemy is actually (mostly) on screen
  const vis = !!e && !e.dead && e.px > view.VX0 - m && e.px < VX1() + m && e.py > view.VY0 - m && e.py < VY1() + m;
  if (tagHold > 0) tagHold -= dt || .016;
  if (!vis || tagHold > 0) { if (tagVis) { tagVis = false; ft.style.opacity = 0; } return; }
  const tn = performance.now();
  if (tn - tagMeasT > 300 || tagFor !== e) { tagMeasT = tn; tagW = ft.offsetWidth || 150; tagH = ft.offsetHeight || 40; htH = ht.offsetHeight || 30; }
  const w = tagW, h = tagH, out = (e.ringR || e.R + 15) + (e.boss ? 16 : 12);
  const fx2 = Math.max(w / 2 + 6, Math.min(SW - w / 2 - 6, (e.px - view.VX0) * SC));
  const up = (e.py - out - view.VY0) * SC - h, dn = (e.py + out - view.VY0) * SC, topLim = 112;
  // above or below: whichever covers less of the core's ring and readout and stays clear of the top bar
  const hb = { l: hx - 80, r: hx + 80, t: hy - 4, b: hy + htH + 4 }, cr = (RING_R + 8) * SC, ccx = (view.HERO_X - view.VX0) * SC, ccy = (view.HERO_Y - view.VY0) * SC;
  const ovl = top => {
    const l = fx2 - w / 2, r = fx2 + w / 2, b = top + h;
    return Math.max(0, Math.min(r, hb.r) - Math.max(l, hb.l)) * Math.max(0, Math.min(b, hb.b) - Math.max(top, hb.t))
      + Math.max(0, Math.min(r, ccx + cr) - Math.max(l, ccx - cr)) * Math.max(0, Math.min(b, ccy + cr) - Math.max(top, ccy - cr));
  };
  const sUp = ovl(up) + (up < topLim ? 5e5 : 0), sDn = dn + h < SH - 100 ? ovl(dn) : 1e9;
  if (tagSide === null || tagFor !== e) { tagFor = e; tagSide = e.py > view.HERO_Y + 10 ? sDn <= sUp : sDn < sUp; }
  else if (tagSide && sUp + 60 < sDn) tagSide = false;
  else if (!tagSide && sDn + 60 < sUp) tagSide = true;
  const ty = Math.max(topLim, tagSide ? dn : up);
  if (!tagVis) { tagX = fx2; tagY = ty; }
  else { const k = 1 - Math.exp(-(dt || .016) * 16); tagX += (fx2 - tagX) * k; tagY += (ty - tagY) * k; }
  ft.style.transform = "translate3d(" + (tagX - w / 2).toFixed(1) + "px," + tagY.toFixed(1) + "px,0)";
  if (!tagVis) { tagVis = true; ft.style.opacity = 1; }
}
