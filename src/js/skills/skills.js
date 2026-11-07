// Skills: each one's numbers, cast and auto-cast rule, levels, the skill bar and the Skills window.
import { sfx } from "../audio/sound.js";
import { bump } from "../bounty/bounty.js";
import { alive, heroDown, hit } from "../combat/combat.js";
import { S } from "../core/save.js";
import { ST, emit, statSource } from "../core/stats.js";
import { $, anim, fmt } from "../core/util.js";
import { enemy, foes, inView } from "../enemies/foes.js";
import { burst, crackFx, novaFx } from "../fx/effects.js";
import { hero, heroModel, startDash } from "../hero/hero.js";
import { throwBlade, wDelay } from "../hero/orbitals.js";
import { clearStatuses } from "../hero/statuses.js";
import { autoOn } from "../progress/automation.js";
import { action, markDirty, panel } from "../ui/actions.js";
import { floatText } from "../ui/floats.js";
import { T, TREE } from "../web/web.js";
import { view } from "../world/scene.js";
import { log } from "../ui/log.js";
import { whenNewBest } from "../modes/modes.js";

// smart: with Smart Cast on, auto-cast waits for a boss, an elite or this many enemies on screen.
// reserve: auto-cast keeps enough mana for this skill while a boss or elite is up.
// auto(c): the skill's own auto-cast rule instead of the usual mana-reserve one.
const skMult = L => 1 + .06 * (L - 1);
export const SKILLS = [
  {
    id: "nova", name: "Nova", unlock: 1, cd: 5, cost: .15, foe: true, smart: 3, icon: "M12 7 A5 5 0 1 1 11.99 7 Z M12 0 L13.5 4.5 L10.5 4.5 Z M12 24 L10.5 19.5 L13.5 19.5 Z M0 12 L4.5 10.5 L4.5 13.5 Z M24 12 L19.5 13.5 L19.5 10.5 Z",
    dmg: L => ST.atk * 2.5 * skMult(L) * ST.skillPow * ST.novaPow,
    desc: L => "Burst for " + fmt(SK.nova.dmg(L)) + " damage",
    cast(L, c) { c.dmg = this.dmg(L); novaFx(); hit(c.dmg, 220, "nova"); }
  },
  {
    id: "barrier", name: "Barrier", unlock: 5, cd: 14, cost: .2, foe: false, reserve: true, icon: "M12 1 L22 6.5 L22 17.5 L12 23 L2 17.5 L2 6.5 Z M12 5 L18 8.5 L18 15.5 L12 19 L6 15.5 L6 8.5 Z",
    amt: L => ST.maxHp * (.3 + .015 * (L - 1)) * ST.skillPow * ST.aegis,
    time: L => 8 + .1 * (L - 1),
    desc: L => "Shield absorbs " + fmt(SK.barrier.amt(L)) + " damage for " + SK.barrier.time(L).toFixed(1) + "s",
    auto: c => c.foe && (enemy.tele > 0 || c.hpPct < .6),
    cast(L) {
      hero.shield = hero.shieldMax = this.amt(L); hero.shieldT = this.time(L);
      anim($("hBarrier"), [{ transform: "scale(.3)", opacity: 0 }, { transform: "scale(1.15)", opacity: 1, offset: .7 }, { transform: "scale(1)", opacity: 1 }], 300);
    },
    tick(dt) { if (hero.shieldT > 0) { hero.shieldT -= dt; if (hero.shieldT <= 0) hero.shield = 0; } }
  },
  {
    id: "overdrive", name: "Surge", unlock: 12, cd: 15, cost: .2, foe: true, smart: 3, icon: "M2 4 L10 12 L2 20 L5.5 20 L13.5 12 L5.5 4 Z M10.5 4 L18.5 12 L10.5 20 L14 20 L22 12 L14 4 Z",
    pct: L => 50 + 2.5 * (L - 1),
    time: L => 6 + .1 * (L - 1) + ST.surgeTime,
    desc: L => "+" + SK.overdrive.pct(L) + "% attack speed for " + SK.overdrive.time(L).toFixed(1) + "s",
    cast(L) { hero.odT = this.time(L); heroModel.classList.add("od"); burst(view.HERO_X, view.HERO_Y, "#ffd04d", 8); },
    tick(dt) { if (hero.odT > 0) { hero.odT -= dt; if (hero.odT <= 0) heroModel.classList.remove("od"); } },
    fx: { attackSpeed: c => { if (hero.odT > 0) c.v *= 1 + SK.overdrive.pct(lvl("overdrive")) / 100; } }
  },
  {
    id: "storm", name: "Storm", unlock: 20, cd: 10, cost: .22, foe: true, smart: 2, icon: "M12 1 L14.5 10 L12 12.5 L9.5 10 Z M2.5 18.5 L10 12.8 L12 15 L10.5 17.5 Z M21.5 18.5 L13.5 17.5 L12 15 L14 12.8 Z",
    blades: L => 6 + Math.floor(L / 10) + ST.stormBlades,
    dmg: L => ST.atk * .45 * skMult(L) * ST.skillPow,
    desc: L => SK.storm.blades(L) + " blades for " + fmt(SK.storm.dmg(L)) + " each",
    cast(L) { const n = this.blades(L), d = this.dmg(L); for (let i = 0; i < n; i++) setTimeout(() => { if (alive()) { throwBlade(false, i + 1); hit(d, wDelay(), "storm"); } }, i * 170); }
  },
  {
    id: "dash", name: "Dash", unlock: 30, cd: 6, cost: .08, foe: false, icon: "M9 4 L20 12 L9 20 L12 12 Z M2 8 H8 V9.6 H2 Z M1 11.2 H9 V12.8 H1 Z M2 14.4 H8 V16 H2 Z",
    dist: L => 150 + 3 * (L - 1), guard: L => .4 + .01 * (L - 1), dmg: L => ST.atk * 1.5 * skMult(L) * ST.skillPow,
    desc: L => "Dash " + Math.round(SK.dash.dist(L)) + " units, untouchable for " + SK.dash.guard(L).toFixed(2) + "s, slicing foes in your path for " + fmt(SK.dash.dmg(L)) + " and clearing statuses",
    // auto-dash only to escape: out of a boss Crush, or away when health is low
    auto: c => !!foes.find(f => !f.dead && f.tele > 0 && f.tele < .7) || (c.hpPct < .35 && c.foe),
    cast(L) { startDash(L); clearStatuses(); }
  },
  {
    id: "shatter", name: "Shatter", unlock: 45, cd: 22, cost: .25, foe: true, smart: 3, sound: "shatterSkill", icon: "M12 0 L14 9 L24 12 L14 15 L12 24 L10 15 L0 12 L10 9 Z",
    time: L => 5 + .15 * (L - 1), critBonus: L => .05 * L,
    desc: L => "Every hit crits for " + SK.shatter.time(L).toFixed(1) + "s with +" + Math.round(SK.shatter.critBonus(L) * 100) + "% crit damage",
    cast(L) { hero.markT = this.time(L); crackFx(); },
    tick(dt) { if (hero.markT > 0) { hero.markT -= dt; if (hero.markT <= 0) foes.forEach(f => f.el.cracks.style.display = "none"); } },
    fx: {
      critChance: c => { if (hero.markT > 0) c.sure = true; },
      deal: h => { if (hero.markT > 0 && h.crit) h.dmg *= 1 + SK.shatter.critBonus(lvl("shatter")); }
    }
  }
];
// skill cooldowns left, by id
export const cds = {};
export function stepSkills(dt) {
  for (const k in cds) if (cds[k] > 0) cds[k] -= dt;
  SKILLS.forEach(sk => { if (sk.tick) sk.tick(dt); });
}
export const SK = {};
 SKILLS.forEach(s => SK[s.id] = s);
