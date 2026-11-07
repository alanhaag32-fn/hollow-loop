// Statuses enemies put on the hero (Dim, Fracture, Static, Gravity, Eclipse).
import { sfx } from "../audio/sound.js";
import { heroDown } from "../combat/combat.js";
import { ST, effectSource, emit } from "../core/stats.js";
import { statusHitFx } from "../fx/effects.js";
import { hero } from "./hero.js";
import { floatText } from "../ui/floats.js";

export const STATUS = {
  dim: { name: "Dim", col: "#c9c4dc", desc: "Your light fades: healing reduced by 60%", fx: { heal: c => { c.v *= .4; } } },
  fracture: { name: "Fracture", col: "#ff8463", desc: "Cracked shell: no block and 20% more damage taken", fx: { incoming: c => { c.block = 0; }, taken: c => { c.d *= 1.2; } } },
  static: { name: "Static", col: "#4fd3e4", desc: "Interference: half mana regen and skills cost 25% more", fx: { manaRegen: c => { c.v *= .5; }, skillCost: c => { c.v *= 1.25; } } },
  gravity: { name: "Gravity", col: "#b48cff", desc: "Weighed down: 30% slower attacks and no evasion", fx: { attackSpeed: c => { c.v *= .7; }, incoming: c => { c.evade = 0; } } },
  eclipse: { name: "Eclipse", col: "#ffd04d", desc: "Your light is covered: half crit chance", fx: { critChance: c => { c.v *= .5; } } }
};
export const ZONE_STATUS = ["dim", "fracture", "static", "gravity", "eclipse"];
export const stT = {};
export const st = id => stT[id] > 0;
export function stepStatuses(dt) { for (const k in stT) if (stT[k] > 0) stT[k] -= dt; }
export function clearStatuses() { for (const k in stT) stT[k] = 0; }
effectSource(() => ZONE_STATUS.filter(st).map(id => STATUS[id].fx));
export function applyStatus(id, sec, force, from) {
  if (heroDown || (hero.shield > 0 && !force)) return;
  if (!force && emit("status", { id, block: false }).block) return;
  if (!force && !(stT[id] > 0) && Math.random() < Math.min(.6, ST.shrug)) return;
  const isNew = !(stT[id] > 0);
  stT[id] = Math.max(stT[id] || 0, sec * ST.statusDur);
  if (isNew) { floatText(STATUS[id].name, "status", "hero", STATUS[id].col); sfx("status", 0, 150); }
  statusHitFx(id, isNew, from);
}
