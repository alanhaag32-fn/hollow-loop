// The bounty board: notices, progress, claiming and rerolling.
import { lumenAt, lumenBase } from "../core/curves.js";
import { addGold, addShards, goldScale, shardAmt } from "../progress/currency.js";
import { S } from "../core/save.js";
import { ST } from "../core/stats.js";
import { $, fmt, mmss, pick, rnd } from "../core/util.js";
import { receive } from "../gear/inventory.js";
import { makeItem } from "../gear/items.js";
import { action, markDirty, panel } from "../ui/actions.js";
import { log } from "../ui/log.js";

const POST_CD = 5 * 60000, REROLL_CD = 10 * 60000;
const POSTERS = ["Posted by the Lantern Guild", "Signed: a nervous cartographer", "From the Hollow Wardens", "Unsigned, smells of ozone", "The Prism Collective pays well", "Stamped by the Loop Authority", "Scrawled in glowing chalk", "Left by a retired core"];
const TIERS = [{ name: "Notice", cv: "var(--c0)" }, { name: "Rare notice", cv: "var(--c2)" }, { name: "Gold seal", cv: "var(--c4)" }];
const BOUNTY_T = [
  { type: "kill", w: 1, n: () => 40 + rnd(41), text: n => "Destroy " + n + " shapes" },
  { type: "elite", w: 1.6, n: () => 4 + rnd(5), text: n => "Defeat " + n + " elites" },
  { type: "boss", w: 2.5, n: () => 2 + rnd(2), text: n => "Topple " + n + " bosses" },
  { type: "tap", w: 1, n: () => 250 + rnd(201), text: n => "Tap-strike " + n + " times" },
  { type: "cast", w: 1.2, n: () => 15 + rnd(16), text: n => "Cast " + n + " skills" },
  { type: "rare", w: 1.6, n: () => 3 + rnd(4), text: n => "Find " + n + " Rare or better items" },
  { type: "crit", w: 1, n: () => 100 + rnd(101), text: n => "Land " + n + " critical hits" },
  { type: "evade", w: 1.3, n: () => 20 + rnd(21), text: n => "Evade " + n + " attacks" },
  { type: "block", w: 1.3, n: () => 20 + rnd(21), text: n => "Block " + n + " attacks" },
  { type: "salvage", w: .8, n: () => 15 + rnd(16), text: n => "Salvage " + n + " items" },
  { type: "stage", w: 1.5, n: () => 5 + rnd(6), text: n => "Clear " + n + " stages" },
  { type: "gold", w: 1, n: () => Math.ceil(goldScale() * (100 + rnd(101))), text: n => "Earn " + fmt(n) + " lumen" }
];
const BT = {};
 BOUNTY_T.forEach(b => BT[b.type] = b);
