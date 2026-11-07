// The save (S): its fields by lifetime, loading with every migration, and saving.

const KEY = "hollow-loop-v4";
// Every saved field, grouped by how long it lasts: RUN fields reset when you ascend, CYCLE fields when you transcend,
// and KEPT fields (settings, records, Stardust, the Star Forge, the Abyss) are never reset.
export const RUN = () => ({
  gold: 0, shards: 0, stage: 1, maxStage: 1, kills: 0, push: true, runStart: undefined, kps: undefined, gps: 0, last: Date.now(),
  train: {}, oc: {}, skill: {}, equip: {}, inv: [], bounties: [], rerollAt: 0
});
export const CYCLE = () => ({ echoes: 0, echoesTotal: 0, tree: {}, ascensions: 0, cyclePeak: 1 });
export const KEPT = () => ({
  v: 4, eco: 7, stardust: 0, stardustTotal: 0, forge: {}, transcends: 0,
  abyss: { best: 0, depth: 1, stone: 0, total: 0, altar: {}, seed: 0 },
  autoCfg: { trainOn: true, train: {}, push: 60, ascAt: 0, ascStall: false, smart: true }, auto: { nova: true, barrier: true, overdrive: true, storm: true, dash: true, shatter: true },
  anim: "auto", perf: false, sound: true, vol: "med", music: true, mvol: "med", seenIntro: false,
  bestiary: {}, peak: 1, totalKills: 0, bountyDone: 0, nextId: 1, salv: 1, autoEquip: true,
  saver: false, manaRes: .3, packView: { slot: "all", set: "any", sort: "up" }
});
export const fresh = () => Object.assign(KEPT(), CYCLE(), RUN());
export let S = fresh();
export function readSave() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  let d;
  try { d = JSON.parse(raw); } catch (e) { d = null; }
  if (d && typeof d.gold === "number") return d;
  console.error("Hollow Loop: unreadable save, kept as " + KEY + ".broken");
  try { localStorage.setItem(KEY + ".broken", raw); } catch (e) {}
  return null;
}
export function setSave(d) { S = d; }
let wiping = false;
// replace the save (or erase it, with null) and start the page over on it
export function replaceSave(d) {
  wiping = true;
  try { if (d) localStorage.setItem(KEY, JSON.stringify(d)); else localStorage.removeItem(KEY); } catch (e) {}
  location.reload();
}
export function save() {
  if (wiping) return;
  S.last = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}
