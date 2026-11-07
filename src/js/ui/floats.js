// Floating combat text over the hero and enemies.
import { fmt } from "../core/util.js";
import { enemy } from "../enemies/foes.js";
import { arena } from "../fx/effects.js";
import { SC, view } from "../world/scene.js";

// hits landing close together on the same enemy are added up into one number, so fast attacks don't flood the screen
export function dmgFloat(e, d, crit, tap, red) {
  const now = performance.now();
  if (!e.fl) e.fl = { sum: 0, crit: false, red: false, tap: true, t: 0, pend: false };
  const F = e.fl; F.sum += d; F.crit = F.crit || crit; F.red = F.red || !!red; F.tap = F.tap && tap;
  if (F.pend) return;
  const wait = Math.max(0, 150 - (now - F.t));
  F.pend = true;
  setTimeout(() => {
    F.pend = false; F.t = performance.now();
    if (F.sum > 0 && !document.hidden) floatText(fmt(F.sum) + (F.red ? "!!" : F.crit ? "!" : ""), F.red ? "rcrit" : F.crit ? "crit" : F.tap ? "tapn" : "hit", e.dead ? { px: e.px, py: e.py, R: e.R } : e);
    F.sum = 0; F.crit = false; F.red = false; F.tap = true;
  }, wait);
}
const floats = [];
export function floatText(text, cls, side, color) {
  const el = document.createElement("span");
  el.className = "float " + cls; el.textContent = text;
  if (color) el.style.color = color;
  const fe = typeof side === "object" && side ? side : side === "enemy" ? enemy : null;
  const R = fe ? fe.R : 25, loot = cls === "gold" || cls === "shardf";
  const x = fe ? fe.px + (Math.random() * 24 - 12) : side === "enemy" ? view.HERO_X + 60 : view.HERO_X + (Math.random() * 20 - 10);
  const y = fe ? fe.py + (loot ? R * .5 : -R * .45) + Math.random() * 12 - 6 : view.HERO_Y - 34 - Math.random() * 12;
  el.style.left = ((x - view.VX0) * SC).toFixed(0) + "px";
  el.style.top = ((y - view.VY0) * SC).toFixed(0) + "px";
  arena.appendChild(el); floats.push(el);
  while (floats.length > 12) floats.shift().remove();
  setTimeout(() => { el.remove(); const i = floats.indexOf(el); if (i >= 0) floats.splice(i, 1); }, 820);
}
