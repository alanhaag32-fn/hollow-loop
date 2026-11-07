// The arena: layout, camera, starfield backdrop and zone.
import { $ } from "../core/util.js";
import { syncTarget } from "../enemies/foes.js";
import { arena } from "../fx/effects.js";
import { mode } from "../modes/modes.js";

// stars and faint zone shapes are painted once into a tile image; it repeats under the scene and slides
// with the camera (with a little parallax), so the endless plane costs almost nothing per frame
const PARA = .75;
let bgTW = 1, bgTH = 1, bgOX = NaN, bgOY = NaN;
function drawBackdrop() {
  const look = mode.look(), h = look.hue;
  $("bgSky").style.background = look.sky;
  const dpr = Math.min(2, window.devicePixelRatio || 1), tw = Math.max(200, Math.round(MAP_W * SC)), th = Math.max(200, Math.round(MAP_H * SC));
  const c = document.createElement("canvas"); c.width = Math.round(tw * dpr); c.height = Math.round(th * dpr);
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  // draw anything near an edge on the opposite side too, so the tile repeats without seams
  const wrap = (cx, cy, r, fn) => { for (const ox of [0, -tw, tw]) for (const oy of [0, -th, th]) { if (cx + ox < -r || cx + ox > tw + r || cy + oy < -r || cy + oy > th + r) continue; fn(cx + ox, cy + oy); } };
  const nS = Math.round(MAP_W * MAP_H / 5200);
  x.fillStyle = "#fff";
  for (let i = 0; i < nS; i++) {
    const cx = Math.random() * tw, cy = Math.random() * th, r = (.4 + Math.random() * 1.1) * SC;
    x.globalAlpha = .15 + Math.random() * .55;
    wrap(cx, cy, r, (px, py) => { x.beginPath(); x.arc(px, py, r, 0, 6.2832); x.fill(); });
  }
  const nF = Math.max(6, Math.round(MAP_W * MAP_H / 42000));
  for (let i = 0; i < nF; i++) {
    const cx = Math.random() * tw, cy = Math.random() * th, r = (10 + Math.random() * 40) * SC, rot = Math.random() * 6, outline = Math.random() < .45;
    x.globalAlpha = outline ? .1 + Math.random() * .16 : .05 + Math.random() * .1;
    wrap(cx, cy, r, (px, py) => {
      x.beginPath();
      look.shape(i, rot).forEach(([u, v], k) => k ? x.lineTo(px + u * r, py + v * r) : x.moveTo(px + u * r, py + v * r));
      x.closePath();
      if (outline) { x.strokeStyle = "hsl(" + h + " 70% 70%)"; x.lineWidth = 1.2 * SC; x.stroke(); } else { x.fillStyle = "hsl(" + h + " 60% 60%)"; x.fill(); x.fillStyle = "#fff"; }
    });
  }
  const bp = $("bgPlane");
  bp.style.backgroundImage = "url(" + c.toDataURL("image/png") + ")";
  bp.style.backgroundSize = tw + "px " + th + "px";
  bp.style.width = (SW + tw + 2) + "px"; bp.style.height = (SH + th + 2) + "px";
  bgTW = tw; bgTH = th; bgOX = NaN; placeBackdrop();
}
export function placeBackdrop() {
  const md = (n, m) => ((n % m) + m) % m;
  const ox = -md(view.CAMX * PARA * SC, bgTW), oy = -md(view.CAMY * PARA * SC, bgTH);
  if (Math.abs(ox - bgOX) < .25 && Math.abs(oy - bgOY) < .25) return;
  bgOX = ox; bgOY = oy;
  $("bgPlane").style.transform = "translate3d(" + ox.toFixed(1) + "px," + oy.toFixed(1) + "px,0)";
}
let lastZone = -1;
export function setZone(force) {
  const zone = mode.look().key;
  if (zone === lastZone && !force) return;
  lastZone = zone;
  if (SW > 0) drawBackdrop();
}
export let ARENA_T = 60, ARENA_B = 700;
// the map is bigger than the screen; the camera follows your core. VX0/VY0 is the top-left of the view in map units
// the plane is endless: MAP_W x MAP_H is just the size of the repeating backdrop tile
export let MAP_W = 1400, MAP_H = 1800, mapReady = false;
export const view = {
  CAMX: 0,
  CAMY: 0,
  VX0: 0,
  VY0: 0,
  HERO_X: 180,
  HERO_Y: 340,
  ENEMY_X: 290,
  ENEMY_Y: 382
};
export const VX1 = () => view.VX0 + VW, VY1 = () => view.VY0 + VH;
export function layout() {
  const ohx = view.HERO_X, ohy = view.HERO_Y;
  SW = arena.clientWidth || innerWidth; SH = arena.clientHeight || innerHeight;
  SC = Math.max(.5, Math.min(SW / 470, SH / 760, 1.4));
  VW = SW / SC; VH = SH / SC;
  $("scene").setAttribute("viewBox", "0 0 " + VW.toFixed(1) + " " + VH.toFixed(1));
  MAP_W = Math.max(900, Math.round(VW * 1.6)); MAP_H = Math.max(1200, Math.round(VH * 1.6));
  if (!mapReady) { mapReady = true; view.HERO_X = MAP_W / 2; view.HERO_Y = MAP_H / 2; }
  view.CAMX = view.HERO_X - VW / 2; view.CAMY = view.HERO_Y - VH * .49; view.VX0 = view.CAMX; view.VY0 = view.CAMY; applyCam();
  ENGAGE = Math.min(145, Math.max(104, Math.min(VW, VH) * .25));
  // the open play area between the top HUD and the skill bar, in scene units
  const ar = arena.getBoundingClientRect(), hb = document.querySelector(".hudStage"), sb = $("skillbar");
  const hr = hb && hb.getBoundingClientRect(), br = sb && sb.getBoundingClientRect();
  ARENA_T = hr && hr.height ? Math.max(20, (hr.bottom - ar.top) / SC) : 60;
  ARENA_B = br && br.height ? Math.min(VH - 10, (br.top - ar.top) / SC - 6) : VH - 70;
  if (ARENA_B - ARENA_T < 200) { ARENA_T = 40; ARENA_B = VH - 40; }

  $("heroPos").setAttribute("transform", "translate(" + view.HERO_X.toFixed(1) + " " + view.HERO_Y.toFixed(1) + ")");
  syncTarget();
  setZone(true);
}
export const keys = {};
export function applyCam() {
  $("cam").setAttribute("transform", "translate(" + (-view.CAMX).toFixed(2) + " " + (-view.CAMY).toFixed(2) + ")");
  $("heroPos").setAttribute("transform", "translate(" + view.HERO_X.toFixed(1) + " " + view.HERO_Y.toFixed(1) + ")");
}
// logical arena coordinates, recomputed to fill the screen
export let VW = 360, VH = 780, SC = 1, ENGAGE = 105, SW = 390, SH = 844;
