// Getting, stashing, salvaging and equipping items, and the Gear and Pack windows.
import { bump } from "../bounty/bounty.js";
import { dps, effSpd } from "../combat/combat.js";
import { itemPow } from "../core/curves.js";
import { addGold, addShards } from "../core/economy.js";
import { S } from "../core/save.js";
import { ST } from "../core/stats.js";
import { $, NS, fmt, pct, svgEl } from "../core/util.js";
import { equipFlash } from "../fx/effects.js";
import { reduce } from "../fx/gfx.js";
import { ARENA_C, PACK_CAP, RARITY, SET, SETS, SLOT, UNIQ, affText, implOf, noun, salvShards, salvValue, score } from "./items.js";
import { forgeUI } from "./reforge.js";
import { coronaSvg, evadeChance, hero, lensSvg, recalc, setCounts, shellSvg } from "../hero/hero.js";
import { HERO_WEAPON, ORBIT, ORBITALS, WTRAIT, baseSlot, weaponType, openOrbitals, orbRate, slotAtk, slotLabel, slotOpen, traitText, wType } from "../hero/orbitals.js";
import { action, markDirty, panel } from "../ui/actions.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";

const SALV_LABEL = ["Off", "Common", "Up to Magic", "Up to Rare"];
function salvage(it) { addGold(salvValue(it), false); addShards(salvShards(it)); bump("salvage", 1); }
function stash(it) {
  if (it.r < S.salv || S.inv.length >= PACK_CAP) { salvage(it); return; }
  S.inv.unshift(it); markDirty("pack");
}
function equipFromPack(k, id) {
  const idx = S.inv.findIndex(i => i.id === id);
  if (idx < 0 || !slotOpen(k) || S.inv[idx].slot !== baseSlot(k)) return false;
  const it = S.inv[idx], cur = S.equip[k];
  S.equip[k] = it; if (cur) S.inv[idx] = cur; else S.inv.splice(idx, 1);
  equipFlash(it.r);
  return true;
}
export function fillOrbital(o) {
  const best = S.inv.filter(i => i.slot === "weapon").sort((a, b) => score(b) - score(a))[0];
  if (!best || S.equip[o.key]) return null;
  S.inv.splice(S.inv.indexOf(best), 1); S.equip[o.key] = best;
  return best;
}
function placeWeapon(it) {
  const sl = openOrbitals().map(o => o.key), all = sl.map(k => S.equip[k]).filter(Boolean).concat(it).sort((a, b) => score(b) - score(a));
  const at = all.indexOf(it);
  if (at >= sl.length) return null;
  sl.forEach((k, i) => { if (all[i]) S.equip[k] = all[i]; else delete S.equip[k]; });
  all.slice(sl.length).forEach(stash);
  return ORBIT[sl[at]].nth;
}
export function receive(it, quiet) {
  const cur = S.equip[it.slot];
  if (it.r >= 2) bump("rare", 1);
  if (it.slot === "weapon" && ORBIT.weapon2.open() && S.autoEquip) {
    const where = placeWeapon(it);
    if (where) {
      recalc(); markDirty("gear", "pack");
      setTimeout(() => equipFlash(it.r), quiet ? 0 : 600);
      if (it.r >= 2) log("Equipped " + RARITY[it.r].name + " " + it.name + (where !== "main" ? " as your " + where + " orbital" : ""), "r" + it.r);
    } else { stash(it); if (it.r >= 2) log("Found " + RARITY[it.r].name + " " + it.name, "r" + it.r); }
    return it;
  }
  if (S.autoEquip && (!cur || score(it) > score(cur))) {
    S.equip[it.slot] = it;
    if (cur) stash(cur);
    recalc(); markDirty("gear", "pack");
    setTimeout(() => equipFlash(it.r), quiet ? 0 : 600);
    if (it.r >= 2) log("Equipped " + RARITY[it.r].name + " " + it.name + (it.set ? " (set)" : ""), "r" + it.r);
  } else {
    stash(it);
    if (it.r >= 2) log("Found " + RARITY[it.r].name + " " + it.name + (it.set ? " (set)" : ""), "r" + it.r);
  }
  return it;
}
const glyph = slotId => '<svg class="glyph" viewBox="0 0 36 36" aria-hidden="true"><path d="' + SLOT[slotId].shape + '" fill="var(--rc, var(--line))" fill-rule="evenodd"/></svg>';
function itemCard(it, mode, label, extra) {
  const slot = SLOT[it.slot], r = RARITY[it.r];
  const tr = it.slot === "weapon" ? WTRAIT[weaponType(it)] : null;
  const im = implOf(it);
  const traitL = (tr ? '<div class="trait"><b>' + tr.name + "</b>: " + traitText(it) + "</div>" : "") + (im ? '<div class="impl">' + noun(it) + ": " + im.txt + "</div>" : "") +
    (it.u && UNIQ[it.u] ? '<div class="uniq"><b>' + UNIQ[it.u].name + "</b>: " + UNIQ[it.u].desc + "</div>" : "");
  const affs = (it.affs || []).map(([k, b]) => '<div class="aff">' + affText(k, b) + "</div>").join("");
  const setl = it.set ? '<div class="setl" style="color:' + SET[it.set].cv + '">' + SET[it.set].name + " set</div>" : "";
  let cmp = "", acts = "";
  if (mode === "pack") {
    const cur = S.equip[it.slot], d = cur ? Math.round((score(it) / score(cur) - 1) * 100) : 0;
    cmp = cur ? ' <span class="' + (d > 0 ? "up" : "dn") + '">' + (d > 0 ? "+" : "") + fmt(d) + "% vs equipped</span>" : ' <span class="up">Empty slot</span>';
    const two = it.slot === "weapon" && ORBIT.weapon2.open(), extra = two ? openOrbitals().slice(1) : [];
    extra.forEach(ob => {
      const o = S.equip[ob.key], d2 = o ? Math.round((score(it) / score(o) - 1) * 100) : 0;
      cmp += o ? ', <span class="' + (d2 > 0 ? "up" : "dn") + '">' + (d2 > 0 ? "+" : "") + fmt(d2) + "% vs " + ob.nth + "</span>" : ', <span class="up">' + ob.nth + " slot empty</span>";
    });
    acts = '<div class="acts"><button class="btn go" data-act="eqTo" data-slot="' + it.slot + '" data-id="' + it.id + '">' + (two ? "Equip main" : "Equip") + "</button>" + extra.map(ob => '<button class="btn go" data-act="eqTo" data-slot="' + ob.key + '" data-id="' + it.id + '">Equip ' + ob.nth + "</button>").join("") + '<button class="btn" data-act="sv" data-id="' + it.id + '">Salvage +' + fmt(salvValue(it)) + " lumen" + (salvShards(it) ? ", +" + salvShards(it) + (salvShards(it) > 1 ? " shards" : " shard") : "") + "</button></div>";
  }
  if (mode === "swap") { const cur = S.equip[gearSel], d = cur ? Math.round((score(it) / score(cur) - 1) * 100) : 0; cmp = cur ? ' <span class="' + (d > 0 ? "up" : "dn") + '">' + (d > 0 ? "+" : "") + fmt(d) + "% vs equipped</span>" : ' <span class="up">Empty slot</span>'; }
  return '<div class="card r' + it.r + '">' + glyph(it.slot) + '<div class="nm">' + r.name + " " + it.name + '</div><div class="meta">' + (label || slot.name) + ": " + itemMain(it) + cmp + "</div>" + traitL + setl + affs + acts + (extra || "") + forgeUI(it) + "</div>";
}
// what an item's power actually gives, in plain numbers
function itemMain(it) {
  const qq = it.power / itemPow(it.stage || 1);
  if (it.slot === "weapon") return "+" + fmt(it.power) + " attack";
  if (it.slot === "armor") return "+" + fmt(it.power * 6) + " health";
  if (it.slot === "boots") return "+" + Math.round(12 * qq) + "% attack speed, " + fmt(it.power) + " evasion";
  return "+" + (3.5 * qq).toFixed(1) + "% crit chance";
}
function renderStats() {
  const G = (title, rows, id) => '<div class="wsub" data-sub="' + id + '"><div class="sgroup"><h3>' + title + "</h3>" + rows.filter(Boolean).map(([a, b]) => '<div class="srow"><span>' + a + "</span><b>" + b + "</b></div>").join("") + "</div></div>";
  $("statsBody").innerHTML =
    G("Offense", [["Damage per second", fmt(dps())], ["Attack", fmt(ST.atk)], ["Attack speed", effSpd().toFixed(2) + " per second"], ["Main orbital", wType() + (WTRAIT[wType()].desc ? " (" + WTRAIT[wType()].name + ")" : "") + ", " + (effSpd() * orbRate("weapon")).toFixed(2) + " attacks/s"], ...ORBITALS.slice(1).map(o => o.open() ? [o.label, o.has() ? wType(o.key) + " (" + WTRAIT[wType(o.key)].name + "), " + fmt(slotAtk(o.key)) + " attack" : "Empty"] : o.lockRow ? [o.label, o.lockRow] : null), ["Damage to bosses", pct(ST.bossDmg, 0)], ["Crit chance", pct(ST.crit)], ["Crit damage", pct(ST.critDmg, 0)], ["Red crit chance", pct(Math.max(0, ST.crit - 1)) + (ST.crit > 1 ? "" : " (crit chance past 100%)")], ["Red crit power", "x" + ST.redPow.toFixed(2) + " on top of crit damage"], ["Tap damage", fmt(ST.atk * ST.tap) + " (" + pct(ST.tap, 0) + " of attack)"], ["Life steal", pct(ST.leech)]], "off") +
    G("Defense", [["Health", fmt(Math.max(0, hero.hp)) + " / " + fmt(ST.maxHp)], ["Health regen", pct(ST.hpRegen) + " per second"], ["Block chance", pct(ST.block) + ", blocks " + Math.round((1 - ST.blockLeak) * 100) + "% of a hit"], ["Evasion rating", fmt(ST.evaR)], ["Chance to evade here", pct(evadeChance())], ["Damage taken", pct(ST.dmgTaken, 0)], ["Move speed", pct(ST.move, 0)], ["Status effect duration", pct(ST.statusDur, 0)]], "def") +
    G("Mana and skills", [["Mana", fmt(Math.max(0, hero.mp)) + " / " + fmt(ST.maxMp)], ["Mana regen", pct(ST.mpRegen) + " per second"], ["Skill power", pct(ST.skillPow, 0)], ["Cooldowns", pct(ST.cdr, 0) + " of base"], ["Mana costs", pct(ST.costMult, 0) + " of base"]], "mana") +
    G("Fortune", [["Lumen gain", pct(ST.gold, 0)], ["Loot drop chance", pct(ST.drop)], ["Rare luck", pct(ST.luck, 0)], ["Set item chance at Rare+", pct(ST.setChance)], ["Salvage value", pct(ST.salv, 0)]], "fort") +
    G("Journey", [["Highest stage ever", S.peak], ["Enemies destroyed", fmt(S.totalKills)], ["Bounties completed", S.bountyDone], ["Echoes earned", S.echoesTotal], ["Ascensions", S.ascensions || 0]], "jour");
}
panel("stats", { render: renderStats, refresh: renderStats });
let gearSel = "weapon", gearPick = null;
// a copy of your core as it looks in combat
function coreSnap() {
  const src = $("heroModel"); if (!src) return "";
  const cl = src.cloneNode(true);
  ["hGrav", "hCrack", "hStatic", "hEclipse", "hEclipseRing", "hBarrier"].forEach(id => { const e = cl.querySelector("#" + id); if (e) e.remove(); });
  const pos = { hWpn1: [0, -38], hWpn2: [32.9, 19], hWpn3: [-32.9, 19] }, ring = document.createElementNS(NS, "g");
  ring.setAttribute("class", "spinSlow");
  for (const id in pos) { const e = cl.querySelector("#" + id); if (e) { e.setAttribute("transform", "translate(" + pos[id][0] + " " + pos[id][1] + ")"); const o = e.parentNode; if (o.style.display !== "none") ring.appendChild(o); else o.remove(); } }
  const bob = cl.querySelector(".bob") || cl; bob.appendChild(ring);
  ring.querySelectorAll("path").forEach(pth => { if (pth.getAttribute("d") === HERO_WEAPON.Glaive) pth.setAttribute("class", (pth.getAttribute("class") || "") + " spinRev"); });
  cl.querySelectorAll("[id]").forEach(e => e.removeAttribute("id")); cl.removeAttribute("id"); cl.removeAttribute("class"); cl.removeAttribute("style");
  return '<svg viewBox="-52 -52 104 104" aria-hidden="true">' + cl.outerHTML + "</svg>";
}
function renderGear() {
  const T1 = k => {
    const it = S.equip[k], open = slotOpen(k);
    if (!open) return tile(null, "gSel", k, ORBIT[k].lockTile, gearSel === k, "lock");
    return tile(it, "gSel", k, slotLabel(k).replace(" orbital", ""), gearSel === k);
  };
  let doll = '<div class="doll">' + T1("weapon2") + T1("weapon") + T1("weapon3") + T1("armor") + '<div class="dollCore">' + coreSnap() + "</div>" + T1("charm") + "<i></i>" + T1("boots") + "<i></i></div>";
  const k = gearSel, it = S.equip[k], bs = baseSlot(k);
  let d = '<div class="gHd">' + slotLabel(k) + (bs === "weapon" && k !== "weapon" ? " · " + Math.round(ORBIT[k].share() * 100) + "% damage" : "") + "</div>";
  if (!slotOpen(k)) d += '<p class="note">' + ORBIT[k].lockNote() + "</p>";
  else {
    d += it ? itemCard(it, "gear", slotLabel(k), '<div class="acts"><button class="btn" data-act="uneq" data-id="' + k + '" type="button">Unequip</button></div>') : '<p class="note">Empty. Gives ' + SLOT[bs].role + ". Pick something from your Pack below.</p>";
    const cands = S.inv.filter(x => x.slot === bs).sort((a, b) => score(b) - score(a));
    if (gearPick != null && !cands.some(x => x.id === gearPick)) gearPick = null;
    d += '<div class="gHd">From your pack (' + cands.length + ")</div>";
    if (!cands.length) d += '<p class="note">No ' + SLOT[bs].name.toLowerCase() + "s in your pack.</p>";
    else {
      d += '<div class="tileGrid">' + cands.map(x => { const d = it ? Math.round((score(x) / score(it) - 1) * 100) : null; return '<div class="tw">' + tile(x, "gPick", x.id, null, x.id === gearPick) + (d == null ? '<span class="pc up">new</span>' : '<span class="pc ' + (d > 0 ? "up" : d < 0 ? "dn" : "") + '">' + (d > 0 ? "+" : "") + (d ? fmt(d) + "%" : "same") + "</span>") + "</div>"; }).join("") + "</div>";
      const pk = gearPick != null && cands.find(x => x.id === gearPick);
      if (pk) d += '<div class="pkDetail">' + itemCard(pk, "swap", "In pack", '<div class="acts"><button class="btn go" data-act="eqTo" data-id="' + pk.id + '" data-slot="' + k + '" type="button">Equip as ' + slotLabel(k).toLowerCase() + '</button><button class="btn" data-act="sv" data-id="' + pk.id + '" type="button">Salvage</button></div>') + "</div>";
    }
  }
  let h = '<div class="wsub" data-sub="equip">' + doll + d + "</div>";
  const sc = setCounts(), ids = Object.keys(sc);
  h += '<div class="wsub" data-sub="sets"><div class="setsum">' + (ids.length ? ids.map(id => {
    const s = SET[id], n = sc[id];
    return '<div><b style="color:' + s.cv + '">' + s.name + " " + n + '/6</b></div><div class="' + (n >= 2 ? "" : "off") + '">2 pieces: ' + s.b2.d + '</div><div class="' + (n >= 4 ? "" : "off") + '">4 pieces: ' + s.b4.d + '</div><div class="' + (n >= 6 ? "" : "off") + '">6 pieces: ' + s.b6.d + "</div>";
  }).join('<div style="height:8px"></div>') : '<span class="off">Set items drop at Rare or better. Wear 2, 4 or 6 pieces of one set for bonuses (6 needs the third orbital slot).</span>') + "</div>" +
    '<div class="setsum" style="margin-top:10px"><div><b>All sets</b></div>' + SETS.filter(x => !sc[x.id]).map(x => '<div style="margin-top:6px"><b style="color:' + x.cv + '">' + x.name + "</b>" + (x.myth ? " (Mythic only)" : "") + '</div><div class="off">2: ' + x.b2.d + '</div><div class="off">4: ' + x.b4.d + '</div><div class="off">6: ' + x.b6.d + "</div>").join("") + "</div></div>";
  $("gearBody").innerHTML = h;
}
panel("gear", { render: renderGear });
action("gSel", id => { gearSel = id; gearPick = null; });
action("gPick", id => { gearPick = gearPick === Number(id) ? null : Number(id); if (gearPick != null) return scrollToDetail; });
action("uneq", id => {
  const it = S.equip[id]; if (!it) return false;
  if (S.inv.length >= PACK_CAP) { floatText("Pack is full", "info", "hero"); log("Your pack is full. Salvage something first", "bad"); return false; }
  delete S.equip[id]; S.inv.unshift(it);
});
action("eqTo", (id, b) => { if (!equipFromPack(b.dataset.slot, Number(id))) return false; gearPick = null; });
const spriteCache = new Map();
function spriteSvg(it) {
  const key = it.slot + noun(it) + it.r;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const n = noun(it), c = ARENA_C[it.r], sv = svgEl("svg", { "aria-hidden": "true" }), g = svgEl("g", {}, sv);
  if (it.slot === "weapon") { sv.setAttribute("viewBox", "-14 -14 28 28"); svgEl("path", { d: HERO_WEAPON[n] || HERO_WEAPON.Glaive, fill: c, stroke: "#000", "stroke-opacity": .3, "stroke-width": 1 }, g); if (it.r >= 3) { g.setAttribute("class", "glow"); g.style.color = c; } }
  else if (it.slot === "armor") { sv.setAttribute("viewBox", "-30 -30 60 60"); shellSvg(n, c, it.r, g); }
  else if (it.slot === "boots") { sv.setAttribute("viewBox", "-37 -37 74 74"); const g2 = svgEl("g", {}, sv); coronaSvg(n, c, it.r, g, g2); }
  else { sv.setAttribute("viewBox", "-9 -9 18 18"); lensSvg(n, c, it.r, g); }
  const out = sv.outerHTML; spriteCache.set(key, out); return out;
}
function tileIcon(it, slotId) {
  if (it) return spriteSvg(it);
  const col = it ? "#efeaff" : "var(--line)";
  if (it && it.slot === "weapon") return '<svg viewBox="-14 -14 28 28" aria-hidden="true"><path d="' + HERO_WEAPON[weaponType(it)] + '" fill="' + col + '" fill-rule="evenodd"/></svg>';
  return '<svg viewBox="0 0 36 36" aria-hidden="true"><path d="' + SLOT[it ? it.slot : baseSlot(slotId)].shape + '" fill="' + col + '" fill-rule="evenodd"/></svg>';
}
function upPct(it) {
  const cands = it.slot === "weapon" ? openOrbitals().map(o => S.equip[o.key]) : [S.equip[it.slot]];
  if (cands.some(c => !c)) return 999;
  const worst = cands.reduce((a, b) => score(a) < score(b) ? a : b);
  return Math.round((score(it) / score(worst) - 1) * 100);
}
// badge: an optional +/-% in the corner (gear picks)
function tile(it, act, id, label, sel, extraCls, badge) {
  if (!it) return '<button class="tile empty' + (sel ? " sel" : "") + (extraCls ? " " + extraCls : "") + '" data-act="' + act + '" data-id="' + id + '" type="button">' + tileIcon(null, id) + '<span class="tl">' + (label || "") + "</span></button>";
  const up = act === "pkSel" && upPct(it) > 0, lbl = label || noun(it);
  return '<button class="tile r' + it.r + (sel ? " sel" : "") + '" data-act="' + act + '" data-id="' + id + '" type="button" aria-label="' + RARITY[it.r].name + " " + it.name + '">' + tileIcon(it) +
    (it.set ? '<i class="sd" style="--sc:' + SET[it.set].col + '"></i>' : "") + (badge != null ? '<b class="bd ' + (badge > 0 ? "up" : "dn") + '">' + (badge > 0 ? "+" : "") + badge + "%</b>" : up ? '<b class="ua">▲</b>' : "") + (it.u ? '<span class="uq">✦</span>' : "") + '<span class="tl">' + lbl + "</span></button>";
}
let pkSel = null;
const scrollToDetail = () => { const el = document.querySelector(".panel:not([hidden]) .pkDetail .card"); if (el) el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }); };
const PK_SORT = [["up", "Best for you"], ["rar", "Rarity"], ["new", "Newest"], ["set", "Grouped by set"]];
const PK_SLOT = [["all", "All"], ["weapon", "Orbital"], ["armor", "Shell"], ["boots", "Corona"], ["charm", "Lens"]];
const pkView = () => S.packView;
function packItems() {
  const v = pkView();
  let L = S.inv.filter(it => (v.slot === "all" || it.slot === v.slot) && (v.set === "any" || (v.set === "sets" ? !!it.set : v.set === "none" ? !it.set : it.set === v.set)));
  const by = { up: (a, b) => upPct(b) - upPct(a), rar: (a, b) => b.r - a.r || score(b) - score(a), new: (a, b) => b.id - a.id, set: (a, b) => (a.set ? SET[a.set].name : "~").localeCompare(b.set ? SET[b.set].name : "~") || b.r - a.r }[v.sort] || (() => 0);
  return L.sort(by);
}
function renderPack() {
  const v = pkView(), L = packItems();
  if (pkSel != null && !S.inv.some(i => i.id === pkSel)) pkSel = null;
  const setsIn = [...new Set(S.inv.filter(i => i.set).map(i => i.set))];
  const ico = k => k === "all" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" fill="currentColor"/></svg>' : k === "weapon" ? '<svg viewBox="-14 -14 28 28" aria-hidden="true"><path d="' + HERO_WEAPON.Drone + '" fill="currentColor"/></svg>' : '<svg viewBox="0 0 36 36" aria-hidden="true"><path d="' + SLOT[k].shape + '" fill="currentColor" fill-rule="evenodd"/></svg>';
  let h = '<div class="pkBar"><div class="seg">' + PK_SLOT.map(([k, n]) => '<button class="' + (v.slot === k ? "on" : "") + '" data-act="pkSlot" data-id="' + k + '" type="button">' + ico(k) + n + "</button>").join("") + "</div>" +
    '<div class="pkRow"><label>Sort<select data-act="pkSort" aria-label="Sort">' + PK_SORT.map(([k, n]) => '<option value="' + k + '"' + (v.sort === k ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>" +
    '<label>Set<select data-act="pkSet" aria-label="Filter by set"><option value="any"' + (v.set === "any" ? " selected" : "") + '>All items</option><option value="sets"' + (v.set === "sets" ? " selected" : "") + '>Set items only</option><option value="none"' + (v.set === "none" ? " selected" : "") + '>No set</option>' +
    SETS.filter(x => setsIn.includes(x.id) || v.set === x.id).map(x => '<option value="' + x.id + '"' + (v.set === x.id ? " selected" : "") + ">" + x.name + "</option>").join("") + "</select></label>" +
    '<span class="cap">' + S.inv.length + "/" + PACK_CAP + "</span></div></div>";
  if (!S.inv.length) h += '<p class="note">Nothing here yet. Upgrades are equipped automatically, the rest lands here.</p>';
  else if (!L.length) h += '<p class="note">No items match these filters.</p>';
  else {
    let grid = "", lastSet = null;
    L.forEach(it => {
      if (v.sort === "set" && (it.set || "") !== lastSet) { if (grid) h += '<div class="tileGrid">' + grid + "</div>"; grid = ""; lastSet = it.set || ""; h += '<div class="gHd"' + (it.set ? ' style="color:' + SET[it.set].col + '"' : "") + ">" + (it.set ? SET[it.set].name + " · " + S.inv.filter(x => x.set === it.set).length + " in pack, " + (setCounts()[it.set] || 0) + " worn" : "No set") + "</div>"; }
      grid += tile(it, "pkSel", it.id, null, it.id === pkSel);
    });
    h += '<div class="tileGrid">' + grid + "</div>";
    const sel = pkSel != null && S.inv.find(i => i.id === pkSel);
    h += '<div class="pkDetail">' + (sel ? itemCard(sel, "pack") : '<p class="note" style="margin:0">Tap an item to see it. Border color is rarity. <b style="color:#5fd38d">▲</b> beats what you wear, a colored dot is its set, ✦ is a unique effect.</p>') + "</div>";
  }
  $("packList").innerHTML = h;
  $("autoEq").textContent = "Auto-equip: " + (S.autoEquip ? "On" : "Off");
  $("autoSv").textContent = "Auto-salvage: " + SALV_LABEL[S.salv];
}
panel("pack", { render: renderPack });
action("autoEq", () => { S.autoEquip = !S.autoEquip; });
action("autoSv", () => { S.salv = (S.salv + 1) % SALV_LABEL.length; });
action("salvAll", () => {
  if (!S.inv.length) return false;
  let g = 0, sh = 0; S.inv.forEach(it => { g += salvValue(it); sh += salvShards(it); });
  bump("salvage", S.inv.length); S.inv = []; addGold(g, false); addShards(sh);
  log("Salvaged pack for " + fmt(g) + " lumen" + (sh ? " and " + sh + " shards" : ""), "good");
});
action("sv", id => {
  const idx = S.inv.findIndex(i => i.id === Number(id));
  if (idx < 0) return false;
  salvage(S.inv.splice(idx, 1)[0]);
});
action("pkSel", id => { pkSel = pkSel === Number(id) ? null : Number(id); if (pkSel != null) return scrollToDetail; });
action("pkSlot", id => { pkView().slot = id; pkSel = null; });
action("pkSort", id => { pkView().sort = id; });
action("pkSet", id => { pkView().set = id; pkSel = null; });
