// Taps on the arena, the floating joystick and keyboard steering.
import { runAction } from "./actions.js";
import { sfx } from "../audio/sound.js";
import { alive, hit } from "../combat/combat.js";
import { ST, emit } from "../core/stats.js";
import { $ } from "../core/util.js";
import { foes, inView, pickTarget, targeting } from "../enemies/foes.js";
import { arena, boltFx, ripple } from "../fx/effects.js";
import { hero } from "../hero/hero.js";
import { floatText } from "./floats.js";
import { tab } from "./windows.js";
import { SC, keys, view } from "../world/scene.js";
import { tell } from "../core/events.js";
import { tapWisp } from "../wisp/wisp.js";

let lastTapFx = 0, tapCount = 0, combo = 0, lastTapT = 0;

export function initInput() {
  try { if (navigator.standalone || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches) document.documentElement.classList.add("standalone"); } catch (e) {}
  // stop iPhone pinch and double-tap zoom from hijacking the game
  document.addEventListener("gesturestart", e => e.preventDefault(), { passive: false });
  document.addEventListener("dblclick", e => e.preventDefault(), { passive: false });
  $("scene").addEventListener("pointerdown", e => {
    const rc = arena.getBoundingClientRect(), lx = (e.clientX - rc.left) / SC + view.VX0, ly = (e.clientY - rc.top) / SC + view.VY0;
    if (tapWisp(lx, ly)) { e.preventDefault(); ripple(e.clientX, e.clientY); return; }
    let near = null, nd = 1e9;
    foes.forEach(f => { if (f.dead || !inView(f)) return; const d = Math.hypot(f.px - lx, f.py - ly); if (d < f.R + 26 && d < nd) { nd = d; near = f; } });
    if (near && near !== targeting.focus) { targeting.focus = near; pickTarget(); }
    if (!alive()) return;
    e.preventDefault();
    const tnow = performance.now();
    combo = tnow - lastTapT < 450 ? Math.min(50, combo + 1) : 1; lastTapT = tnow;
    if (combo === 25 || combo === 50) floatText(combo + " combo", "info", "hero", "#9ff3e6");
    const base = ST.atk * ST.tap * (1 + .02 * (combo - 1));
    hit(base, 60, "tap");
    tell("tap", 1);
    sfx("tap", 0, 90);
    tapCount++;
    emit("tap", { base, count: tapCount });
    ripple(e.clientX, e.clientY);
    const now = performance.now();
    if (now - lastTapFx > 70) { lastTapFx = now; boltFx(); }
    $("tapHint").style.display = "none";
  });
  // floating joystick: press anywhere and drag. A quick tap still strikes
  (() => {
    const sc = $("scene"), joy = $("joy"), knob = $("joyKnob"), R = 42;
    let jid = null, sx = 0, sy = 0, cand = null;
    sc.addEventListener("pointerdown", e => {
      if (jid !== null) return;
      cand = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { sc.setPointerCapture(e.pointerId); } catch (_) {}
    });
    sc.addEventListener("pointermove", e => {
      if (jid === null && cand && cand.id === e.pointerId && Math.hypot(e.clientX - cand.x, e.clientY - cand.y) > 8) {
        jid = e.pointerId; sx = cand.x; sy = cand.y; cand = null;
        const rc = arena.getBoundingClientRect();
        joy.style.transform = "translate(" + (sx - rc.left) + "px," + (sy - rc.top) + "px)"; joy.classList.add("on");
        $("tapHint").style.display = "none";
      }
      if (e.pointerId !== jid) return;
      let dx = e.clientX - sx, dy = e.clientY - sy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
      const m = Math.min(1, d / R), l = Math.hypot(dx, dy) || 1, g = m < .1 ? 0 : Math.min(1, m * 1.15);
      hero.joyX = dx / l * g; hero.joyY = dy / l * g;
    });
    const end = e => {
      if (cand && cand.id === e.pointerId) cand = null;
      if (e.pointerId !== jid) return;
      jid = null; hero.joyX = hero.joyY = 0; joy.classList.remove("on"); knob.style.transform = "";
    };
    sc.addEventListener("pointerup", end); sc.addEventListener("pointercancel", end); sc.addEventListener("lostpointercapture", end);
    document.addEventListener("keydown", e => { const k = e.key.toLowerCase(); if (/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/.test(k) && !tab) { keys[k] = true; e.preventDefault(); } });
    document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
    addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  })();
  $("mode").addEventListener("click", () => runAction("modeButton"));
}
