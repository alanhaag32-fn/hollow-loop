// Graphics settings: reduced motion and the low-power mode.
import { S } from "../core/save.js";

export const sysReduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
export let reduce = sysReduce, perf = false;
export function applyGfx() {
  reduce = S.anim === "on" ? false : S.anim === "off" ? true : sysReduce;
  perf = !!S.perf;
  document.body.classList.toggle("noanim", reduce);
  document.body.classList.toggle("perf", perf);
}
export const anim = (el, frames, opts) => (!reduce && el && el.animate) ? el.animate(frames, typeof opts === "number" ? { duration: opts } : opts) : null;
