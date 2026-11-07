// Training: lumen upgrades, their Overcharge, buying them (by hand or Auto-Train) and the Train window.
import { sfx } from "../audio/sound.js";
import { milesAt, nextMile } from "../core/curves.js";
import { S } from "../core/save.js";
import { ST, plus, statSource } from "../core/stats.js";
import { $, fmt } from "../core/util.js";
import { recalc } from "../hero/hero.js";
import { action, markDirty, panel } from "../ui/actions.js";
import { floatText } from "../ui/floats.js";

// oc (Overcharge): once a capped upgrade is maxed it keeps going with no level limit.
// Stats already at a hard ceiling get a related bonus instead.
export const TRAIN = [
  { unlock: 1, id: "might", name: "Might", cat: "off", base: 10, g: 1.18, mode: "mult", stat: "attack", mile: 2, eff: L => (1 + .1 * L) * Math.pow(2, milesAt(L)), stats: v => ({ atk: v }) },
  { unlock: 1, id: "vigor", name: "Vigor", cat: "def", base: 10, g: 1.18, mode: "mult", stat: "health", mile: 2, eff: L => (1 + .1 * L) * Math.pow(2, milesAt(L)), stats: v => ({ maxHp: v }) },
  { unlock: 1, id: "focus", name: "Focus", cat: "off", base: 15, g: 1.5, max: 100, mode: "pct", stat: "tap damage", eff: L => 1 + .015 * L, stats: v => ({ tap: v }), oc: { per: .01, stat: "tap damage", stats: v => ({ tap: 1 + v }) } },
  { unlock: 2, id: "greed", name: "Greed", cat: "fort", base: 40, g: 1.25, mode: "mult", stat: "lumen", mile: 1.25, eff: L => (1 + .05 * L) * Math.pow(1.25, milesAt(L)), stats: v => ({ gold: v }) },
  { unlock: 3, id: "haste", name: "Haste", cat: "off", base: 50, g: 1.42, max: 120, mode: "pct", stat: "attack speed", eff: L => 1 + .01 * L, stats: v => ({ spd: v }), oc: { per: .005, stat: "attack speed", stats: v => ({ spd: 1 + v }) } },
  { unlock: 5, id: "essence", name: "Essence", cat: "mana", base: 40, g: 1.6, max: 75, mode: "pct", stat: "max mana", eff: L => 1 + .04 * L, stats: v => ({ maxMp: v }), oc: { per: .02, stat: "max mana", stats: v => ({ maxMp: 1 + v }) } },
  { unlock: 6, id: "tempo", name: "Tempo", cat: "mana", base: 60, g: 1.6, max: 50, mode: "less", stat: "skill cooldowns", eff: L => 1 - .01 * L, stats: v => ({ cdr: v }), oc: { per: .003, stat: "cooldowns", less: true, stats: v => ({ cdr: 1 - v, cdrFloor: plus(-Math.min(.1, v / 3)) }) } },
  { unlock: 8, id: "flow", name: "Flow", cat: "mana", base: 50, g: 1.5, max: 100, mode: "pct", stat: "mana regen", eff: L => 1 + .03 * L, stats: v => ({ mpRegen: v }), oc: { per: .02, stat: "mana regen", stats: v => ({ mpRegen: 1 + v }) } },
  { unlock: 10, id: "ferocity", name: "Ferocity", cat: "off", base: 80, g: 1.5, max: 100, mode: "pct", stat: "crit damage", eff: L => 1 + .01 * L, stats: v => ({ critDmg: v }), oc: { per: .02, stat: "red crit power", stats: v => ({ redPow: 1 + v }) } },
  { unlock: 12, id: "agility", name: "Agility", cat: "def", base: 60, g: 1.22, mode: "pct", stat: "evasion rating", eff: L => 1 + .05 * L, stats: v => ({ evaR: v }) },
  { unlock: 14, id: "clarity", name: "Clarity", cat: "def", base: 100, g: 1.6, max: 45, mode: "less", stat: "status duration", eff: L => 1 - .01 * L, stats: v => ({ statusDur: v }), oc: { per: .01, stat: "chance to ignore a new status effect", cap: .5, stats: v => ({ shrug: plus(v) }) } },
  { unlock: 15, id: "guard", name: "Guard", cat: "def", base: 120, g: 1.6, max: 60, mode: "add", stat: "block chance", eff: L => .0025 * L, stats: v => ({ block: plus(v) }), oc: { per: .005, stat: "damage blocked", cap: .2, stats: v => ({ blockLeak: plus(-v) }) } },
  { unlock: 18, id: "precision", name: "Precision", cat: "off", base: 150, g: 1.55, max: 80, mode: "add", stat: "crit chance", eff: L => .0025 * L, stats: v => ({ crit: plus(v) }), oc: { per: .01, stat: "crit chance", stats: v => ({ crit: plus(v) }) } },
  { unlock: 20, id: "insight", name: "Insight", cat: "mana", base: 120, g: 1.45, max: 100, mode: "pct", stat: "skill power", eff: L => 1 + .01 * L, stats: v => ({ skillPow: v }), oc: { per: .01, stat: "skill power", stats: v => ({ skillPow: 1 + v }) } },
  { unlock: 25, id: "leech", name: "Leech", cat: "def", base: 150, g: 1.45, max: 40, mode: "add", stat: "life steal", eff: L => .0015 * L, stats: v => ({ leech: plus(v) }), oc: { per: .03, stat: "life steal heal limit", stats: v => ({ leechCap: plus(v) }) } },
  { unlock: 30, id: "fortune", name: "Fortune", cat: "fort", base: 200, g: 1.6, max: 50, mode: "pct", stat: "loot drop chance", eff: L => 1 + .01 * L, stats: v => ({ drop: v }), oc: { per: .01, stat: "rare luck", stats: v => ({ luck: plus(v) }) } }
];
const TRN = {};
statSource(give => TRAIN.forEach(t => { give(t, tm(t.id)); if (t.oc && ocL(t.id)) give(t.oc, ocV(t.id)); }));
 TRAIN.forEach(t => TRN[t.id] = t);
