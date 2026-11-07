// Offline progress: what your core farmed while you were away.
import { lumenAt } from "../core/curves.js";
import { addGold, addShards, shardAmt } from "../progress/currency.js";
import { S, save } from "../core/save.js";
import { ST } from "../core/stats.js";
import { $, fmt } from "../core/util.js";
import { receive } from "../gear/inventory.js";
import { RARITY, makeItem } from "../gear/items.js";
import { updateUI } from "./hud.js";
import { log } from "./log.js";
import { hold } from "../core/pause.js";
import { KILLS } from "../modes/modes.js";
import { ELITE_SHARDS, SHARD_CHANCE } from "../combat/combat.js";

const offCap = () => ST.offHours * 3600;
function offlineGains(sec) {
  sec = Math.min(sec, offCap());
  const kps = Math.min(2, Math.max(.05, S.kps || .2)), kills = kps * sec * ST.offRate, st = Math.max(1, S.stage);
  const gold = Math.ceil(kills * lumenAt(st) * ST.gold * 1.1);
  // as if each stage had one elite (past stage 10) and the rest regular shapes, at 60% of the shards
  const shards = Math.floor(kills * (SHARD_CHANCE * (KILLS - 1) / KILLS + (st > 10 ? ELITE_SHARDS / KILLS : 0)) * shardAmt(st) * .6);
  const items = Math.min(3, Math.floor(kills * ST.drop / 40));
  return { sec, kills: Math.floor(kills), gold, shards, items };
}
export function showOffline(sec) {
  if (sec < 60 || !ST) return;
  const g = offlineGains(sec);
  if (g.gold <= 0 && g.shards <= 0) return;
  addGold(g.gold, false); if (g.shards) addShards(g.shards);
  const found = []; for (let i = 0; i < g.items; i++) { const it = makeItem(S.stage, false, 1); found.push(RARITY[it.r].name); receive(it, true); }
  S.totalKills += g.kills;
  const h = Math.floor(g.sec / 3600), m = Math.floor(g.sec % 3600 / 60), t = (h ? h + "h " : "") + m + "m";
  $("awayText").innerHTML = "Your core kept farming stage " + S.stage + " for <b>" + t + "</b>" + (sec > offCap() ? " (the most it can store is " + ST.offHours + " hours)" : "") + ".";
  $("awayList").innerHTML = '<div><span>Shapes destroyed</span><b>' + fmt(g.kills) + '</b></div><div><span>Lumen</span><b class="g">+' + fmt(g.gold) + '</b></div>' +
    (g.shards ? '<div><span>Shards</span><b class="s">+' + fmt(g.shards) + "</b></div>" : "") + (found.length ? "<div><span>Items</span><b>" + found.join(", ") + "</b></div>" : "");
  $("away").hidden = false; hold("away", true);
  log("Away for " + t + ": earned " + fmt(g.gold) + " lumen" + (g.shards ? " and " + g.shards + " shards" : ""), "good");
  save();
}

export function initOffline() {
  $("awayOk").addEventListener("click", () => { $("away").hidden = true; hold("away", false); updateUI(); });
}
