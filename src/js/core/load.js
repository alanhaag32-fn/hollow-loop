// Loading the save, with every migration from older versions in one place.
import { EFFORT } from "../bounty/bounty.js";
import { itemPow, lumenAt } from "./curves.js";
import { KEPT, S, fresh, readSave, setSave } from "./save.js";
// the current economy version (what fresh saves start at)
const ECO = KEPT().eco;
import { AFF, LEGACY, RARITY, SLOT, rollAffix } from "../gear/items.js";
import { AUTO_REFUND } from "../progress/automation.js";
import { TRAIN } from "../train/train.js";

// item names and affixes from older versions
function migrateItem(it, from) {
  if (!it) return;
  const parts = it.name.split(" ");
  if (it.slot === "boots" && parts[parts.length - 1] === "Feather") parts[parts.length - 1] = "Wake";
  const last = parts[parts.length - 1];
  if (!SLOT[it.slot].nouns.includes(last)) (LEGACY[it.slot] || []).forEach(list => { const i = list.indexOf(last); if (i >= 0) parts[parts.length - 1] = SLOT[it.slot].nouns[i]; });
  it.name = parts.join(" ");
  if (!it.affs) { it.affs = it.aff ? [[it.aff, it.affv]] : []; delete it.aff; delete it.affv; }
  // v1 "hp" was health already; in v2 "mp" meant the life pool, which is health again now
  it.affs.forEach(a => { if (from === 2 && a[0] === "mp") a[0] = "hp"; if (!AFF[a[0]]) a[0] = "atk"; });
}
// economy versions: rescale gear to the exponential curve and repost bounties with the new rewards;
// refund automation bought in the Star Forge (it's free after a Transcend now); Siphon became Dash
function migrateEco() {
  if (S.forge) { let back = 0; for (const k in AUTO_REFUND) if (S.forge[k]) { back += AUTO_REFUND[k]; delete S.forge[k]; } if (back) { S.stardust = (S.stardust || 0) + back; S.refundNote = "Automation is now free once you Transcend: refunded " + back + " Stardust"; } }
  if ((S.eco || 0) === 6) S.eco = ECO;
  if (S.skill && S.skill.siphon) { S.skill.dash = Math.max(S.skill.dash || 0, S.skill.siphon); delete S.skill.siphon; }
  if (S.auto && "siphon" in S.auto) { S.auto.dash = S.auto.siphon; delete S.auto.siphon; }
  if ((S.eco || 0) >= 6) return;
  // v6 retune: training caps changed
  if (S.eco === 5) { trimTraining(); S.eco = ECO; return; }
  const fix = it => {
    if (!it) return; const r = RARITY[it.r] || RARITY[0];
    it.power = Math.max(1, Math.round(itemPow(it.stage || 1) * r.mult * (.95 + Math.random() * .1)));
    (it.affs || []).forEach(a => { if (r.aff) a[1] = rollAffix(r); });
  };
  Object.values(S.equip).forEach(fix); S.inv.forEach(fix);
  trimTraining();
  // keep posted bounties (and their progress), just switch them to the new payout
  S.bounties.forEach(b => { if (!b.empty && !b.eff) { b.eff = b.type === "gold" ? b.n / lumenAt(S.maxStage) : EFFORT[b.type] ? EFFORT[b.type](b.n) : b.n; delete b.gold; } });
  S.eco = ECO;
}
// web nodes that no longer exist give their echoes back (rank r of a node costing c cost c * r in echoes)
const RETIRED_NODES = { f7: { c: 3, note: "Head Start left the web (the Star Forge has it); Prospector took its place" } };
function retireNodes() {
  for (const id in RETIRED_NODES) {
    const r = S.tree[id], o = RETIRED_NODES[id];
    if (!r) continue;
    const back = o.c * r * (r + 1) / 2;
    delete S.tree[id]; S.echoes = (S.echoes || 0) + back; S.refundNote = o.note + ": refunded " + back + " echoes";
  }
}
function trimTraining() { TRAIN.forEach(t => { if (t.max && S.train[t.id] > t.max) S.train[t.id] = t.max; }); }
export function load() {
  const d = readSave();
  if (!d) return;
  if (typeof d.shards !== "number") d.shards = 0;
  const from = d.v || 2;
  setSave(Object.assign(fresh(), d));
  S.eco = d.eco || 0;
  S.v = KEPT().v;
  S.train = d.train || {};
  if (from === 2 && d.train && d.train.essence) { S.train.vigor = d.train.essence; S.train.essence = 0; }
  S.tree = d.tree || {};
  retireNodes();
  S.oc = d.oc || {};
  S.forge = d.forge || {};
  S.abyss = Object.assign(KEPT().abyss, d.abyss || {}); S.abyss.altar = S.abyss.altar || {};
  // saved by an older version inside the Abyss, which borrowed the main stage
  if (S.abyss.ret) { S.stage = S.abyss.ret.stage; S.kills = S.abyss.ret.kills; S.push = S.abyss.ret.push; delete S.abyss.ret; }
  S.autoCfg = Object.assign(KEPT().autoCfg, d.autoCfg || {});
  if (!d.cyclePeak) S.cyclePeak = Math.max(S.peak || 1, S.maxStage || 1);
  S.skill = d.skill || {};
  S.auto = Object.assign(KEPT().auto, d.auto || {});
  S.equip = d.equip || {};
  S.inv = d.inv || [];
  S.bounties = (d.bounties || []).slice(0, 3);
  S.peak = Math.max(S.peak || 1, S.maxStage);
  Object.values(S.equip).forEach(it => migrateItem(it, from));
  S.inv.forEach(it => migrateItem(it, from));
  migrateEco();
}
