// Honing and reforging affixes after a Transcend.
import { sfx } from "../audio/sound.js";
import { shardAmt } from "../core/economy.js";
import { S } from "../core/save.js";
import { ST } from "../core/stats.js";
import { fmt, pick } from "../core/util.js";
import { RARITY, affPool, affText } from "./items.js";
import { TRANS_AT, cycleBest } from "../progress/transcend.js";
import { action } from "../ui/actions.js";

const canForge = () => (S.transcends || 0) >= 1 && cycleBest() >= TRANS_AT;
let rfOpen = null, rfPend = null;
const findItem = id => Object.values(S.equip).find(x => x && x.id === id) || S.inv.find(x => x.id === id);
const honeCost = it => Math.ceil(3 * shardAmt(it.stage || 1) * Math.max(1, it.r) * Math.pow(1.5, it.rr || 0));
const reforgeCost = it => 3 * honeCost(it);
const rollAff = it => { const R = RARITY[it.r]; return Math.round((R.aff[0] + Math.random() * (R.aff[1] - R.aff[0])) * ST.affixPow); };
export function forgeUI(it) {
  if (!canForge() || !(it.affs && it.affs.length) || !RARITY[it.r].aff) return "";
  if (rfOpen !== it.id) return '<div class="acts"><button class="btn" data-act="rfOpen" data-id="' + it.id + '">Reforge</button></div>';
  const hc = honeCost(it), rc = reforgeCost(it);
  let h = '<div class="forgeBox"><div class="fr"><span>Hone rerolls a value. Reforge swaps a stat for another (only one stat per item can ever be reforged). Each roll on this item costs 1.5x more.</span></div>';
  it.affs.forEach(([k, b], i) => {
    const pend = rfPend && rfPend.id === it.id && rfPend.i === i;
    h += '<div class="fr"><span>' + affText(k, b) + (it.rf === i ? " (reforged)" : "") + "</span>";
    if (pend) h += '<span class="pend">New: ' + affText(rfPend.k, rfPend.b) + '</span><span><button class="btn go" data-act="rfKeep" data-id="' + it.id + '">Keep new</button> <button class="btn" data-act="rfOld" data-id="' + it.id + '">Keep old</button></span>';
    else if (!rfPend || rfPend.id !== it.id) h += '<span><button class="btn' + (S.shards >= hc ? "" : " dim") + '" data-act="rfHone" data-id="' + it.id + '" data-i="' + i + '">Hone ' + fmt(hc) + "</button>" +
      (it.rf == null || it.rf === i ? ' <button class="btn' + (S.shards >= rc ? "" : " dim") + '" data-act="rfRe" data-id="' + it.id + '" data-i="' + i + '">Reforge ' + fmt(rc) + "</button>" : "") + "</span>";
    h += "</div>";
  });
  return h + '<div class="fr"><span>Costs are in shards. You have ' + fmt(S.shards) + '.</span><button class="btn" data-act="rfOpen" data-id="' + it.id + '">Close</button></div></div>';
}
function forgeAct(act, id, i) {
  const it = findItem(id); if (!it) return;
  if (act === "rfOpen") { rfOpen = rfOpen === id ? null : id; rfPend = null; }
  else if (act === "rfHone" || act === "rfRe") {
    if (!canForge() || rfPend) return;
    const re = act === "rfRe", c = re ? reforgeCost(it) : honeCost(it);
    if (S.shards < c || !it.affs[i] || (re && it.rf != null && it.rf !== i)) return;
    S.shards -= c; it.rr = (it.rr || 0) + 1;
    let k = it.affs[i][0];
    if (re) { const have = it.affs.map(a => a[0]).filter((x, j) => j !== i), pool = affPool(it.slot).filter(x => !have.includes(x) && x !== k); if (pool.length) k = pick(pool); it.rf = i; }
    rfPend = { id, i, k, b: rollAff(it) };
    sfx("chord", 0, 0);
  } else if (act === "rfKeep" || act === "rfOld") {
    if (!rfPend || rfPend.id !== id) return;
    if (act === "rfKeep") it.affs[rfPend.i] = [rfPend.k, rfPend.b];
    rfPend = null;
  }
}
["rfOpen", "rfHone", "rfRe", "rfKeep", "rfOld"].forEach(a => action(a, (id, b) => forgeAct(a, Number(id), Number(b.dataset.i))));