statSource(give => SKILLS.forEach(s => give(s)));
const attRank = id => { const n = TREE.find(x => x.att === id); return n ? T(n.id) : 0; };
const baseLvl = id => Math.min(skillMaxAll(), 1 + 3 * Math.max(0, attRank(id) - (SK[id].unlock > 1 ? 1 : 0)));
export const lvl = id => Math.max(S.skill[id] || 1, baseLvl(id));
const unlocked = id => S.maxStage >= SK[id].unlock || attRank(id) > 0;
const skillCost = sk => emit("skillCost", { v: sk.cost * 100 * ST.costMult }).v;
const SKILL_MAX = 40;
const skillMaxAll = () => SKILL_MAX + 5 * ST.skillMastery;
const skillCap = () => Math.min(skillMaxAll(), 4 + 2 * ST.skillMastery + Math.floor(S.maxStage / 3));
const capStage = L => Math.max(1, 3 * (L - 4 - 2 * ST.skillMastery));
const skillCd = sk => sk.cd * ST.cdr * (1 - .01 * (lvl(sk.id) - 1));
const canCast = sk => unlocked(sk.id) && !(cds[sk.id] > 0) && !heroDown && hero.mp >= skillCost(sk) && (!sk.foe || alive());
function cast(id, manual) {
  const sk = SK[id];
  if (!canCast(sk)) {
    if (manual && unlocked(id) && !(cds[id] > 0)) floatText(sk.foe && !alive() ? "No target" : "Need mana", "info", "hero");
    return false;
  }
  const cost = skillCost(sk);
  hero.mp -= cost; cds[id] = skillCd(sk);
  sfx(sk.sound || id, 0, 0);
  const L = lvl(id), c = { id, cost, dmg: 0 };
  sk.cast(L, c);
  emit("cast", c);
  bump("cast", 1);
  return true;
}
export function autoCast() {
  if (heroDown || !ST) return;
  const c = { foe: alive(), hpPct: hero.hp / ST.maxHp };
  const big = c.foe && (enemy.boss || enemy.elite);
  const keep = big ? SKILLS.filter(s => s.reserve && unlocked(s.id) && S.auto[s.id] && !(cds[s.id] > 0)).reduce((a, s) => Math.max(a, skillCost(s)), 0) : 0;
  for (const sk of SKILLS) {
    if (!S.auto[sk.id] || !canCast(sk)) continue;
    let go;
    if (sk.auto) go = sk.auto(c);
    else {
      go = c.foe && hero.mp - skillCost(sk) >= ST.maxMp * S.manaRes;
      if (go && sk.smart && autoOn() && S.autoCfg.smart !== false) go = big || foes.filter(f => !f.dead && inView(f)).length >= sk.smart;
      if (keep && !sk.reserve && hero.mp - skillCost(sk) < keep) go = false;
    }
    if (go) cast(sk.id, false);
  }
}
// cut to offset the earlier shard nerf (40% cheaper base, +17% per level instead of +20%)
const skillUpCost = sk => Math.ceil(.6 * (2 + sk.unlock / 5) * Math.pow(1.17, lvl(sk.id) - 1));
const skEls = {};
export function buildSkillbar() {
  const bar = $("skillbar"); bar.innerHTML = "";
  SKILLS.forEach(sk => {
    const b = document.createElement("button"), open = unlocked(sk.id);
    b.type = "button"; b.className = "sk chf";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + sk.icon + '" fill="currentColor" fill-rule="evenodd"/></svg><span class="lb">' + (open ? sk.name : "Stage " + sk.unlock) + '</span><span class="au"></span><span class="cd"></span><span class="ct"></span>';
    b.setAttribute("aria-label", open ? "Cast " + sk.name : sk.name + " unlocks at stage " + sk.unlock);
    if (!open) { b.classList.add("locked"); b.querySelector(".au").style.display = "none"; }
    // fire on press: iOS won't send a click while another finger is down (the joystick)
    b.addEventListener("pointerdown", e => { e.preventDefault(); if (unlocked(sk.id)) cast(sk.id, true); });
    b.addEventListener("click", e => { if (e.detail === 0 && unlocked(sk.id)) cast(sk.id, true); });
    bar.appendChild(b);
    skEls[sk.id] = { b, cd: b.querySelector(".cd"), ct: b.querySelector(".ct"), au: b.querySelector(".au") };
  });
}
export function updateSkillbar() {
  SKILLS.forEach(sk => {
    const el = skEls[sk.id];
    if (!el || !unlocked(sk.id)) return;
    const left = cds[sk.id] > 0 ? cds[sk.id] : 0;
    el.cd.style.height = left > 0 ? Math.min(100, left / skillCd(sk) * 100) + "%" : "0";
    el.ct.textContent = left > 0 ? Math.ceil(left) : "";
    el.b.classList.toggle("ready", left <= 0 && hero.mp >= skillCost(sk));
    el.b.classList.toggle("poor", hero.mp < skillCost(sk));
    el.au.style.display = S.auto[sk.id] ? "" : "none";
  });
}
function renderSkills() {
  const r = S.manaRes;
  $("resBar").innerHTML = '<span>Auto-cast keeps</span>' + [0, .3, .5].map(v => '<button class="btn' + (Math.abs(r - v) < .01 ? " go" : "") + '" data-act="manaRes" data-id="' + v + '">' + Math.round(v * 100) + "%</button>").join("") + "<span>mana in reserve</span>";
  $("skillsBody").innerHTML = SKILLS.map(sk => {
    if (!unlocked(sk.id)) return '<div class="row lock"><span class="n">' + sk.name + '</span><span class="d">Unlocks at stage ' + sk.unlock + " each run</span></div>";
    const L = lvl(sk.id), c = skillUpCost(sk);
    const cap = skillCap();
    return '<div class="row"><span class="n">' + sk.name + " Lv " + L + (L < cap ? " / " + cap : "") + '</span><span class="d">' + sk.desc(L) + '</span><span class="d">' + (sk.cost ? fmt(skillCost(sk)) + " mana, " : "Free, ") + skillCd(sk).toFixed(1) + 's cooldown</span><div class="side">' +
      (L >= skillMaxAll() ? '<button class="btn" disabled>Maxed</button>' : L >= cap ? '<button class="btn" disabled>Next level at stage ' + capStage(L + 1) + "</button>" : '<button class="btn shardc" data-act="skup" data-id="' + sk.id + '" data-cost="' + c + '" data-cur="shard">Upgrade ' + fmt(c) + " shards</button>") +
      '<button class="btn" data-act="skauto" data-id="' + sk.id + '">Auto: ' + (S.auto[sk.id] ? "On" : "Off") + "</button></div></div>";
  }).join("");
}
panel("skills", { render: renderSkills });
action("skup", id => {
  const c = skillUpCost(SK[id]);
  if (S.shards < c || lvl(id) >= skillCap()) return false;
  sfx("buy", 0, 0); S.shards -= c; S.skill[id] = lvl(id) + 1;
});
action("skauto", id => { S.auto[id] = !S.auto[id]; });
action("manaRes", id => { S.manaRes = Number(id); });
whenNewBest((before, now, kind) => SKILLS.forEach(sk => { if (kind === "best" && before < sk.unlock && now >= sk.unlock) { log("Skill unlocked: " + sk.name, "r4"); sfx("chord", 0, 300); buildSkillbar(); markDirty("skills"); } }));
