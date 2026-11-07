// Graphics settings: reduced motion and the low-power mode.
import { S } from "../core/save.js";

export const sysReduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
export let reduce = sysReduce, perf = false;
// rarity colours inside the arena (as SVG fills), from the stylesheet's .arena --c0..--c5; filled by applyGfx at boot
export const ARENA_C = [];
export function applyGfx() {
  if (!ARENA_C.length) for (let i = 0; i < 6; i++) ARENA_C.push(getComputedStyle(document.querySelector(".arena")).getPropertyValue("--c" + i).trim());
  reduce = S.anim === "on" ? false : S.anim === "off" ? true : sysReduce;
  perf = !!S.perf;
  document.body.classList.toggle("noanim", reduce);
  document.body.classList.toggle("perf", perf);
}
export const anim = (el, frames, opts) => (!reduce && el && el.animate) ? el.animate(frames, typeof opts === "number" ? { duration: opts } : opts) : null;
