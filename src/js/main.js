// Boot and the main loop.
import { initMusic } from "./audio/music.js";
import { initSound } from "./audio/sound.js";
import { ensureBoard } from "./bounty/bounty.js";
import { heroDown, step } from "./combat/combat.js";
import { load } from "./core/load.js";
import { S, save } from "./core/save.js";
import { foes, moveFoes, poseFoe, setTarget, syncTarget } from "./enemies/foes.js";
import { stepEShots } from "./enemies/shots.js";
import { applyGfx } from "./fx/gfx.js";
import { drawRing, initHero, recalc, stepHero } from "./hero/hero.js";
import { poseOrbitals, stepShots } from "./hero/orbitals.js";
import { resumeRun } from "./modes/modes.js";
import { autoTick } from "./progress/automation.js";
import { buildSkillbar } from "./skills/skills.js";
import { PANELS, markDirty, whenActionsRun } from "./ui/actions.js";
import { initGuide, showIntro } from "./ui/guide.js";
import { refitStage, updateUI } from "./ui/hud.js";
import { initInput } from "./ui/input.js";
import { log } from "./ui/log.js";
import { initOffline, showOffline } from "./ui/offline.js";
import { placeReticle, placeTags, retag } from "./ui/reticle.js";
import { initWindows, refreshPanel } from "./ui/windows.js";
// the Abyss only registers itself (its mode, tab, actions and bonuses); nothing else needs to call into it
import "./abyss/abyss.js";
import { initWeb } from "./web/web.js";
import { layout } from "./world/scene.js";
import { paused } from "./core/pause.js";

// drawing: everything that moves smoothly, once per animation frame
let lastFrame = 0;
function frame(now) {
  if (S.saver && lastFrame && now - lastFrame < 30) { requestAnimationFrame(frame); return; }
  const dt = Math.min(.05, (now - (lastFrame || now)) / 1000); lastFrame = now;
  stepHero(dt);
  if (!paused() && !heroDown) moveFoes(dt);
  if (!paused()) stepEShots(dt);
  for (const f of foes) poseFoe(f, paused() ? 0 : dt);
  drawRing(dt);
  poseOrbitals(dt);
  stepShots(now);
  syncTarget(); placeTags(dt); placeReticle(dt);
  requestAnimationFrame(frame);
}

// the game itself: combat and automation every 50ms, plus slower bookkeeping
let prev = Date.now(), gTimer = 0, saveT = 0, uiT = 0, lightT = 0, boardT = 0, kLast = -1, hiddenAt = 0;
function tick() {
  const now = Date.now(), dt = Math.min((now - prev) / 1000, .25);
  prev = now;
  if (!paused()) { step(dt); autoTick(dt); }
  gTimer += dt; saveT += dt; uiT += dt; lightT += dt; boardT += dt;
  if (gTimer >= 2) {
    if (!paused() && !heroDown) { const k = S.totalKills - (kLast < 0 ? S.totalKills : kLast); S.kps = (S.kps || .3) * .95 + (k / gTimer) * .05; }
    kLast = S.totalKills; gTimer = 0;
  }
  if (uiT >= .1) { uiT = 0; updateUI(); }
  if (lightT >= .5) { lightT = 0; refreshPanel(); }
  if (boardT >= 1) { boardT = 0; ensureBoard(); }
  if (saveT >= 5) { saveT = 0; save(); }
}

initInput();
initHero();
initMusic();
initSound();
initWeb();
initWindows();
initOffline();
initGuide();

load();
whenActionsRun(() => { recalc(); ensureBoard(); markDirty(...Object.keys(PANELS)); save(); updateUI(); });
applyGfx();
recalc();
ensureBoard();
setTarget(null);
resumeRun();
layout();
addEventListener("resize", () => { layout(); retag(); refitStage(); });
// the title font loads late and is wider than the fallback, so fit again once it arrives
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { refitStage(); updateUI(); });
requestAnimationFrame(frame);
buildSkillbar();
log("The loop begins.", "r0");
if (S.refundNote) { log(S.refundNote, "r4"); delete S.refundNote; }
if (!S.seenIntro) showIntro();
else showOffline((Date.now() - S.last) / 1000);
updateUI();
setInterval(tick, 50);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); save(); }
  else { prev = Date.now(); if (hiddenAt && !paused()) showOffline((Date.now() - hiddenAt) / 1000); hiddenAt = 0; }
});
window.addEventListener("pagehide", save);
