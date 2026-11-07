// Enemy kinds: variants, modifiers, boss mechanics and statuses they carry, and making a regular enemy.
import { heroDown, hurt, trueDamage } from "../combat/combat.js";
import { stageDmg, stageHp } from "../core/curves.js";
import { S } from "../core/save.js";
import { ST } from "../core/stats.js";
import { pick, polyPts, rnd, svgEl } from "../core/util.js";
import { burst, ringIfRoom, shake, warnRing } from "../fx/effects.js";
import { ZONE_STATUS, applyStatus } from "../hero/statuses.js";
import { FAM } from "../index/index.js";
import { momentum } from "../modes/modes.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";

// all four are ranged: needler (Pale), ripper rails (Crimson), mortar (Bastion), void lance (Umbral)
export const ENEMY_WEAPON = [
  "M-6 2 L-6 -22 L-2 -22 L-2 2 Z M2 2 L2 -22 L6 -22 L6 2 Z M-8 -3 L8 -3 L8 3 L-8 3 Z M-7 -25 L-1 -25 L-1 -22 L-7 -22 Z M1 -25 L7 -25 L7 -22 L1 -22 Z",
  "M-8 3 L-3 3 L-3 -14 L-8 -12 Z M3 3 L8 3 L8 -12 L3 -14 Z M-8 -1 L8 -1 L8 3 L-8 3 Z",
  "M-9 4 L9 4 L9 -5 L-9 -5 Z M-6 -5 L6 -5 L5 -16 L-5 -16 Z M-8 -16 L8 -16 L8 -21 L-8 -21 Z",
  "M-1.5 2 L1.5 2 L1.5 -8 L-1.5 -8 Z M0 -7 L6 -17 L0 -29 L-6 -17 Z M-10 -12 L-5 -26 L-6 -12 Z M10 -12 L5 -26 L6 -12 Z"
];
export const MUZZLE = { pale: 25, crimson: 22, bastion: 21, umbral: 29 };
export const VARIANTS = [
  { id: "pale", name: "Pale", role: "Swift", desc: "Quick, frequent attacks but fragile", hue: 190, sat: 45, lit: 80, hp: .7, dmg: .75, spd: 1.6, w: 0, from: 1 },
  { id: "bastion", name: "Bastion", role: "Warden", desc: "Tanky and slow. Carries an extra status and inflicts statuses more often", hue: 160, sat: 24, lit: 42, hp: 1.7, dmg: .8, spd: .8, stx: 1, stc: 1.5, w: 2, from: 4 },
  { id: "crimson", name: "Crimson", role: "Brute", desc: "Slow, heavy hits with a 25% chance to crit for double damage", hue: 4, sat: 75, lit: 48, hp: 1.05, dmg: 1.45, spd: .75, crit: .25, w: 1, from: 7 },
  { id: "umbral", name: "Umbral", role: "Phantom", desc: "Dodges 25% of your blades and skills (taps always land) and burns 8 mana on hit", hue: 272, sat: 55, lit: 32, hp: .9, dmg: .95, spd: 1, eva: .25, burn: .08, w: 3, from: 12 }
];
const VAR = {};
 VARIANTS.forEach(v => VAR[v.id] = v);