// effort in "kills worth of time" for each bounty type; rewards are worth well over the time spent
export const EFFORT = { kill: n => n, elite: n => 8 * n, boss: n => 60 * n, tap: n => n / 6, cast: n => 3 * n, rare: n => 40 * n, crit: n => 1.2 * n, evade: n => 4 * n, block: n => 4 * n, salvage: n => 3 * n, stage: n => 8 * n };
function newBounty() {
  const t = pick(BOUNTY_T), roll = Math.random(), tier = roll < .04 ? 2 : roll < .19 ? 1 : 0, n = t.n();
  return {
    type: t.type, n, prog: 0, tier, poster: pick(POSTERS),
    eff: t.type === "gold" ? n / (lumenAt(S.maxStage) * (ST ? ST.gold : 1)) : EFFORT[t.type](n),
    item: tier >= 1, echo: tier === 2 ? 1 : 0, shards: (3 + 3 * tier) * shardAmt(S.maxStage)
  };
}
const bountyGold = b => b.eff ? Math.ceil(b.eff * lumenBase(S.maxStage) * (1 + .5 * b.tier) * ST.bountyGold * ST.gold) : (b.gold || 0);
export function ensureBoard() {
  let changed = false;
  const size = ST.bountySlots;
  if (S.bounties.length > size) { S.bounties.length = size; changed = true; }
  while (S.bounties.length < size) { S.bounties.push(newBounty()); changed = true; }
  S.bounties.forEach((b, i) => { if (b.empty && Date.now() >= b.at) { S.bounties[i] = newBounty(); changed = true; log("A new bounty was posted", "r4"); } });
  if (changed) markDirty("board");
}
export function bump(type, amt) {
  S.bounties.forEach(b => {
    if (b.empty || b.type !== type || b.prog >= b.n) return;
    b.prog = Math.min(b.n, b.prog + amt);
    if (b.prog >= b.n) { log("Bounty complete. Claim it on the board", "r4"); markDirty("board"); }
  });
}
function claim(i) {
  const b = S.bounties[i];
  if (!b || b.empty || b.prog < b.n) return;
  const pay = bountyGold(b);
  addGold(pay, false);
  let msg = "Bounty paid " + fmt(pay) + " lumen";
  if (b.shards) { addShards(b.shards); msg += ", " + b.shards + " shards"; }
  if (b.echo) { S.echoes += b.echo; S.echoesTotal += b.echo; msg += " and " + b.echo + " echo"; markDirty("tree"); }
  log(msg, "good");
  if (b.item) receive(makeItem(S.maxStage, false, b.tier === 2 ? 3 : 2), true);
  S.bounties[i] = { empty: true, at: Date.now() + POST_CD * ST.postTime };
  S.bountyDone++;
  markDirty("board");
}
const rerollCost = () => Math.ceil(goldScale() * 15);
function reroll() {
  const c = rerollCost();
  if (Date.now() < S.rerollAt || S.gold < c) return;
  if (!S.bounties.some(b => !b.empty && b.prog < b.n)) return;
  S.gold -= c;
  S.bounties = S.bounties.map(b => (b.empty || b.prog >= b.n) ? b : newBounty());
  S.rerollAt = Date.now() + REROLL_CD;
  markDirty("board");
}
function rewardText(b) {
  let t = "+" + fmt(bountyGold(b)) + " lumen";
  if (b.shards) t += ", " + b.shards + " shards";
  if (b.item) t += ", " + (b.tier === 2 ? "an Epic+" : "a Rare+") + " item";
  if (b.echo) t += ", 1 echo";
  return t;
}
function renderBoard() {
  const h = S.bounties.map((b, i) => {
    if (b.empty) return '<div class="paper blank"><div class="obj" style="margin:0">Empty pin</div><div class="pline" style="justify-content:center"><span id="bt' + i + '">New posting in ' + mmss(Math.max(0, b.at - Date.now())) + "</span></div></div>";
    const tr = TIERS[b.tier], done = b.prog >= b.n;
    return '<div class="paper" style="--pc:' + tr.cv + '"><span class="pin"></span><div class="ptop"><span class="tier">' + tr.name + '</span><span class="who">' + b.poster + '</span></div><div class="obj">' + BT[b.type].text(b.n) + '</div>' +
      '<div class="pbar"><i id="bp' + i + '" style="width:' + Math.min(100, b.prog / b.n * 100) + '%"></i></div>' +
      '<div class="pline"><span id="bt' + i + '">' + fmt(b.prog) + " / " + fmt(b.n) + '</span><span class="rw">' + rewardText(b) + "</span></div>" +
      '<button class="btn go claimB" data-act="claim" data-id="' + i + '" id="bc' + i + '"' + (done ? "" : " disabled") + ">Claim</button></div>";
  }).join("");
  $("boardBody").innerHTML = '<div class="board">' + h + "</div>";
  if ($("boardDone")) $("boardDone").textContent = S.bountyDone;
}
panel("board", {
  bar: () => '<div class="barInfo"><b id="boardDone">' + S.bountyDone + '</b> completed<br>New posting 5 min after a claim</div><button class="btn" type="button" id="rerollBtn" data-act="reroll">Reroll</button>',
  fill: () => "board",
  render: renderBoard,
  refresh() {
    S.bounties.forEach((b, i) => {
      const p = $("bp" + i), t = $("bt" + i), c = $("bc" + i);
      if (b.empty) { if (t) t.textContent = "New posting in " + mmss(Math.max(0, b.at - Date.now())); return; }
      if (p) p.style.width = Math.min(100, b.prog / b.n * 100) + "%";
      if (t) t.textContent = fmt(b.prog) + " / " + fmt(b.n);
      if (c) c.disabled = b.prog < b.n;
    });
    const rb = $("rerollBtn"), left = S.rerollAt - Date.now(), c = rerollCost();
    if (rb) {
      rb.disabled = left > 0 || S.gold < c;
      rb.textContent = left > 0 ? "Reroll in " + mmss(left) : "Reroll: " + fmt(c) + " lumen";
    }
  }
});
action("claim", id => claim(Number(id)));
action("reroll", () => reroll());
