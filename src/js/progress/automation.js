// Automation (free after a Transcend): Auto-Train, Auto-Push, Auto-Ascend.
import { heroDown } from "../combat/combat.js";
import { S } from "../core/save.js";
import { mode } from "../modes/modes.js";
import { ascGain, ascMin, doAscend } from "./ascend.js";
import { autoTrain } from "../train/train.js";
import { updateUI } from "../ui/hud.js";
import { log } from "../ui/log.js";

// automation is free for good once you have transcended
export const autoOn = () => (S.transcends || 0) >= 1;
export const AUTO_REFUND = { aTrain: 12, aPush: 8, aAsc: 15, smart: 10 };
let autoT = 0, farmT = 0, stallT = 0, stallMax = 0;
export function autoTick(dt) {
  if (!mode.auto) return;
  if (heroDown) return;
  autoT += dt;
  if (!autoOn()) return;
  if (S.autoCfg.trainOn !== false && autoT >= 2) { autoT = 0; autoTrain(); }
  if ((S.autoCfg.push ?? 60) > 0 && !S.push) { farmT += dt; if (farmT >= (S.autoCfg.push ?? 60)) { farmT = 0; S.push = true; log("Auto-Push: pushing again", "r0"); updateUI(); } } else farmT = 0;
  {
    if (S.maxStage > stallMax) { stallMax = S.maxStage; stallT = 0; } else stallT += dt;
    const at = S.autoCfg.ascAt || 0;
    // never ascend right where a run starts (Head Start), or it would loop forever
    const floor = ascMin();
    if (((at > 0 && S.maxStage >= Math.max(at, floor)) || (S.autoCfg.ascStall && stallT > 300 && S.maxStage >= Math.max(20, floor)))) {
      stallT = 0; stallMax = 0;
      if (ascGain() >= 1 && S.maxStage >= ascMin()) { log("Auto-Ascend at stage " + S.maxStage, "r4"); doAscend(); }
    }
  }
}
