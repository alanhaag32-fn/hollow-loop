// Gear: slots, rarities, affixes, shape bonuses, sets, uniques, making items and what they're worth.
import { alive, dotDmg, field, heroDown, hit, land } from "../combat/combat.js";
import { itemPow, lumenAt } from "../core/curves.js";
import { shardAmt } from "../progress/currency.js";
import { S } from "../core/save.js";
import { ST, cutBy, onBase, plus, statSource } from "../core/stats.js";
import { $, fmt, pctS, pick, rnd, svgEl } from "../core/util.js";
import { enemy, foes, inView } from "../enemies/foes.js";
import { NOVA_MS, burst, fxBusy, ring, ringIfRoom, tempFx } from "../fx/effects.js";
import { anim, reduce } from "../fx/gfx.js";
import { heal, hero, setCounts } from "../hero/hero.js";
import { ORBITALS, WEAPON, slotAtk, splitShot, throwBlade, wDelay } from "../hero/orbitals.js";
import { mode } from "../modes/modes.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";
import { view } from "../world/scene.js";

export const PACK_CAP = 20;
const SLOTS = [
  // every weapon type in WEAPON (hero/orbitals.js) that isn't bare can drop (read when needed: WEAPON loads after this)
  { id: "weapon", name: "Orbital", get nouns() { return Object.keys(WEAPON).filter(k => !WEAPON[k].bare); }, shape: "M18 2 L25 26 L18 34 L11 26 Z", role: "attack", stats: (p, q) => ({ atk: onBase(p) }), main: (p, q) => "+" + fmt(p) + " attack" },
  { id: "armor", name: "Shell", nouns: ["Ring", "Lattice", "Carapace", "Aegis", "Bulwark", "Mirror"], shape: "M18 2 L32 10 L32 26 L18 34 L4 26 L4 10 Z M18 10 L25 14 L25 22 L18 26 L11 22 L11 14 Z", role: "health", stats: (p, q) => ({ maxHp: onBase(6 * p) }), main: (p, q) => "+" + fmt(6 * p) + " health" },
  { id: "boots", name: "Corona", nouns: ["Sunburst", "Petal", "Spire", "Ember", "Halo", "Wake"], shape: "M25 18 A7 7 0 1 1 11 18 A7 7 0 1 1 25 18 Z M18 1 L20.5 8 L15.5 8 Z M18 35 L15.5 28 L20.5 28 Z M1 18 L8 15.5 L8 20.5 Z M35 18 L28 20.5 L28 15.5 Z M6 6 L12 10 L10 12 Z M30 30 L24 26 L26 24 Z M30 6 L26 12 L24 10 Z M6 30 L10 24 L12 26 Z", role: "speed and evasion", stats: (p, q) => ({ evaR: onBase(p), spd: 1 + .12 * q }), main: (p, q) => "+" + Math.round(12 * q) + "% attack speed, " + fmt(p) + " evasion" },
  { id: "charm", name: "Lens", nouns: ["Sigil", "Prism", "Eye", "Moon", "Star", "Cube"], shape: "M2 18 Q18 3 34 18 Q18 33 2 18 Z M18 12 A6 6 0 1 0 18.01 12 Z", role: "crit chance", stats: (p, q) => ({ crit: plus(.035 * q) }), main: (p, q) => "+" + (3.5 * q).toFixed(1) + "% crit chance" }
];
export const SLOT = {};
 SLOTS.forEach(s => SLOT[s.id] = s);