const tmax = t => t.max ? t.max + ST.trainCap : 0;
const ocL = id => (S.oc && S.oc[id]) || 0;
const ocV = id => { const o = TRN[id].oc, v = o.per * ocL(id); return o.cap ? Math.min(o.cap, v) : v; };
const trainLvl = id => S.train[id] || 0;
const isOC = t => !!(t.max && t.oc && trainLvl(t.id) >= tmax(t));
const ocCostN = (t, n) => { const first = 3 * t.base * Math.pow(t.g, tmax(t) - 1); let c = 0; const L = ocL(t.id); for (let i = 0; i < n; i++) c += first * Math.pow(ST.ocGrowth, L + i); return Math.ceil(c); };
const tm = id => TRN[id].eff(trainLvl(id));
let buyN = 1;
const trainCostN = (t, n) => { let c = 0; const L = trainLvl(t.id); for (let i = 0; i < n; i++) c += t.base * Math.pow(t.g, L + i); return Math.ceil(c); };
function trainPrice(t, n) {
  if (S.maxStage < t.unlock) return Infinity;
  if (isOC(t)) return t.oc.cap && ocV(t.id) >= t.oc.cap ? Infinity : ocCostN(t, n);
  if (t.max && trainLvl(t.id) + n > tmax(t)) return Infinity;
  return trainCostN(t, n);
}
function buyTraining(t, n) {
  const oc = isOC(t), c = trainPrice(t, n);
  if (!(S.gold >= c)) return false;
  S.gold -= c;
  if (oc) { S.oc = S.oc || {}; S.oc[t.id] = ocL(t.id) + n; } else S.train[t.id] = trainLvl(t.id) + n;
  return true;
}
function buyCount(t) {
  if (isOC(t)) {
    if (buyN !== "max") return buyN;
    let n = 0; while (n < 500 && ocCostN(t, n + 1) <= S.gold) n++;
    return Math.max(1, n);
  }
  const L = trainLvl(t.id), room = t.max ? tmax(t) - L : 1e9;
  if (buyN !== "max") return Math.max(1, Math.min(buyN, room));
  let n = 0, c = 0;
  while (n < room && n < 2000) { const nc = t.base * Math.pow(t.g, L + n); if (c + nc > S.gold) break; c += nc; n++; }
  return Math.max(1, n);
}
function effText(t, L) {
  const v = t.eff(L);
  const pc = x => String(Number((x * 100).toFixed(2)));
  if (t.mode === "mult") return "x" + (v < 100 ? v.toFixed(2) : fmt(v)) + " " + t.stat;
  if (t.mode === "pct") return "+" + pc(v - 1) + "% " + t.stat;
  if (t.mode === "less") return "-" + pc(1 - v) + "% " + t.stat;
  return "+" + pc(v) + "% " + t.stat;
}
function renderTrain() {
  const bar = '<div class="buyBar"><span>Buy</span>' + [1, 10, "max"].map(n => '<button class="btn' + (buyN === n ? " go" : "") + '" data-act="buyN" data-id="' + n + '">' + (n === "max" ? "Max" : "x" + n) + "</button>").join("") + "</div>";
  $("trainBody").innerHTML = bar + ["off", "def", "mana", "fort"].map(cat => '<div class="wsub list" data-sub="' + cat + '">' + TRAIN.filter(t => t.cat === cat).map(t => {
    if (S.maxStage < t.unlock) return '<div class="row lock"><span class="n">' + t.name + '</span><span class="d">' + t.stat + ". Unlocks at stage " + t.unlock + "</span></div>";
    if (isOC(t)) {
      const o = t.oc, n = buyCount(t), c = ocCostN(t, n), v0 = ocV(t.id), v1 = o.cap ? Math.min(o.cap, o.per * (ocL(t.id) + n)) : o.per * (ocL(t.id) + n);
      const pc = v => (o.less ? "-" : "+") + String(Number((v * 100).toFixed(1))) + "%";
      return '<div class="row oc"><span class="n">' + t.name + ' <span class="ocTag">OC</span> Lv ' + ocL(t.id) + '</span><span class="d">' + effText(t, tmax(t)) + '</span><span class="d ocd">Overcharge: ' + pc(v0) + " " + o.stat + '<span class="nx"> →\u00a0' + pc(v1) + "</span></span>" +
        '<div class="side">' + (o.cap && v0 >= o.cap ? '<button class="btn" disabled>Maxed</button>' : '<button class="btn" data-act="train" data-id="' + t.id + '" data-n="' + n + '" data-cost="' + c + '">' + (n > 1 ? "+" + n + " · " : "") + fmt(c) + " lumen</button>") + "</div></div>";
    }
    const L = trainLvl(t.id), maxed = t.max && L >= tmax(t), n = buyCount(t), c = trainCostN(t, n), nm = t.mile && nextMile(L);
    return '<div class="row"><span class="n">' + t.name + " Lv " + L + (t.max ? " / " + tmax(t) : "") + '</span><span class="d">' + effText(t, L) + (maxed ? "" : '<span class="nx"> →\u00a0' + effText(t, L + n).replace(/ .*/, "") + "</span>") + "</span>" +
      (nm ? '<span class="d mile">x' + t.mile + " bonus at Lv " + nm + "</span>" : "") + '<div class="side">' +
      (maxed ? '<button class="btn" disabled>Maxed</button>' : '<button class="btn" data-act="train" data-id="' + t.id + '" data-n="' + n + '" data-cost="' + c + '">' + (n > 1 ? "+" + n + " · " : "") + fmt(c) + " lumen</button>") + "</div></div>";
  }).join("") + "</div>").join("");
}
panel("train", {
  render: renderTrain,
  refresh() {
    if (buyN !== "max") return;
    $("p-train").querySelectorAll('[data-act="train"]').forEach(b => {
      const t = TRN[b.dataset.id], n = buyCount(t), c = isOC(t) ? ocCostN(t, n) : trainCostN(t, n);
      if (Number(b.dataset.n) === n) return;
      if (isOC(t)) { markDirty("train"); return; }
      b.dataset.n = n; b.dataset.cost = c; b.textContent = (n > 1 ? "+" + n + " · " : "") + fmt(c) + " lumen";
      b.classList.toggle("afford", S.gold >= c);
      const nx = b.closest(".row").querySelector(".nx"); if (nx) nx.textContent = " → " + effText(t, trainLvl(t.id) + n).replace(/ .*/, "");
    });
  }
});
action("buyN", id => { buyN = id === "max" ? "max" : Number(id); });
action("train", id => {
  const t = TRN[id], before = milesAt(trainLvl(id));
  if (!buyTraining(t, buyCount(t))) return false;
  sfx("buy", 0, 0);
  if (t.mile && milesAt(trainLvl(id)) > before) { floatText(t.name + " x" + t.mile + "!", "info", "hero", "#ffd04d"); sfx("chord", 0, 0); }
});
export function autoTrain() {
  let bought = 0;
  for (let g = 0; g < 80; g++) {
    let best = null, bc = Infinity;
    TRAIN.forEach(t => { if (S.autoCfg.train[t.id] === false) return; const c = trainPrice(t, 1); if (c < bc) { bc = c; best = t; } });
    if (!best || !buyTraining(best, 1)) break;
    bought++;
  }
  if (bought) { recalc(); markDirty("train", "skills"); }
}
