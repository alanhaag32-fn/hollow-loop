// The Index: kill records per shape family and the bonuses their tiers give.
import { S } from "../core/save.js";
import { cutBy, plus, statSource } from "../core/stats.js";
import { $, fmt, polyPts } from "../core/util.js";
import { VARIANTS, vFill } from "../enemies/enemies.js";
import { markDirty, panel } from "../ui/actions.js";
import { sfx } from "../audio/sound.js";
import { recalc } from "../hero/hero.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";
import { listen } from "../core/events.js";

const FAMILIES = [
  { key: "triad", sides: 3, name: "Triad", lore: "Sharp, fast and simple. The first shapes you'll meet.", n: [2, "% attack", v => ({ atk: 1 + v })], e: [4, "% crit damage", v => ({ critDmg: 1 + v })], b: [3, "% damage to bosses", v => ({ bossDmg: 1 + v })] },
  { key: "quad", sides: 4, name: "Quadrant", lore: "Blocky and stubborn, built to take hits.", n: [2, "% health", v => ({ maxHp: 1 + v })], e: [1, "% block chance", v => ({ block: plus(v) })], b: [2, "% less damage taken", v => ({ dmgTaken: cutBy("armor", v) })] },
  { key: "penta", sides: 5, name: "Pentad", lore: "Star-touched shapes that hum with stray mana.", n: [3, "% mana regen", v => ({ mpRegen: 1 + v })], e: [3, "% skill power", v => ({ skillPow: 1 + v })], b: [2, "% faster cooldowns", v => ({ cdr: 1 - v })] },
  { key: "hex", sides: 6, name: "Hexen", lore: "Hive-minded hoarders of lumen and scrap.", n: [3, "% lumen", v => ({ gold: 1 + v })], e: [2, "% loot drop chance", v => ({ drop: 1 + v })], b: [3, "% salvage lumen", v => ({ salv: plus(v) })] },
  { key: "hepta", sides: 7, name: "Heptarch", lore: "Restless shapes that never hold still.", n: [1.5, "% attack speed", v => ({ spd: 1 + v })], e: [3, "% evasion rating", v => ({ evaR: 1 + v })], b: [3, "% shorter statuses", v => ({ statusDur: 1 - v })] },
  { key: "octa", sides: 8, name: "Octave", lore: "Resonant shapes that ring like struck glass.", n: [5, "% tap damage", v => ({ tap: 1 + v })], e: [.3, "% life steal", v => ({ leech: plus(v) })], b: [2, "% echoes from ascending", v => ({ echoGain: 1 + v })] }
];
export const FAM = {};
statSource(give => FAMILIES.forEach(f => ["n", "e", "b"].forEach(k => { const t = IT(f.key, k); if (t) give(f[k][2], f[k][0] * t / 100); })));
 FAMILIES.forEach((f, i) => { f.idx = i; FAM[f.sides] = f; });