export const MOVE = { pale: 1.35, bastion: .75, crimson: 1, umbral: 1.15 };
export const vFill = v => "hsl(" + v.hue + " " + v.sat + "% " + v.lit + "%)";
const vStroke = v => "hsl(" + v.hue + " " + Math.min(95, v.sat + 25) + "% " + Math.min(90, v.lit + 24) + "%)";
const SHAPE_NAMES = { 3: "Triad", 4: "Quadrant", 5: "Pentad", 6: "Hexen", 7: "Heptarch", 8: "Octave" };
export const MODS = {
  shielded: { name: "Shielded", desc: "Every 4th hit on it is fully blocked", fx: { guard(h, e) { if (h.pierce) return; e.hitN = (e.hitN || 0) + 1; if (e.hitN % 4 === 0) { h.dmg = 0; h.note = "Blocked"; } } } },
  hasted: { name: "Hasted", desc: "Attacks 40% faster", fx: { attackRate: c => { c.v *= 1.4; } } },
  vampiric: { name: "Vampiric", desc: "Heals 4% of its health each time it hits you", fx: { landed(c, e) { if (!e.dead) e.hp = Math.min(e.max, e.hp + e.max * (e.boss ? .005 : .012) * Math.min(1.5, modPow())); } } },
  armored: { name: "Armored", desc: "Takes 30% less damage from blades and skills, but taps ignore it", fx: { take(h) { if (h.kind !== "tap" && !h.pierce) h.dmg *= .7; } } },
  volatile: { name: "Volatile", desc: "Explodes for 25% of your max health when destroyed", fx: {
    // blasts hit for 25% of your health (more after many ascensions, up to 35%), and several at once can't add up past 50% in 1.5s
    winT: 0, sum: 0,
    death(c, e) {
      setTimeout(() => {
        burst(e.px, e.py, "#ff8463", 12); shake(6, 300);
        const pn = performance.now(); if (pn > this.winT) { this.winT = pn + 1500; this.sum = 0; }
        const d = Math.min(ST.maxHp * .25 * Math.min(1.4, modPow()), ST.maxHp * .5 - this.sum);
        if (d > 0) { this.sum += d; trueDamage(d, "Blast"); }
      }, 150);
    }
  } },
  // Regenerating heals only after 2.5s without being hit, so steady damage keeps it shut off
  regen: { name: "Regenerating", desc: "Heals 2% of its health every second", fx: { tick(c, e) { if (performance.now() - (e.lastHitT || 0) > 2500) e.hp = Math.min(e.max, e.hp + e.max * (e.boss ? .004 : .01) * Math.min(1.5, modPow()) * c.dt); } } },
  splitting: { name: "Splitting", desc: "Splits into a smaller copy when destroyed", fx: { death(c, e) { if (!e.child) c.split = true; } } },
  draining: { name: "Draining", desc: "Every hit that lands inflicts a random status", fx: { landed(c, e) { applyStatus(pick(ZONE_STATUS), 5, false, e); } } }
};
const MOD_KEYS = Object.keys(MODS);
// Boss mechanics. Each keeps its own state on the boss (e.m[id], from init) and hooks into hits and the boss's turn.
const MECHS = {
  facets: {
    init: () => ({ t: 5, n: 0 }),
    draw(e) {
      if (!e || !e.el) return;
      const g = e.el.facets; g.innerHTML = "";
      if (!e.m || !e.m.facets) return;
      const n = e.m.facets.n, R = e.R + 16;
      for (let i = 0; i < n; i++) { const a = i * Math.PI / 4; svgEl("polygon", { points: polyPts(6, 5.5, 0, Math.cos(a) * R, Math.sin(a) * R), fill: "#4fd3e4", stroke: "#effffc", "stroke-width": 1 }, g); }
    },
    fx: {
      guard(h, e) {
        const F2 = e.m.facets; if (F2.n <= 0) return;
        F2.n = Math.max(0, F2.n - (h.kind === "tap" ? 2 : h.kind === "nova" ? 4 : 1));
        if (h.kind !== "tap") h.dmg *= h.kind === "nova" ? .3 : .1;
        MECHS.facets.draw(e);
        if (F2.n === 0) { log("Facet shield shattered", "good"); ringIfRoom(e.px, e.py, "#4fd3e4", 2, 5, 350); }
      },
      bossTurn(c, e) {
        const F2 = e.m.facets; if (F2.n !== 0) return;
        F2.t -= c.dt;
        if (F2.t <= 0) { F2.n = 8; F2.t = 10; MECHS.facets.draw(e); log("Facet shield up. Tap to break it", "r1"); floatText("Facet shield", "info", e); }
      }
    }
  },
  mirror: {
    init: () => ({ t: 7, tele: 0, on: 0 }),
    fx: {
      // reflects a slice of each hit, scaled to your health so huge damage can't one-shot you:
      // at most 2% of your max health per hit and 30% per Mirror phase
      struck(h, e) {
        const R = e.m.mirror; if (!(R.on > 0)) return;
        const room = ST.maxHp * .3 - (R.dealt || 0);
        if (room > 0) { const r = Math.min(h.dmg * .25, ST.maxHp * .02, room); R.dealt = (R.dealt || 0) + r; trueDamage(r, "Mirror"); }
      },
      bossTurn(c, e) {
        const R = e.m.mirror, em = e.el.model;
        if (R.on > 0) { R.on -= c.dt; if (R.on <= 0) em.classList.remove("mir"); }
        else if (R.tele > 0) { R.tele -= c.dt; if (R.tele <= 0) { R.on = 3; R.dealt = 0; em.classList.add("mir"); log("Mirror up: your damage reflects", "bad"); } }
        else { R.t -= c.dt; if (R.t <= 0) { R.t = 11; R.tele = 1.2; floatText("Mirror forming", "info", e); } }
      }
    }
  },
  well: {
    init: () => ({ t: 9, ch: 0, dealt: 0, need: 1 }),
    fx: {
      struck(h, e) { const W = e.m.well; if (W.ch > 0) W.dealt += h.dmg; },
      bossTurn(c, e) {
        const W = e.m.well, em = e.el.model;
        if (W.ch > 0) {
          W.ch -= c.dt;
          if (W.dealt >= W.need) {
            W.ch = 0; e.stun = 2.5; em.classList.remove("chan"); em.classList.add("stun");
            log("Gravity Well broken. The boss is stunned", "good"); ringIfRoom(e.px, e.py, "#b48cff", 1, 4, 400);
          } else if (W.ch <= 0) {
            em.classList.remove("chan"); log("The Gravity Well collapses on you", "bad"); shake(8, 400);
            hurt(ST.maxHp * .4, true, e);
            if (!heroDown) applyStatus("gravity", 6, true);
          }
        } else {
          W.t -= c.dt;
          if (W.t <= 0) { W.t = 14; W.ch = 4; W.dealt = 0; W.need = e.max * .1; em.classList.add("chan"); warnRing(4); log("Gravity Well. Deal damage fast to break it", "bad"); }
        }
      }
    }
  },
  motes: {
    init: () => ({ t: 6, n: 0 }),
    draw(e) {
      if (!e || !e.el) return;
      const g = e.el.motes; g.innerHTML = "";
      if (!e.m || !e.m.motes) return;
      const n = e.m.motes.n, R = e.R + 36;
      for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / 3; svgEl("polygon", { points: polyPts(3, 6, a, Math.cos(a) * R, Math.sin(a) * R), fill: "#5fd38d", stroke: "#effffc", "stroke-width": 1 }, g); }
    },
    fx: {
      guard(h, e) {
        const O = e.m.motes; if (O.n <= 0) return;
        h.dmg *= 1 - .15 * O.n;
        if (h.kind === "tap" || h.kind === "storm" || h.seeking) O.n--; else if (h.kind === "nova") O.n = 0;
        MECHS.motes.draw(e);
      },
      bossTurn(c, e) {
        const O = e.m.motes;
        if (O.n > 0) e.hp = Math.min(e.max, e.hp + e.max * .003 * O.n * c.dt);
        else { O.t -= c.dt; if (O.t <= 0) { O.t = 12; O.n = 3; MECHS.motes.draw(e); log("Shard motes are healing the boss. Tap them", "bad"); } }
      }
    }
  }
};
const MECH_IDS = Object.keys(MECHS);
// an enemy's effects: its modifiers, then its boss mechanics, then any extra the run mode adds
export const foeFx = (mods, m, extra) => mods.map(k => MODS[k].fx).concat(m ? Object.keys(m).map(k => MECHS[k].fx) : [], extra || []);
const modPow = () => 1 + .1 * Math.max(0, (S.ascensions || 0) - 1);
export function enemyStatuses(stage, boss, elite, v) {
  // random statuses; deeper stages stack more of them on each enemy
  if (stage < 6 && !boss && !v.stx) return { list: [], chance: 0 };
  const n = Math.min(5, (stage < 20 ? 1 : stage < 40 ? 2 : stage < 60 ? 3 : 4) + (boss || elite ? 1 : 0) + (v.stx && stage >= 6 ? v.stx : 0));
  const pool = ZONE_STATUS.slice(), list = [];
  for (let i = 0; i < n && pool.length; i++) list.push(pool.splice(rnd(pool.length), 1)[0]);
  return { list, chance: Math.min(.6, (boss ? .35 : elite ? .4 : Math.min(.3, .08 + .008 * stage)) * (v.stc || 1)) };
}
export function rollMods(boss, elite) {
  const a = S.ascensions || 0;
  let n = boss ? (a >= 1) + (a >= 2) + (a >= 4) : elite ? (a >= 1) + (a >= 3) + (a >= 6) : (a >= 2 && Math.random() < Math.min(.5, .1 * (a - 1)) ? 1 : 0);
  const pool = MOD_KEYS.filter(k => !(boss && k === "splitting")), out = [];
  while (n-- > 0 && pool.length) out.push(pool.splice(rnd(pool.length), 1)[0]);
  return out;
}
export function bossMechs(zone) {
  if (zone < 1) return null;
  const list = [MECH_IDS[(zone - 1) % 4]];
  if (zone >= 5 && MECH_IDS[zone % 4] !== list[0]) list.push(MECH_IDS[zone % 4]);
  return Object.fromEntries(list.map(k => [k, MECHS[k].init()]));
}
export function makeEnemy(stage, elite) {
  const boss = stage % 10 === 0, zone = Math.floor((stage - 1) / 10), sides = 3 + zone % 6;
  const v = pick(VARIANTS.filter(x => stage >= x.from));
  const hpE = stageHp(stage) * (boss ? 8 : elite ? 4 : 1) * (momentum() ? .02 : 1);
  const dmg = stageDmg(stage) * (boss ? 1.3 : elite ? 1.5 : 1) * (momentum() ? .25 : 1);
  const tier = Math.min(4, Math.floor(stage / 12) + (boss ? 2 : elite ? 1 : 0) + (Math.random() < .2 ? 1 : 0));
  // bosses deep in get more time: +0.75s per stage past 40, up to +45s
  const tm = 30 + Math.min(45, Math.max(0, (stage - 40) * .75)) + ST.bossTime;
  const mods = rollMods(boss, elite && !boss), m = boss ? bossMechs(zone) : null;
  return {
    hp: hpE * v.hp, max: hpE * v.hp, fresh: true, dmg: dmg * v.dmg, boss, elite: !!elite && !boss, sides, family: FAM[sides], tier, hue: v.hue, v, fill: vFill(v), stroke: vStroke(v),
    R: Math.round((boss ? 34 : elite ? 30 : 25) * (v.id === "bastion" ? 1.08 : v.id === "pale" ? .92 : 1)), weapon: ENEMY_WEAPON[v.w],
    name: (boss ? "Grand " : elite ? "Elite " : "") + v.name + " " + SHAPE_NAMES[sides],
    timer: boss ? tm : 0, timerMax: boss ? tm : 1, specT: 4, tele: 0, enraged: false,
    statuses: enemyStatuses(stage, boss, elite && !boss, v), mods, m, fx: foeFx(mods, m), stun: 0
  };
}
export function makeChild(p) {
  return Object.assign({}, p, {
    hp: p.max * .4, max: p.max * .4, dmg: p.dmg * .6, R: Math.max(16, Math.round(p.R * .7)), child: true, dead: false, fresh: true, elite: false, boss: false,
    mods: p.mods.filter(k => k !== "splitting"), fx: foeFx(p.mods.filter(k => k !== "splitting"), null), name: "Split " + p.name.replace(/^Elite /, ""), m: null, hitN: 0, stun: 0
  });
}