export const LEGACY = {
  weapon: [["Blade", "Edge", "Lance", "Shard"], ["Fang", "Crescent", "Spear", "Shard", "Glaive", "Needle"]], armor: [["Plate", "Shell", "Carapace", "Aegis"]],
  boots: [["Treads", "Stride", "Drift", "Step"], ["Flow", "Comet", "Drift", "Flare"]], charm: [["Sigil", "Prism", "Glyph", "Core"]]
};
export const RARITY = [
  { name: "Common", mult: 1, w: 70, n: 0 }, { name: "Magic", mult: 1.5, w: 24, aff: [4, 8], n: 1 }, { name: "Rare", mult: 2.3, w: 5, aff: [8, 15], ramp: 20, cap: 3, n: 2 },
  { name: "Epic", mult: 3.5, w: .8, aff: [15, 25], ramp: 15, cap: 4, n: 3 }, { name: "Legendary", mult: 5.5, w: .1, aff: [25, 40], ramp: 12, cap: 5, n: 3 },
  { name: "Mythic", mult: 8, w: .1, aff: [40, 60], n: 4, myth: true }
];
// f: how a roll turns into the stat (a Legendary roll of 25-40 is 25-40% attack, but 2.5-4% life steal)
export const AFF = {
  atk: { l: "attack", f: 1, stats: v => ({ atk: 1 + v }) }, hp: { l: "health", f: 1, stats: v => ({ maxHp: 1 + v }) }, mp: { l: "max mana", f: 1, stats: v => ({ maxMp: 1 + v }) }, gold: { l: "lumen", f: 1, stats: v => ({ gold: 1 + v }) },
  spd: { l: "attack speed", f: 1, stats: v => ({ spd: 1 + v }) }, cdmg: { l: "crit damage", f: 1, stats: v => ({ critDmg: 1 + v }) }, tap: { l: "tap damage", f: 1, stats: v => ({ tap: 1 + v }) }, regen: { l: "mana regen", f: 1, stats: v => ({ mpRegen: 1 + v }) },
  leech: { l: "life steal", f: .1, stats: v => ({ leech: plus(v) }) }, block: { l: "block chance", f: .25, stats: v => ({ block: plus(v) }) }, eva: { l: "evasion rating", f: 1, stats: v => ({ evaR: 1 + v }) },
  boss: { l: "damage to bosses", f: 1, stats: v => ({ bossDmg: 1 + v }) }, elite: { l: "damage to elites", f: 1, stats: v => ({ eliteDmg: 1 + v }) }, orb: { l: "second and third orbital damage", f: 1, stats: v => ({ orbDmg: plus(v) }) }, redp: { l: "red crit power", f: .5, stats: v => ({ redPow: 1 + v }) },
  dr: { l: "damage reduction", f: .15, stats: v => ({ dmgTaken: cutBy("affix", v) }) }, mcost: { l: "lower mana costs", f: .2, stats: v => ({ costMult: cutBy("affix", v) }) }, move: { l: "move speed", f: .3, stats: v => ({ move: 1 + v }) },
  crit: { l: "crit chance", f: .1, stats: v => ({ crit: plus(v) }) }, skill: { l: "skill power", f: .75, stats: v => ({ skillPow: 1 + v }) }, shrug: { l: "chance to ignore a new status", f: .2, stats: v => ({ shrug: plus(v) }) }, shard: { l: "shard find", f: .5, stats: v => ({ shardF: plus(v) }) }
};
const AFF_SHARED = ["atk", "hp", "mp", "gold", "spd", "cdmg", "tap", "regen", "leech"];
const AFF_SLOT = { weapon: ["boss", "elite", "orb", "redp"], armor: ["block", "dr"], boots: ["eva", "mcost", "move"], charm: ["crit", "skill", "shrug", "shard"] };
export const affPool = slot => AFF_SHARED.concat(AFF_SLOT[slot] || []);
function affVal(k, b) { return b * ((AFF[k] && AFF[k].f) || 1); }
export function affText(k, b) { const v = affVal(k, b); return "+" + Math.round(v * 10) / 10 + "% " + AFF[k].l; }
const PREFIX = ["Hollow", "Burning", "Quiet", "Fractured", "Prime", "Null", "Gilded", "Warped", "Radiant", "Static", "Drifting", "Inverted"];
export const SETS = [
  { id: "void", name: "Voidforged", col: "#b48cff", cv: "var(--c2)",
    b2: { d: "+25% attack", stats: () => ({ atk: 1.25 }) },
    b4: { d: "Nova damage x2, and Nova marks its target to take +15% damage for 4s", stats: () => ({ novaPow: 2 }), fx: { hit(h) { if (h.kind === "nova") h.e.voidT = performance.now() + 4000; }, deal(h) { if (h.e.voidT > performance.now()) h.dmg *= 1.15; } } },
    b6: { d: "Nova leaves a void field for 3s that deals 50% attack per second and pulls enemies in", fx: {
      fields: [],
      cast(c) { const tg = enemy; if (c.id === "nova" && tg) setTimeout(() => { if (!tg.dead) this.field(tg.px, tg.py); }, NOVA_MS); },
      field(x, y) {
        this.fields.push({ x, y, R: 70, t: 3 });
        if (!reduce) tempFx(svgEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 70, fill: "rgba(122,69,224,.18)", stroke: "#b48cff", "stroke-width": 2, "stroke-dasharray": "6 5" }), [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .85 }, { opacity: 0 }], 3000);
      },
      tick(c) {
        for (let i = this.fields.length - 1; i >= 0; i--) {
          const F2 = this.fields[i]; F2.t -= c.dt;
          if (F2.t <= 0) { this.fields.splice(i, 1); continue; }
          foes.forEach(f => {
            if (f.dead) return; const dx = F2.x - f.px, dy = F2.y - f.py, d = Math.hypot(dx, dy);
            if (d > F2.R + f.R) return;
            dotDmg(f, ST.atk * .5 * c.dt);
            if (d > 8 && !f.boss) { f.vx = (f.vx || 0) + dx / d * 220 * c.dt; f.vy = (f.vy || 0) + dy / d * 220 * c.dt; }
          });
        }
      }
    } }
  },
  { id: "sun", name: "Sunwake", col: "#ffd04d", cv: "var(--c4)",
    b2: { d: "+20% attack speed", stats: () => ({ spd: 1.2 }) },
    b4: { d: "Every 8th attack fires 3 extra volleys", fx: {
      attack(c) {
        if (c.count % 8 !== 0) return;
        const sl = ST.volleysAll ? ORBITALS.filter(o => o.active()).map(o => o.key) : ["weapon"];
        sl.forEach(k => { for (let i = 0; i < 3; i++) setTimeout(() => { if (alive()) { throwBlade(false, i + 1, k); hit(slotAtk(k) * .7, wDelay(k), "blade", k); } }, 80 * i + 60); });
      }
    } },
    b6: { d: "Those extra volleys fire from every orbital you have", stats: () => ({ volleysAll: plus(1) }) }
  },
  { id: "tide", name: "Tidecaller", col: "#4fd3e4", cv: "var(--c1)",
    b2: { d: "+30% mana regen", stats: () => ({ mpRegen: 1.3 }) },
    b4: { d: "Kills restore 5% mana and 1.5% health", stats: () => ({ killHeal: plus(.015), killMana: plus(.05) }) },
    b6: { d: "Every 100 mana you spend sends out a wave dealing 300% attack to every enemy in view", fx: {
      spent: 0,
      cast(c) { this.spent += c.cost; while (this.spent >= 100) { this.spent -= 100; setTimeout(() => this.wave(), 120); } },
      wave() {
        if (heroDown) return;
        ring(view.HERO_X, view.HERO_Y, "#4fd3e4", 1, 26, 520, 4);
        foes.forEach(f => { if (!f.dead && inView(f)) land(f, ST.atk * 3, "aoe"); });
      }
    } }
  },
  { id: "blood", name: "Bloodglass", col: "#ff6b6b", cv: "var(--hurt)",
    b2: { d: "+50% crit damage", stats: () => ({ critDmg: 1.5 }) },
    b4: { d: "Crits heal 1% health (once per volley)", fx: { t: 0, crit(h) { const pn = performance.now(); if (h.crit && pn - this.t > 90) { this.t = pn; heal(ST.maxHp * .01); } } } },
    b6: { d: "Red crits make the target bleed for 100% of the hit over 3s", fx: { hit(h) { if (h.red) { const e = h.e, dps = h.dmg / 3; e.bleed = { dps: Math.max(dps, e.bleed && e.bleed.t > 0 ? e.bleed.dps : 0), t: 3 }; } } } }
  },
  { id: "choir", name: "Gilded Choir", col: "#f5ecc2", cv: "var(--coin)",
    b2: { d: "+40% lumen", stats: () => ({ gold: 1.4 }) },
    b4: { d: "+50% loot drop chance", stats: () => ({ drop: 1.5 }) },
    b6: { d: "Bosses drop items one rarity higher, and twice the shards", stats: () => ({ bossLoot: plus(1), bossShards: 2 }) }
  },
  { id: "storm", name: "Stormglass", col: "#7fb2ff", cv: "#7fb2ff",
    b2: { d: "+30% skill power", stats: () => ({ skillPow: 1.3 }) },
    b4: { d: "Storm strikes Shock enemies: +20% damage taken for 3s", fx: { hit(h) { if (h.kind === "storm") h.e.shockT = performance.now() + 3000; }, deal(h) { if (h.e.shockT > performance.now()) h.dmg *= 1.2; } } },
    b6: { d: "Shocked enemies explode when they die, dealing 150% attack to enemies nearby", fx: {
      kill(c) {
        const e = c.e;
        if (!(e.shockT > performance.now()) || e.blastKill) return;
        ringIfRoom(e.px, e.py, "#7fb2ff", .6, 6, 320, 3);
        foes.forEach(f => { if (f !== e && !f.dead && Math.hypot(f.px - e.px, f.py - e.py) < 90 + f.R) { f.blastKill = true; dotDmg(f, ST.atk * 1.5); if (!f.dead) f.blastKill = false; } });
      }
    } }
  },
  { id: "bastion", name: "Hollow Bastion", col: "#9fb3c8", cv: "#9fb3c8",
    b2: { d: "+30% health", stats: () => ({ maxHp: 1.3 }) },
    b4: { d: "Each block gives +4% damage for 5s, stacking up to 10 times", fx: {
      n: 0, t: 0,
      blocked() { const pn = performance.now(); this.n = this.t > pn ? Math.min(10, this.n + 1) : 1; this.t = pn + 5000; },
      deal(h) { if (this.n > 0 && this.t > performance.now()) h.dmg *= 1 + .04 * this.n; }
    } },
    b6: { d: "Barrier reforms once when it breaks (every 20s)", fx: {
      t: 0,
      shieldBroken() {
        const pn = performance.now(); if (pn <= this.t) return;
        this.t = pn + 20000; hero.shield = hero.shieldMax; hero.shieldT = Math.max(hero.shieldT, 4); floatText("Barrier reforms", "info", "hero", "#9fb3c8");
        anim($("hBarrier"), [{ transform: "scale(.3)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 260);
      }
    } }
  },
  { id: "veil", name: "Phantom Veil", col: "#8de0c0", cv: "#8de0c0",
    b2: { d: "+40% evasion", stats: () => ({ evaR: 1.4 }) },
    b4: { d: "Evading gives +50% damage for 1s", fx: { t: 0, evaded() { this.t = performance.now() + 1000; }, deal(h) { if (this.t > performance.now()) h.dmg *= 1.5; } } },
    b6: { d: "Dash leaves a decoy that draws enemy fire for 2s", fx: {
      dash(c) {
        field.decoy = { x: c.x0, y: c.y0, until: performance.now() + 2000 };
        if (!reduce) { const g = svgEl("g", { transform: "translate(" + c.x0.toFixed(1) + " " + c.y0.toFixed(1) + ")" }); svgEl("circle", { r: 16, fill: "#8de0c0", opacity: .35 }, g); svgEl("circle", { r: 26, fill: "none", stroke: "#8de0c0", "stroke-width": 1.5, "stroke-dasharray": "4 4" }, g); tempFx(g, [{ opacity: .9 }, { opacity: .9, offset: .8 }, { opacity: 0 }], 2000); }
      }
    } }
  },
  { id: "star", name: "Starforged", col: "#ff5fa8", cv: "var(--c5)", myth: true,
    b2: { d: "+1% attack per Stardust you've earned (up to +100%)", stats: () => ({ atk: 1 + Math.min(1, .01 * (S.stardustTotal || 0)) }) },
    b4: { d: "Every orbital fires 15% faster for each orbital you have equipped", stats: () => ({ orbRate: 1 + .15 * ORBITALS.filter(o => o.i === 0 || S.equip[o.key]).length }) },
    b6: { d: "+25% red crit chance", stats: () => ({ redBonus: plus(.25) }) }
  }
];
export const SET = {};
 SETS.forEach(s => SET[s.id] = s);
// each shape's v is its Rare value; IMPL_M scales it for the other rarities
const IMPL_M = [.4, .7, 1, 1.5, 2, 3];
const IMPL = {
  Ring: { v: .005, txt: v => "+" + (v * 100).toFixed(2).replace(/\.?0+$/, "") + "% health regen per second", stats: v => ({ hpRegen: plus(v) }) },
  Lattice: { v: .04, txt: v => "+" + pctS(v) + " block chance", stats: v => ({ block: plus(v) }) },
  Carapace: { v: .04, txt: v => pctS(v) + " less damage taken", stats: v => ({ dmgTaken: cutBy("shape", v) }) },
  Aegis: { v: .15, txt: v => "+" + pctS(v) + " Barrier strength", stats: v => ({ aegis: onBase(v) }) },
  Bulwark: { v: .10, txt: v => "Returns " + pctS(v) + " of damage taken to the attacker", stats: v => ({ thorn: plus(v) }) },
  Mirror: { v: .04, txt: v => pctS(v) + " chance to reflect enemy shots", stats: v => ({ reflect: plus(v) }) },
  Sunburst: { v: .05, txt: v => "+" + pctS(v) + " more attack speed", stats: v => ({ spd: 1 + v }) },
  Petal: { v: .15, txt: v => "+" + pctS(v) + " evasion", stats: v => ({ evaR: 1 + v }) },
  Spire: { v: .05, txt: v => "+" + pctS(v) + " move speed", stats: v => ({ move: 1 + v }) },
  Ember: { v: .05, txt: v => "Hits burn for " + pctS(v) + " of attack over 2s", stats: v => ({ burn: plus(v) }) },
  Halo: { v: .10, txt: v => "+" + pctS(v) + " mana regen", stats: v => ({ mpRegen: 1 + v }) },
  Wake: { v: .075, txt: v => "Enemy shots travel " + pctS(Math.min(.4, v)) + " slower", stats: v => ({ wake: plus(v) }) },
  Sigil: { v: .075, txt: v => "+" + pctS(v) + " skill power", stats: v => ({ skillPow: 1 + v }) },
  Prism: { v: .15, txt: v => "+" + pctS(v) + " crit damage", stats: v => ({ critDmg: 1 + v }) },
  Eye: { v: .1, txt: v => "+" + v.toFixed(2).replace(/\.?0+$/, "") + "x red crit power", stats: v => ({ redPow: onBase(v) }) },
  Moon: { v: .01, txt: v => "+" + pctS(v) + " crit chance", stats: v => ({ crit: plus(v) }) },
  Star: { v: .2, txt: v => "+" + pctS(v) + " tap damage", stats: v => ({ tap: 1 + v }) },
  Cube: { v: .1, txt: v => "+" + pctS(v) + " lumen", stats: v => ({ gold: 1 + v }) }
};
export const implOf = it => { const d = it && IMPL[noun(it)]; return d ? { d, v: d.v * IMPL_M[it.r], txt: d.txt(d.v * IMPL_M[it.r]) } : null; };
export const UNIQ = {
  split: { s: "weapon", name: "Splitshot", desc: "25% chance a volley also splits into 2 shards that hit other enemies for 40% each", fx: { fire(c) { if (Math.random() < .25) setTimeout(() => splitShot(enemy, slotAtk(c.slot) * .4, c.slot), c.delay + 10); } } },
  heat: { s: "weapon", name: "Overheat", desc: "Each orbital hit on the same target adds +3% damage, up to +90%", fx: { e: null, n: 0, deal(h) { if (h.kind !== "blade") return; if (this.e === h.e) this.n = Math.min(30, this.n + 1); else { this.e = h.e; this.n = 0; } h.dmg *= 1 + .03 * this.n; } } },
  exec: { s: "weapon", name: "Executioner", desc: "Orbital hits destroy normal enemies under 15% health outright (double damage to elites and bosses there)", fx: { deal(h) { if (h.kind !== "blade" || h.e.hp / h.e.max >= .15) return; if (!h.e.boss && !h.e.elite) h.lethal = true; else h.dmg *= 2; } } },
  grav: { s: "weapon", name: "Gravity Well", desc: "Every 10th orbital hit pulls nearby enemies in and stuns them for 0.5s", fx: {
    n: 0,
    hit(h) {
      if (h.kind !== "blade" || ++this.n % 10 !== 0) return;
      const e = h.e; ringIfRoom(e.px, e.py, "#b48cff", 4, .6, 300, 3);
      foes.forEach(f => { if (f.dead) return; const dx = e.px - f.px, dy = e.py - f.py, d = Math.hypot(dx, dy); if (d > 130) return; if (d > 1) { f.vx = (f.vx || 0) + dx / d * 160; f.vy = (f.vy || 0) + dy / d * 160; } f.stun = Math.max(f.stun || 0, .5); if (f.el) f.el.model.classList.add("stun"); });
    }
  } },
  phoenix: { s: "armor", name: "Phoenix Core", desc: "Once every 2 minutes, a killing blow revives you at 50% health", fx: {
    t: 0,
    revive(c) {
      const pn = performance.now(); if (c.done || pn <= this.t) return;
      this.t = pn + 120000; hero.hp = ST.maxHp * .5; c.done = true;
      log("Phoenix Core: revived", "good"); burst(view.HERO_X, view.HERO_Y, "#ff8a3d", 14); floatText("Phoenix", "info", "hero", "#ff8a3d");
    }
  } },
  prism: { s: "armor", name: "Prism Shell", desc: "Ignore the first hit every 6 seconds", fx: { t: 0, incoming(c) { const pn = performance.now(); if (c.cancel || pn <= this.t) return; this.t = pn + 6000; c.cancel = true; floatText("Prism", "info", "hero", "#ffffff"); ringIfRoom(view.HERO_X, view.HERO_Y, "#ffffff", 1.6, 2.6, 260, 2); } } },
  last: { s: "armor", name: "Last Stand", desc: "Below 30% health you take 40% less damage", fx: { taken(c) { if (hero.hp < ST.maxHp * .3) c.d *= .6; } } },
  anchor: { s: "armor", name: "Anchor", desc: "Immune to Gravity and Fracture", fx: { status(c) { if (c.id === "gravity" || c.id === "fracture") c.block = true; } } },
  after: { s: "boots", name: "Afterimage", desc: "Dash hits for double damage and leaves you untouchable for 0.5s longer", stats: () => ({ dashPow: 2, dashGuard: plus(.5) }) },
  flare: { s: "boots", name: "Solar Flare", desc: "While moving, release a pulse every 5s that deals 100% attack to enemies around you", fx: {
    t: 0,
    tick(c) {
      if (!c.moving || !alive()) return;
      this.t += c.dt;
      if (this.t >= 5) { this.t = 0; ring(view.HERO_X, view.HERO_Y, "#ffd04d", 1, 12, 380, 3); foes.forEach(f => { if (!f.dead && Math.hypot(f.px - view.HERO_X, f.py - view.HERO_Y) < 130) land(f, ST.atk, "aoe"); }); }
    }
  } },
  tail: { s: "boots", name: "Tailwind", desc: "+1% attack speed for every second in combat, up to +30%. Resets when you're hit", fx: { t: 0, tick(c) { if (alive()) this.t = Math.min(30, this.t + c.dt); }, attackSpeed(c) { c.v *= 1 + .01 * this.t; }, hurt() { this.t = 0; } } },
  comet: { s: "boots", name: "Comet Trail", desc: "Moving leaves a trail that burns enemies for 20% attack per second", fx: {
    t: 0, trail: [],
    tick(c) {
      if (c.moving) {
        this.t += c.dt;
        if (this.t >= .15) {
          this.t = 0; this.trail.push({ x: view.HERO_X, y: view.HERO_Y, t: 2 });
          if (!reduce && !fxBusy()) tempFx(svgEl("circle", { cx: view.HERO_X.toFixed(1), cy: view.HERO_Y.toFixed(1), r: 7, fill: "#ff9a4d", opacity: .5 }), [{ opacity: .55 }, { opacity: 0 }], 2000);
        }
      }
      const tr = this.trail;
      for (let i = tr.length - 1; i >= 0; i--) { tr[i].t -= c.dt; if (tr[i].t <= 0) tr.splice(i, 1); }
      if (tr.length) foes.forEach(f => { if (!f.dead && tr.some(p => Math.hypot(f.px - p.x, f.py - p.y) < f.R + 10)) dotDmg(f, ST.atk * .2 * c.dt); });
    }
  } },
  eye3: { s: "charm", name: "Third Eye", desc: "+50% red crit power", stats: () => ({ redPow: 1.5 }) },
  tlens: { s: "charm", name: "Time Lens", desc: "Crits slow the enemy, and the shots it fires, by 20% for 1s", fx: { hit(h) { if (h.crit) h.e.slowT = performance.now() + 1000; } } },
  focus: { s: "charm", name: "Focus Lens", desc: "Skill crits are always red crits", fx: { crit(h) { if (h.crit && (h.kind === "nova" || h.kind === "storm")) h.red = true; } } },
  lucky: { s: "charm", name: "Lucky Star", desc: "5% of kills drop a bonus item", stats: () => ({ bonusDrop: plus(.05) }) }
};
const uniqFor = slot => Object.keys(UNIQ).filter(k => UNIQ[k].s === slot);
statSource(give => {
  const eq = Object.values(S.equip).filter(Boolean), sum = {};
  SLOTS.forEach(sl => { const it = S.equip[sl.id]; if (it) give(sl, it.power, it.power / itemPow(it.stage || 1)); });
  eq.forEach(it => (it.affs || []).forEach(([k, b]) => { if (AFF[k]) sum[k] = (sum[k] || 0) + affVal(k, b); }));
  for (const k in sum) give(AFF[k], sum[k] / 100);
  ["armor", "boots", "charm"].forEach(sl => { const m = implOf(S.equip[sl]); if (m) give(m.d, m.v); });
  const sc = setCounts();
  SETS.forEach(s => [2, 4, 6].forEach(k => { if ((sc[s.id] || 0) >= k) give(s["b" + k], sc[s.id]); }));
  new Set(eq.map(it => it.u).filter(Boolean)).forEach(u => give(UNIQ[u], 1));
});
export const noun = it => it.name.split(" ").pop();
const affSum = it => (it.affs || []).reduce((a, x) => a + x[1], 0);
export const score = it => it.power * (1 + affSum(it) / 100) * (it.set ? 1.1 : 1);
export const salvValue = it => Math.ceil(.6 * lumenAt(it.stage) * (1 + it.r) * ST.salv);
function rollRarity(boss, minR, stage) {
  const mythic = boss && mode.mythic(stage);
  const w = RARITY.map((r, i) => i < minR || (r.myth && !mythic) ? 0 : (r.myth ? ST.mythChance : 1) * r.w * (r.ramp ? Math.min(r.cap, 1 + stage / r.ramp) : 1) * (boss ? (i >= 2 ? 2.5 : .6) : 1) * (i >= 2 ? ST.luck : 1));
  let t = w.reduce((a, b) => a + b, 0) * Math.random();
  for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0 && w[i] > 0) return i; }
  return Math.max(minR, 0);
}
export function makeItem(stage, boss, minR, forceSlot, up) {
  let ri0 = rollRarity(boss, minR || 0, stage);
  if (up) ri0 = Math.min(boss && mode.mythic(stage) ? 5 : 4, ri0 + up);
  const ri = ri0, r = RARITY[ri], slot = forceSlot ? SLOTS.find(x => x.id === forceSlot) : pick(SLOTS);
  const power = Math.max(1, Math.round(itemPow(stage) * r.mult * (.9 + Math.random() * .2)));
  const it = { id: S.nextId++, slot: slot.id, r: ri, power, stage, affs: [] };
  if (r.myth) it.set = pick(SETS).id;
  else if (ri >= 2 && Math.random() < ST.setChance) it.set = pick(SETS.filter(x => !x.myth)).id;
  it.name = (it.set ? SET[it.set].name : pick(PREFIX)) + " " + pick(slot.nouns);
  const gd = ST.gild, count = (r.n || 0) + (gd >= 1 && ri >= 2 ? 1 : 0) + (gd >= 2 && ri === 1 ? 1 : 0) + (gd >= 3 && ri >= 4 ? 1 : 0);
  const keys = affPool(slot.id), craft = ST.affixPow;
  if (ri >= 4) it.u = pick(uniqFor(slot.id));
  for (let i = 0; i < count && keys.length; i++) {
    const k = keys.splice(rnd(keys.length), 1)[0];
    it.affs.push([k, rollAffix(r, craft)]);
  }
  return it;
}
export const salvShards = it => it.r >= 3 ? (it.r - 2) * shardAmt(it.stage) : 0;
// a fresh affix roll for this rarity (times Fine Craft and the like)
export const rollAffix = (r, mult = 1) => Math.round((r.aff[0] + Math.random() * (r.aff[1] - r.aff[0])) * mult);