const IDX_TIERS = { n: [25, 150, 600], e: [5, 30, 120], b: [1, 5, 20] };
function idxKills(key, k) { const r = S.bestiary && S.bestiary[key]; return r ? r[k] || 0 : 0; }
function IT(key, k) { const c = idxKills(key, k); return IDX_TIERS[k].filter(t => c >= t).length; }
// count a kill toward its shape family's Index entry
function recordKill(e) {
  const fam = e.family; if (!fam) return;
  const kk = e.boss ? "b" : e.elite ? "e" : "n";
  const rec = S.bestiary[fam.key] || (S.bestiary[fam.key] = { n: 0, e: 0, b: 0 });
  const before = IT(fam.key, kk);
  rec[kk]++;
  if (e.v) { rec.v = rec.v || {}; rec.v[e.v.id] = (rec.v[e.v.id] || 0) + 1; }
  const tt = IT(fam.key, kk);
  if (tt > before) {
    log("Index: " + (kk === "e" ? "Elite " : kk === "b" ? "Grand " : "") + fam.name + " tier " + ["", "I", "II", "III"][tt] + " reached. Now +" + +(fam[kk][0] * tt).toFixed(1) + fam[kk][1], "r4");
    floatText("Index up", "info", "hero", "#ffd04d"); sfx("chord", 0, 300);
    recalc();
  }
  markDirty("index");
}
function renderIndex() {
  const active = [];
  FAMILIES.forEach(f => ["n", "e", "b"].forEach(k => { const t = IT(f.key, k); if (t) active.push("+" + +(f[k][0] * t).toFixed(1) + f[k][1]); }));
  let h = '<div class="wsub" data-sub="bonus"><p class="note">Every enemy type you defeat is recorded here. Each type has three milestones, and every milestone gives a permanent bonus that survives ascension. Pick a shape below to see its page.</p><div class="sgroup"><h3>Active index bonuses</h3>' + (active.length ? '<div class="idxSum">' + active.map(x => "<span>" + x + "</span>").join("") + "</div>" : '<p class="note">None yet. Your first milestone is 25 Triads.</p>') + "</div></div>";
  FAMILIES.forEach(f => {
    const hue = (f.idx * 53 + 200) % 360, found = ["n", "e", "b"].some(k => idxKills(f.key, k) > 0);
    h += '<div class="wsub idxPage" data-sub="f' + f.sides + '"><div class="idxHd2"><svg class="idxPic" viewBox="-21 -21 42 42" aria-hidden="true"><polygon points="' + polyPts(f.sides, 17, 0, 0, 0) + '" style="fill:' + (found ? "hsl(" + hue + " 55% 42%)" : "var(--line)") + ";stroke:" + (found ? "hsl(" + hue + " 75% 68%)" : "var(--muted)") + ';stroke-width:2.5;stroke-linejoin:round"/></svg><div class="idxT"><div class="n">' + (found ? f.name : "Undiscovered") + '</div><div class="lore">' + (found ? f.lore : f.sides + "-sided shapes, first seen around stage " + (10 * f.idx + 1)) + "</div></div></div>";
    const vk = (S.bestiary[f.key] && S.bestiary[f.key].v) || {};
    h += '<div class="idxSec">Variants</div><div class="idxVars">' + VARIANTS.map(v => {
      const c = vk[v.id] || 0;
      return '<div class="idxTile" style="--vc:' + (c ? vFill(v) : "var(--line)") + '"><div class="tt"><b>' + (c ? v.name : "???") + "</b>" + (c ? "<span>" + v.role + "</span><em>" + fmt(c) + "</em>" : "") + '</div><div class="td">' + (c ? v.desc : "Appears from stage " + Math.max(v.from, 10 * f.idx + 1)) + "</div></div>";
    }).join("") + '</div><div class="idxSec">Milestones</div><div class="idxMs">';
    ["n", "e", "b"].forEach(k => {
      const c = idxKills(f.key, k), t = IT(f.key, k), next = IDX_TIERS[k][t];
      const label = (k === "e" ? "Elite " : k === "b" ? "Grand " : "") + f.name;
      const first = k === "b" ? 10 * (f.idx + 1) : k === "e" ? (f.idx === 0 ? 61 : 10 * f.idx + 1) : 10 * f.idx + 1;
      h += '<div class="idxM"><div class="mt"><b>' + (c ? label : "??? " + (k === "e" ? "elite" : k === "b" ? "boss" : "shape")) + '</b><span class="pips" aria-label="Tier ' + t + ' of 3">' + [1, 2, 3].map(i => '<i class="' + (i <= t ? "on" : "") + '"></i>').join("") + "</span></div>" +
        '<div class="pbar"><i style="width:' + (next ? Math.min(100, c / next * 100) : 100) + '%"></i></div>' +
        '<div class="mm"><span>' + (c ? fmt(c) + (next ? " / " + fmt(next) : ", complete") : "First around stage " + first) + "</span><span>" + (t ? "+" + +(f[k][0] * t).toFixed(1) + f[k][1] + " · +" + f[k][0] + "%/tier" : "+" + f[k][0] + f[k][1] + " per tier") + "</span></div></div>";
    });
    h += "</div></div>";
  });
  $("indexBody").innerHTML = h;
}
panel("index", { render: renderIndex, tabs: () => [["bonus", "Bonuses"]].concat(FAMILIES.map(f => ["f" + f.sides, f.name.length > 6 ? f.name.slice(0, 5) : f.name, f.sides])) });
listen((type, n, e) => { if (type === "kill") recordKill(e); });
