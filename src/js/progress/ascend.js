// Ascending: echoes, echo power, starting a run, and the Ascend tab.
import { sfx } from "../audio/sound.js";
import { ensureBoard } from "../bounty/bounty.js";
import { cds } from "../skills/skills.js";
import { shardAmt } from "./currency.js";
import { RUN, S, save } from "../core/save.js";
import { ST } from "../core/stats.js";
import { clearFoes } from "../enemies/foes.js";
import { burst, equipFlash } from "../fx/effects.js";
import { makeItem } from "../gear/items.js";
import { hero, recalc, resetCombat } from "../hero/hero.js";
import { resumeRun, returnToMain, spawn } from "../modes/modes.js";
import { ECHO_K } from "./transcend.js";
import { buildSkillbar } from "../skills/skills.js";
import { PANELS, markDirty } from "../ui/actions.js";
import { updateUI } from "../ui/hud.js";
import { log } from "../ui/log.js";
import { view } from "../world/scene.js";

function starterKit(st) {
  ["weapon", "armor", "boots", "charm"].forEach(sl => { const it = makeItem(st, false, 2, sl); S.equip[sl] = it; });
}
// shared by ascend and transcend
export function startRun() {
  recalc();
  const st0 = startStage();
  S.stage = S.maxStage = st0; S.runStart = st0; S.cyclePeak = Math.max(S.cyclePeak || 1, st0);
  if (ST.starterKit) starterKit(st0);
  returnToMain();
  clearFoes(false); resumeRun(); spawn.spawnT = .8; Object.keys(cds).forEach(k => cds[k] = 0);
  resetCombat();
  recalc(); hero.hp = ST.maxHp; hero.mp = ST.maxMp;
  S.bounties.forEach(b => { b.shards = (3 + 3 * b.tier) * shardAmt(S.maxStage); }); ensureBoard(); markDirty(...Object.keys(PANELS)); buildSkillbar();
  burst(view.HERO_X, view.HERO_Y, "#ffd04d", 14); equipFlash(4);
}
export function doAscend() {
  const g = ascGain();
  if (S.maxStage < ascMin() || g < 1) return false;
  const doneB = S.bounties.filter(b => !b.empty && b.prog >= b.n);
  Object.assign(S, RUN(), { echoes: S.echoes + g, echoesTotal: S.echoesTotal + g, ascensions: (S.ascensions || 0) + 1, bounties: doneB, seenIntro: true });
  startRun();
  log("Ascended with " + g + " new echoes. Spend them in the web", "r4"); sfx("ascend", 0, 0);
  log("Ascension " + S.ascensions + ": enemies now carry stronger modifiers", "r3");
  save(); updateUI();
  return true;
}
// where a run begins (Head Start and the web's head start node move it forward)
export const startStage = () => ST.startStage;
// echoes only count the stages you climbed this run, so stages skipped by Head Start give nothing
export const runStart = () => Math.min(S.maxStage, S.runStart || startStage());
export const ascMin = () => Math.max(20, runStart() + 10);
export const ascGain = () => Math.floor(ECHO_K * (Math.pow(S.maxStage, 1.5) - Math.pow(runStart(), 1.5)) * (1 + .05 * (S.ascensions || 0)) * ST.echoGain);
