// The heads-up display: stage title, currencies, health and mana text, statuses and boss mechanic readout.
import { dps } from "../combat/combat.js";
import { S } from "../core/save.js";
import { $, fmt } from "../core/util.js";
import { enemy, foes } from "../enemies/foes.js";
import { arcD, hero, heroModel } from "../hero/hero.js";
import { STATUS, st, stT } from "../hero/statuses.js";
import { mode } from "../modes/modes.js";
import { updateSkillbar } from "../skills/skills.js";
import { unread } from "./log.js";
import { mechReadout } from "../enemies/enemies.js";
import { renderIfStale, tab } from "./windows.js";
import { bountyReady } from "../bounty/bounty.js";
import { boonChips } from "../wisp/wisp.js";

// shrink the stage title to fit beside the currency box instead of cutting it off
let stageKey = "";
export function refitStage() { stageKey = ""; }
function fitStage(txt) {
  const el = $("stageLbl"), cur = document.querySelector(".hudCur"), key = txt + "|" + (cur ? cur.offsetWidth : 0);
  if (key === stageKey) return;
  stageKey = key; el.textContent = txt; el.style.fontSize = "";
  let fs = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && fs > 11) { fs -= 1; el.style.fontSize = fs + "px"; }
}
export function updateUI() {
  $("gold").textContent = fmt(S.gold);
  $("echoTop").textContent = S.echoes ? S.echoes + " echoes" : "";
  $("dustTop").textContent = (S.stardustTotal ? fmt(S.stardust || 0) + " stardust" : "") + (S.abyss && S.abyss.total ? (S.stardustTotal ? " · " : "") + fmt(S.abyss.stone) + " voidstone" : "");
  $("wGold").textContent = fmt(S.gold); $("wEcho").textContent = S.echoes;
  $("shardTop").textContent = fmt(S.shards) + " shards"; $("wShard").textContent = fmt(S.shards);
  const hd = mode.hud();
  fitStage(hd.title);
  $("stageSub").textContent = hd.sub;
  $("prog").style.width = Math.max(0, Math.min(100, hd.prog * 100)) + "%";
  $("mode").textContent = hd.button;
  $("hpTxt").textContent = fmt(Math.max(0, hero.hp));
  $("mpTxt").textContent = fmt(Math.max(0, hero.mp));
  const claim = bountyReady() ? "dot" : "";
  $("menuDot").className = claim;
  $("dpsVal").textContent = fmt(dps());
  const hb = $("hBarrier");
  hb.style.display = hero.shield > 0 ? "" : "none";
  if (hero.shield > 0) hb.setAttribute("opacity", (.35 + .65 * hero.shield / hero.shieldMax).toFixed(2));
  $("eTxt").innerHTML = enemy ? (enemy.boss ? fmt(Math.max(0, enemy.hp)) + ' <b class="tmT">' + Math.ceil(Math.max(0, enemy.timer)) + "s</b>" : fmt(Math.max(0, enemy.hp))) : "";
  $("packN").textContent = S.inv.length ? S.inv.length : "";
  foes.forEach(f => {
    if (f === enemy || !f.el) return;
    const v = Math.max(0, f.hp / f.max);
    if (Math.abs(v - f.mFrac) < .005) return;
    f.mFrac = v; f.el.mFg.setAttribute("d", v < .01 ? "" : arcD(f.mr, 40, 40 + 100 * v));
  });
  $("boardDot").className = claim;
  let chips = "";
  for (const k in STATUS) {
    const on = st(k); heroModel.classList.toggle("st-" + k, on);
    if (on) chips += '<span class="stChip" style="--sc:' + STATUS[k].col + '" title="' + STATUS[k].desc + '">' + STATUS[k].name + " " + Math.ceil(stT[k]) + "s</span>";
  }
  chips += boonChips();
  if ($("stRow").innerHTML !== chips) $("stRow").innerHTML = chips;
  $("mechTxt").textContent = mechReadout(enemy).text;
  $("logN").innerHTML = unread && tab !== "log" ? '<span class="badge">' + (unread > 99 ? "99+" : unread) + "</span>" : "";
  updateSkillbar();
  renderIfStale();
}
