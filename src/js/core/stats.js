// The stat fold and effect hooks: bonus sources register here, computeStats folds them, emit runs the active effects.

// Every bonus source declares its own modifiers next to its description and registers with statSource();
// computeStats folds them by these definitions and knows none of the sources. A modifier is a number
// (multiplies the stat), plus(v) (added after multipliers), onBase(v) (added to the base before multipliers)
// or cutBy(group, v) (reductions in one group add up, then cut the stat by at most that group's cap).
// per: stats folded earlier that also multiply this one by (1 + their value). min/max: a number or an earlier stat.
const STATS = {
  echoBonus: { base: 0 },
  atk: { base: 5, per: ["echoBonus"] }, maxHp: { base: 60, per: ["echoBonus"] }, hpRegen: { base: .01 }, healMult: {},
  maxMp: { base: 100 }, mpRegen: { base: .03 }, leech: { base: 0, max: .15 }, leechCap: {},
  spd: {}, orbRate: {}, orbDmg: {}, crit: { base: .05 }, critDmg: { base: 2 }, redPow: { base: 2 }, redBonus: { base: 0 }, tap: { base: .5 },
  bossDmg: {}, eliteDmg: {}, burn: { base: 0 },
  block: { base: 0, max: .5 }, blockLeak: { base: .3 }, evaR: { base: 0 }, dmgTaken: { min: .3, cuts: { armor: .45, shape: 1, affix: .3 } },
  crushTaken: {}, aegis: {}, thorn: { base: 0 }, reflect: { base: 0 }, wake: { base: 0, max: .4 }, move: {},
  statusDur: { min: .4 }, shrug: { base: 0 },
  skillPow: {}, cdrFloor: { base: .3 }, cdr: { min: "cdrFloor" }, costMult: { min: .35, cuts: { skill: 1, affix: .3 } }, skillMastery: { base: 0 },
  novaPow: {}, stormBlades: { base: 0 }, surgeTime: { base: 0 }, dashPow: {}, dashGuard: { base: 0 },
  gold: {}, bigGold: {}, drop: { base: .3, max: .95 }, luck: {}, setChance: { base: .2 }, salv: {}, shardF: {},
  killHeal: { base: .05 }, killMana: { base: 0 }, bossLoot: { base: 0 }, bossShards: {}, eliteSpoils: { base: 0 }, bonusDrop: { base: 0 },
  mythChance: {}, gild: { base: 0 }, affixPow: {}, trainCap: { base: 0 }, ocGrowth: { base: 2 },
  bossTime: { base: 0 }, homing: { base: 0 }, startStage: { base: 1 }, starterKit: { base: 0 }, echoGain: {}, momentumAt: { base: .5, max: .75 }, stoneGain: {},
  bountyGold: {}, bountySlots: { base: 3 }, postTime: {}, offRate: { base: .5 }, offHours: { base: 8 }
};
export const plus = v => ({ plus: v }), onBase = v => ({ base: v }), cutBy = (g, v) => ({ cut: g, v });
const STAT_SOURCES = [];
// src(give): call give(def, ...args) for every active bonus; def.stats(...args) returns its modifiers and
// def.fx (effect hooks, see emit) joins the active effects. def may also be a bare stats function.
export const statSource = src => STAT_SOURCES.push(src);
// Effects are objects of named hooks, each called as hook(ctx, n). The hero's effects are whatever computeStats
// collected (web nodes, sets, uniques, skills, Abyss rules and milestones; lower `order` runs first) plus the
// statuses on the hero right now. Enemy effects (modifiers, boss mechanics) live on the enemy and get (ctx, enemy).
// Returns ctx, so value hooks read as emit("heal", { v }).v.
const EFFECT_SOURCES = [];
// src() returns effects that come and go between stat folds (the statuses on the hero right now)
export const effectSource = src => EFFECT_SOURCES.push(src);
export function emit(name, c) {
  for (const { fx, n } of ST.effects) if (fx[name]) fx[name](c, n);
  for (const src of EFFECT_SOURCES) for (const fx of src()) if (fx[name]) fx[name](c);
  return c;
}
export function foeEmit(e, name, c) {
  for (const fx of e.fx) if (fx[name]) fx[name](c, e);
  return c;
}
export let ST = null;
export function refreshStats() { const old = ST; ST = computeStats(); return old; }
function computeStats() {
  const mods = {}, effects = [];
  const give = (def, ...a) => {
    const f = typeof def === "function" ? def : def.stats;
    if (f) { const m = f(...a); for (const k in m) { if (!STATS[k]) throw new Error("unknown stat " + k); (mods[k] || (mods[k] = [])).push(m[k]); } }
    if (def.fx && !effects.some(x => x.fx === def.fx)) effects.push({ fx: def.fx, n: a[0] });
  };
  STAT_SOURCES.forEach(src => src(give));
  effects.sort((a, b) => (a.fx.order || 0) - (b.fx.order || 0));
  const out = { effects };
  for (const k in STATS) {
    const d = STATS[k], cuts = {};
    let b = d.base == null ? 1 : d.base, mul = 1, add = 0;
    for (const m of mods[k] || []) {
      if (typeof m === "number") mul *= m;
      else if (m.plus != null) add += m.plus;
      else if (m.base != null) b += m.base;
      else cuts[m.cut] = (cuts[m.cut] || 0) + m.v;
    }
    let v = b * mul;
    for (const g in cuts) v *= 1 - Math.min(d.cuts[g], cuts[g]);
    (d.per || []).forEach(p => v *= 1 + out[p]);
    v += add;
    const lo = typeof d.min === "string" ? out[d.min] : d.min;
    if (lo != null) v = Math.max(lo, v);
    if (d.max != null) v = Math.min(d.max, v);
    out[k] = v;
  }
  return out;
}
