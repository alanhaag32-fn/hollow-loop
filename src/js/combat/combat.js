// Hits and damage both ways: the hit pipeline, hurting the hero, deaths, kills and their rewards.
import { sfx } from "../audio/sound.js";
import { lumenAt } from "../core/curves.js";
import { addGold, addShards, shardAmt } from "../progress/currency.js";
import { S } from "../core/save.js";
import { ST, emit, foeEmit } from "../core/stats.js";
import { $, fmt } from "../core/util.js";
import { clearFoes, enemy, fdir, foes, knock, lungeT, moveFoes, pickTarget, removeFoe, spawnChild, stepFoe } from "../enemies/foes.js";
import { blockFx, burst, evadeFx, lootBeam, ringIfRoom, shake, shatter, slash, sparks, statusFx } from "../fx/effects.js";
import { receive } from "../gear/inventory.js";
import { makeItem } from "../gear/items.js";
import { dashIT, evadeChance, heal, hero, heroModel, hvx, hvy, resetCombat } from "../hero/hero.js";
import { ORBITALS, fireOrbital, heroAttack, orbRate, wTr } from "../hero/orbitals.js";
import { stepStatuses } from "../hero/statuses.js";
import { fightStage, mode, resumeRun } from "../modes/modes.js";
import { autoCast, stepSkills } from "../skills/skills.js";
import { dmgFloat, floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";
import { view } from "../world/scene.js";
import { anim } from "../fx/gfx.js";
import { tell } from "../core/events.js";

export let heroDown = false;
const dpsLog = [];
export const F = () => fdir(enemy);
export const alive = () => !!enemy && !enemy.dead && !heroDown;
export function dps() {
  const now = performance.now();
  while (dpsLog.length && now - dpsLog[0][0] > 5000) dpsLog.shift();
  return dpsLog.reduce((a, x) => a + x[1], 0) / 5;
}
let lastHealFloat = 0, leechPool = 0;
// a hit is aimed now but only lands (health, effects, numbers) when the shot arrives
export function hit(base, delay, kind, slot) {
  if (!alive()) return;
  const e = enemy;
  if (delay && !document.hidden) setTimeout(() => land(e, base, kind, slot), delay); else land(e, base, kind, slot);
}
export function land(e, base, kind, slot) {
  if (heroDown || !e || e.dead || !foes.includes(e)) return;
  slot = slot || "weapon";
  const tr = kind === "blade" ? wTr(slot) : null;
  const h = { e, kind, slot, dmg: 0, crit: false, red: false, note: "", lethal: false, first: !!e.fresh, pierce: !!(tr && tr.pierce), seeking: !!(tr && tr.seeking) };
  e.fresh = false;
  // crit chance past 100% rolls red crits; when a crit is certain (Shatter), crit chance becomes red crit chance
  const c = emit("critChance", { v: ST.crit, sure: false }), cc = c.v;
  h.crit = c.sure || Math.random() < cc;
  h.red = h.crit && Math.random() < (c.sure ? cc : cc - 1) + ST.redBonus;
  emit("crit", h);
  h.dmg = base * (.9 + Math.random() * .2);
  if (h.crit) h.dmg *= ST.critDmg * (h.red ? ST.redPow : 1);
  if (e.boss) h.dmg *= ST.bossDmg;
  if (e.elite) h.dmg *= ST.eliteDmg;
  emit("deal", h);
  foeEmit(e, "take", h);
  if (h.lethal) h.dmg = Math.max(h.dmg, e.hp);
  if (e.v && e.v.eva && kind !== "tap" && !h.seeking && Math.random() < e.v.eva) { h.dmg = 0; h.note = "Miss"; }
  foeEmit(e, "guard", h);
  const { dmg, crit, red, note } = h;
  e.hp -= dmg; if (dmg > 0) e.lastHitT = performance.now();
  dpsLog.push([performance.now(), dmg]);
  if (dmg > 0 && !e.dead) {
    if (kind === "blade" && ST.burn > 0) e.burn = { dps: ST.atk * ST.burn / 2, t: 2 };
    emit("hit", h);
  }
  if (tr && tr.stun && dmg > 0 && e.hp > 0 && Math.random() < tr.stun) {
    e.stun = Math.max(e.stun || 0, e.boss ? .5 : 1.2); e.el.model.classList.add("stun");
    floatText("Stunned", "info", e);
  }
  if (dmg > 0) foeEmit(e, "struck", h);
  if (ST.leech > 0 && dmg > 0 && leechPool > 0) {
    const got = Math.min(dmg * ST.leech, leechPool); leechPool -= got;
    const before = hero.hp; heal(got);
    const now = performance.now();
    if (hero.hp - before > ST.maxHp * .02 && now - lastHealFloat > 600) { lastHealFloat = now; floatText("+" + fmt(hero.hp - before), "heal", "hero"); }
  }
  if (crit) tell("crit", 1);
  const show = () => {
    if (kind === "blade" || kind === "storm") slash(crit, slot, e);
    else if (kind === "tap") sparks(e.px, e.py, crit ? 6 : 3, crit ? "#ff8a3d" : "#9ff3e6", 22);
    if (crit && !note) sfx("crit", 0, 160);
    if (note) floatText(note, "info", e);
    else dmgFloat(e, dmg, crit, kind === "tap", red);
    if (red && !document.hidden) sparks(e.px, e.py, 5, "#ff2e4d", 28);
    if (crit && kind !== "tap") shake(3, 160);
    const tn = performance.now();
    if (!e.dead && e.el && !(tn - (e.flashT || 0) < 140)) { e.flashT = tn; anim(e.el.body, [{ transform: "translate(0px,0px)", filter: "brightness(1)" }, { transform: lungeT(e, -3), filter: "brightness(2.2)", offset: .5 }, { transform: "translate(0px,0px)", filter: "brightness(1)" }], 160); }
    if (!note) knock(e, (kind === "tap" ? 7 : tr ? tr.knock : 12) * (crit ? 1.7 : 1));
  };
  show();
  downIfDead(e);
}
// a foe at zero health is dead; its kill resolves a moment later, once this hit's effects have played
function downIfDead(e) { if (e.hp <= 0 && !e.dead) { e.dead = true; setTimeout(() => killFoe(e), 20); } }
export const effSpd = () => emit("attackSpeed", { v: ST.spd }).v;
// a decoy (Phantom Veil) draws enemy fire while it lasts

export const field = {
  decoy: null
};
// damage that skips crits and floats (bleeds, burns, trails, fields, blasts)
export function dotDmg(e, d) {
  if (!e || e.dead || heroDown || d <= 0) return;
  e.hp -= d; e.lastHitT = performance.now(); dpsLog.push([performance.now(), d]);
  downIfDead(e);
}
function stepEffects(dt) {
  for (const e of foes) {
    if (e.dead) continue;
    if (e.bleed && e.bleed.t > 0) { e.bleed.t -= dt; dotDmg(e, e.bleed.dps * dt); }
    if (e.burn && e.burn.t > 0) { e.burn.t -= dt; dotDmg(e, e.burn.dps * dt); }
  }
  emit("tick", { dt, moving: Math.abs(hvx) + Math.abs(hvy) > 40 });
  if (field.decoy && field.decoy.until < performance.now()) field.decoy = null;
}
function checkDeath() {
  if (hero.hp > 0) return;
  if (!emit("revive", { done: false }).done) onDeath();
}
export function trueDamage(d, label) {
  if (heroDown) return;
  if (hero.shield > 0) { const a = Math.min(hero.shield, d); hero.shield -= a; d -= a; }
  hero.hp -= d;
  if (d > 0) floatText(label + " -" + fmt(d), "hurt", "hero");
  checkDeath();
}
export function hurt(d, noEvade, from) {
  const dir = from ? fdir(from) : F();
  if (dashIT > 0) { floatText("Dodged", "info", "hero"); return false; }
  const c = emit("incoming", { d, evade: noEvade ? 0 : evadeChance(), block: ST.block, cancel: false });
  if (c.cancel) return false;
  if (c.evade > 0 && Math.random() < c.evade) { floatText("Evade", "info", "hero"); evadeFx(dir); sfx("evade", 0, 120); tell("evade", 1); emit("evaded", c); return false; }
  let blocked = false;
  if (c.block > 0 && Math.random() < c.block) {
    c.d *= ST.blockLeak; blocked = true; tell("block", 1); blockFx(dir); sfx("block", 0, 120);
    emit("blocked", c);
  }
  c.d *= ST.dmgTaken;
  emit("taken", c);
  d = c.d;
  const hadShield = hero.shield > 0;
  if (hero.shield > 0) { const a = Math.min(hero.shield, d); hero.shield -= a; d -= a; if (a > 0) anim($("hBarrier"), [{ opacity: 1 }, { opacity: .3 }, { opacity: 1 }], 160); }
  if (hadShield && hero.shield <= 0) emit("shieldBroken", c);
  hero.hp -= d;
  if (d > 0) emit("hurt", c);
  const src = from || enemy;
  if (d > 0 && ST.thorn && src) dotDmg(src, d * ST.thorn);
  floatText(d <= 0 ? "Absorbed" : (blocked ? "Block -" : "-") + fmt(d), d <= 0 ? "info" : "hurt", "hero");
  if (d > 0 && !blocked) sfx("hurt", 0, 120);
  anim(heroModel, [{ transform: "translateX(0px)", filter: "none" }, { transform: "translateX(" + dir * 6 + "px)", filter: "drop-shadow(0 0 6px #ff6b6b) brightness(1.6)", offset: .4 }, { transform: "translateX(0px)", filter: "none" }], 220);
  checkDeath();
  return true;
}
export function crush(e) {
  e.el.model.classList.remove("tele");
  anim(e.el.model, [{ transform: "translate(0px,0px) scale(1)" }, { transform: lungeT(e, 60) + " scale(1.15)", offset: .4 }, { transform: "translate(0px,0px) scale(1)" }], 420);
  shake(9, 450); sfx("crush");
  // the Crush lands where the warning ring was
  if (e.crX != null && Math.hypot(view.HERO_X - e.crX, view.HERO_Y - e.crY) > 58) { log("Crush dodged", "good"); floatText("Dodged", "info", "hero"); ringIfRoom(e.crX, e.crY, "#ff4d4d", 1, 2.2, 300, 3); return; }
  log("Crush!", "bad");
  hurt(ST.maxHp * .45 * ST.crushTaken, true, e);
}
function killFoe(e) {
  if (e.removed) return;
  e.removed = true;
  const boss = e.boss, elite = e.elite, c = foeEmit(e, "death", { e, split: false });
  const st = fightStage(), g = Math.ceil(lumenAt(st) * mode.lumen() * (boss ? 12 : elite ? 4 : 1) * (e.child ? .25 : 1) * ST.gold * (boss || elite ? ST.bigGold : 1));
  addGold(g, true); S.totalKills++;
  if (!e.child) { const sa = shardAmt(st) * ST.shardF; if (boss) addShards(Math.round(4 * sa * ST.bossShards), e); else if (elite) addShards(Math.round(2 * sa), e); else if (Math.random() < .08) addShards(Math.round(sa), e); }
  tell("kill", 1, e); if (boss) tell("boss", 1); if (elite) tell("elite", 1);
  floatText("+" + fmt(g) + " lumen", "gold", e);
  heal(ST.maxHp * ST.killHeal);
  hero.mp = Math.min(ST.maxMp, hero.mp + ST.maxMp * ((boss ? .25 : elite ? .1 : .03) + ST.killMana));
  shatter(e); sfx("shatter", boss || elite, 150);
  if (e.el) e.el.pos.style.visibility = "hidden";
  let best = -1;
  if (boss) {
    const up = ST.bossLoot;
    best = receive(makeItem(st, true, 1, null, up)).r;
    best = Math.max(best, receive(makeItem(st, true, 1, null, up)).r);
    if (Math.random() < .2) best = Math.max(best, receive(makeItem(st, true, 2, null, up)).r);
    log(e.name + " destroyed", "good");
  } else if (elite) {
    best = receive(makeItem(st, false, Math.random() < .5 ? 1 : 0)).r;
    if (Math.random() < ST.eliteSpoils) best = Math.max(best, receive(makeItem(st, false, 1)).r);
    log(e.name + " destroyed", "good");
  } else if (!e.child && Math.random() < ST.drop) best = receive(makeItem(st, false, 0)).r;
  if (!e.child && Math.random() < ST.bonusDrop) best = Math.max(best, receive(makeItem(st, boss, 0)).r);
  if (best >= 1) setTimeout(() => { lootBeam(best, e.px, e.py); sfx("loot", best, 200); }, 250);
  emit("kill", c);
  const splits = c.split;
  if (splits) log(e.name + " splits apart", "r3");
  mode.kill(e, c);
  removeFoe(e, false);
  if (splits) spawnChild(e);
  pickTarget();
}
function onDeath() {
  sfx("death");
  mode.death();
  heroDown = true; resetCombat();
  const fall = anim(heroModel, [{ transform: "scale(1)", opacity: 1, filter: "brightness(1)" }, { transform: "scale(1.3)", opacity: 1, filter: "brightness(3)", offset: .25 }, { transform: "scale(0)", opacity: 0, filter: "brightness(1)" }], { duration: 600, easing: "ease-in", fill: "forwards" });
  setTimeout(() => burst(view.HERO_X, view.HERO_Y, "#7be0d0", 10), 350);
  setTimeout(() => clearFoes(true), 450);
  setTimeout(() => {
    if (fall) fall.cancel();
    hero.hp = ST.maxHp; hero.mp = ST.maxMp; heroDown = false; resumeRun(.4);
    anim(heroModel, [{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1.2)", offset: .7 }, { opacity: 1, transform: "scale(1)" }], 400);
    burst(view.HERO_X, view.HERO_Y, "#ffffff", 6);
  }, 1300);
}
export function step(dt) {
  if (heroDown) return;
  statusFx(dt);
  stepSkills(dt);
  stepStatuses(dt);
  heal(ST.maxHp * ST.hpRegen * dt);
  stepEffects(dt);
  mode.step(dt);
  leechPool = Math.min(ST.maxHp * ST.leech * 3 * ST.leechCap, leechPool + ST.maxHp * ST.leech * 4 * ST.leechCap * dt);
  hero.mp = Math.min(ST.maxMp, hero.mp + emit("manaRegen", { v: ST.maxMp * ST.mpRegen * dt }).v);
  if (document.hidden) moveFoes(dt);
  mode.stepSpawns(dt);
  pickTarget();
  autoCast();
  for (const e of foes.slice()) { stepFoe(e, dt); if (heroDown) return; }
  pickTarget();
  if (!alive()) return;
  for (const o of ORBITALS) {
    if (!alive() || !o.active()) continue;
    o.cd -= dt;
    if (o.cd <= 0) { o.cd += 1 / (effSpd() * orbRate(o.key)); if (o.i) fireOrbital(o.key); else heroAttack(); }
  }
}
