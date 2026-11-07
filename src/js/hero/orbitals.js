// The hero's orbitals: the three slots, weapon types and traits, firing, posing and their projectiles.
import { sfx } from "../audio/sound.js";
import { heroDown, hit, land } from "../combat/combat.js";
import { S } from "../core/save.js";
import { ST, emit } from "../core/stats.js";
import { $, svgEl } from "../core/util.js";
import { enemy, foes } from "../enemies/foes.js";
import { fx, fxBusy, moveFx, ringIfRoom, shake, tempFx, zigzag } from "../fx/effects.js";
import { ARENA_C, anim, reduce } from "../fx/gfx.js";
import { SLOT, noun } from "../gear/items.js";
import { hero } from "./hero.js";
import { transOpen } from "../progress/transcend.js";
import { view } from "../world/scene.js";

export const SLOT2_AT = 25, SLOT2_DMG = .6;
const COIL = [[.3, 1], [.3, 1], [.3, 2], [.35, 3], [.4, 4], [.5, 5]];
const pc = v => Math.round(v * 100);
// Every orbital weapon type in one place.
//   path: its sprite. trait: what it does at each rarity (see traitOf). bare: not an item type (an empty main slot).
//   Timing, so the hit lands as the shot arrives: fixed ms for beams, else flight at speed px/s, or wait ms with no
//   target to measure. muzzle: how far ahead of the orbital shots start. flash: muzzle flash and recoil on firing.
//   spin: the orbital spins in place instead of aiming. again: a second hit at this multiple of the flight time.
//   impact: how its hits look ("spark", "beam" = spark and ring, "arc" = a slash). shoot(c): draws one volley.
export const WEAPON = {
  Drone: { path: "M-5 -3 L0 -6 L5 -3 L5 3 L0 6 L-5 3 Z M-10 -1.5 L-5 -1.5 L-5 1.5 L-10 1.5 Z M5 -1.5 L10 -1.5 L10 1.5 L5 1.5 Z", trait: { rate: 1.3, dmg: .8, name: "Rapid", up: hi => ({ rate: [1.3, 1.4, 1.5][hi] }), text: o => "Fires " + pc(o.rate - 1) + "% faster at " + pc(o.dmg) + "% damage per volley" },
    wait: 120, speed: 900, muzzle: 6, flash: true, impact: "spark", shoot: c => bolts(c, 2) },
  Glaive: { path: "M0 -12 Q5 -4 0 0 Q-5 -4 0 -12 Z M0 12 Q-5 4 0 0 Q5 4 0 12 Z M-12 0 Q-4 -5 0 0 Q-4 5 -12 0 Z M12 0 Q4 5 0 0 Q4 -5 12 0 Z", trait: { rate: 1, dmg: .55, knock: 9, name: "Returning", up: hi => ({ dmg: [.55, .65, .75][hi] }), text: o => "Hits on the way out and again on the way back, " + pc(o.dmg) + "% each" },
    wait: 170, speed: 760, muzzle: 0, spin: true, again: 1.4, impact: "arc", shoot: c => {
      // the glaive itself flies out, spins on the target and comes back to its spot in orbit
      const g = svgEl("g", {}); g.style.color = c.glowC;
      svgEl("path", { d: WEAPON.Glaive.path, fill: c.col, class: "glow", transform: c.crit ? "scale(1.4)" : "" }, g);
      if (c.idx === undefined) hideFor(c.orbit, c.T * 2.4);
      launch(g, c.ox, c.oy, c.tgt, c.T, { glaive: c.slot, fast: c.crit, offy: c.off });
    } },
  Laser: { path: "M0 -10 L8 6 L-8 6 Z M0 -1 A2.5 2.5 0 1 1 0.01 -1 Z", trait: { rate: 1, dmg: .95, pierce: true, name: "Piercing", up: hi => ({ boost: [1, 1.15, 1.25][hi] }), text: o => "Ignores Shielded blocks and Armored damage reduction" + (o.boost > 1 ? ", +" + pc(o.boost - 1) + "% damage" : "") },
    fixed: 60, muzzle: 10, flash: true, impact: "beam", shoot: c => {
      const g = svgEl("g", {}); g.style.color = c.glowC;
      svgEl("line", { x1: c.ox, y1: c.oy, x2: c.tx, y2: c.ty, stroke: c.col, "stroke-width": c.crit ? 7 : 4.5, "stroke-linecap": "round", class: "glow", opacity: .85 }, g);
      svgEl("line", { x1: c.ox, y1: c.oy, x2: c.tx, y2: c.ty, stroke: "#fff", "stroke-width": c.crit ? 2.5 : 1.5, "stroke-linecap": "round" }, g);
      svgEl("circle", { cx: c.ox, cy: c.oy, r: c.crit ? 6 : 4, fill: "#fff" }, g);
      tempFx(g, [{ opacity: 1 }, { opacity: 1, offset: .5 }, { opacity: 0 }], 200);
    } },
  Swarm: { path: "M0 -10 L2.5 -6 L0 -2 L-2.5 -6 Z M-6 2 L-3.5 6 L-6 10 L-8.5 6 Z M6 2 L8.5 6 L6 10 L3.5 6 Z", trait: { rate: 1, dmg: 1, seeking: true, name: "Seeking", up: hi => ({ boost: [1, 1.15, 1.25][hi] }), text: o => "Can't be dodged by Umbrals and pops boss shard motes like a tap" + (o.boost > 1 ? ", +" + pc(o.boost - 1) + "% damage" : "") },
    wait: 190, speed: 700, muzzle: 10, flash: true, impact: "arc", shoot: c => {
      for (let i = 0; i < 3; i++) {
        const g = svgEl("g", {}); g.style.color = c.glowC;
        svgEl("polygon", { points: c.crit ? "0,-6 4,0 0,6 -4,0" : "0,-4.5 3,0 0,4.5 -3,0", fill: c.col, class: "glow" }, g);
        launch(g, c.ox, c.oy, c.tgt, c.T, { bulge: (i - 1) * 24, face: 90, offy: c.off + (i - 1) * 4, wait: i * 30 });
      }
    } },
  Hammer: { path: "M-9 -7 L9 -7 L9 3 L-9 3 Z M-2 3 L2 3 L2 11 L-2 11 Z", trait: { rate: .7, dmg: 1.6, knock: 20, name: "Crushing", up: hi => ({ stun: [.2, .3, .4][hi] }), text: o => "Slow, heavy hits with a " + pc(o.stun) + "% chance to briefly stun the target" },
    wait: 230, speed: 620, muzzle: 7, impact: "arc", shoot: c => {
      if (c.idx === undefined) hideFor(c.orbit, c.T + 110);
      const g = svgEl("g", {}); g.style.color = c.glowC;
      svgEl("path", { d: WEAPON.Hammer.path, fill: c.col, class: "glow", transform: "scale(" + (c.crit ? 1.9 : 1.5) + ")" }, g);
      launch(g, c.ox, c.oy, c.tgt, c.T, { spin: c.crit ? 720 : 540, offy: c.off, done: (x, y) => { ringIfRoom(x, y, c.col, .8, 3.2, 300, 4); shake(c.crit ? 5 : 2, 140); } });
    } },
  Coil: { path: "M-6 -10 L6 -10 L6 -7 L-6 -7 Z M-5 -4 L5 -4 L5 -1 L-5 -1 Z M-4 2 L4 2 L4 5 L-4 5 Z M-1.5 5 L1.5 5 L1.5 12 L-1.5 12 Z", trait: { rate: 1, dmg: .85, name: "Chaining", up: (hi, r) => ({ chain: COIL[r] }), text: o => pc(o.chain[0]) + "% chance to chain to " + o.chain[1] + " more " + (o.chain[1] > 1 ? "enemies" : "enemy") + " for 60% damage each" },
    fixed: 60, muzzle: 10, flash: true, impact: "spark", shoot: c => {
      const g = svgEl("g", {}); g.style.color = c.glowC;
      const d = zigzag(c.ox, c.oy, c.tx, c.ty, 7, 16);
      svgEl("path", { d, fill: "none", stroke: c.col, "stroke-width": c.crit ? 5 : 3.5, "stroke-linejoin": "round", class: "glow" }, g);
      svgEl("path", { d, fill: "none", stroke: "#fff", "stroke-width": 1.2, "stroke-linejoin": "round" }, g);
      const bx = c.ox + (c.tx - c.ox) * .55, by = c.oy + (c.ty - c.oy) * .55;
      svgEl("path", { d: zigzag(bx, by, bx + 14, by + 26, 3, 8), fill: "none", stroke: c.col, "stroke-width": 1.5 }, g);
      tempFx(g, [{ opacity: 1 }, { opacity: .3, offset: .3 }, { opacity: 1, offset: .5 }, { opacity: 0 }], 200);
    } },
  Mote: { path: "M0 -3.5 A3.5 3.5 0 1 1 0.01 -3.5 Z", bare: true, trait: { rate: 1, dmg: 1, name: "Mote" },
    wait: 120, speed: 850, muzzle: 3, flash: true, impact: "spark", shoot: c => bolts(c, 1) }
};
// Drone and Mote: straight bolts, Drone's two from either side of the orbital
function bolts(c, n) {
  const O = c.O, px = -O.uy, py = O.ux;
  for (let i = 0; i < n; i++) {
    const g = svgEl("g", {}); g.style.color = c.glowC;
    const sd = n === 2 ? (i ? 8 : -8) : 0, sx = n === 2 ? view.HERO_X + O.x + px * sd + O.ux * 2 : c.ox, sy = n === 2 ? view.HERO_Y + O.y + py * sd + O.uy * 2 : c.oy;
    svgEl("line", { x1: -7, y1: 0, x2: 7, y2: 0, stroke: c.col, "stroke-width": c.crit ? 4 : 3, "stroke-linecap": "round", class: "glow" }, g);
    launch(g, sx, sy, c.tgt, c.T, { face: 0, offx: px * sd * .4, offy: c.off + py * sd * .4, wait: i * 50 });
  }
}
// an orbital that throws itself is hidden from its slot while it's away
function hideFor(el, ms) { el.style.opacity = "0"; setTimeout(() => { el.style.opacity = ""; }, ms); }
// an orbital's trait at its rarity: Legendary and Mythic strengthen it (hi 1 and 2); boost multiplies its damage
function traitOf(it) {
  const t = it ? weaponType(it) : "Mote", b = WEAPON[t].trait, r = it ? it.r : 0, hi = r >= 5 ? 2 : r >= 4 ? 1 : 0;
  const o = Object.assign({ name: b.name, rate: b.rate, dmg: b.dmg, boost: 1, stun: 0, chain: null, pierce: !!b.pierce, seeking: !!b.seeking, knock: b.knock || 12 }, b.up ? b.up(hi, r) : {});
  o.dmg *= o.boost;
  return o;
}
export const wTr = slot => traitOf(S.equip[slot]);
export const traitText = it => WEAPON[weaponType(it)].trait.text(traitOf(it));
let attackCount = 0;
export const enemyCY = () => view.ENEMY_Y + (enemy ? enemy.cy : -40);
// an orbital item's weapon type (old names it doesn't know fall back to Glaive)
export const weaponType = it => { const n = noun(it); return WEAPON[n] && !WEAPON[n].bare ? n : "Glaive"; };
export const wType = (slot = "weapon") => S.equip[slot] ? weaponType(S.equip[slot]) : "Mote";
// flight time from the orbital's muzzle to the target; the hit lands exactly when the shot arrives
export function wDelay(slot = "weapon") {
  const W = WEAPON[wType(slot)];
  if (W.fixed) return W.fixed;
  if (!enemy) return W.wait;
  const [ox, oy] = orbitPos(slot), d = Math.max(0, Math.hypot(enemy.px - ox, enemy.py - oy) - enemy.R * .35);
  return Math.round(Math.max(70, Math.min(800, d / W.speed * 1000)));
}
// projectiles are moved every frame toward where their target is now, so they always connect
const shots = [];
function launch(el, x0, y0, tgt, ms, o) {
  o = o || {}; fx.appendChild(el);
  shots.push({ el, x0, y0, tgt, t0: performance.now() + (o.wait || 0), ms, o, lx: tgt.px, ly: tgt.py });
  if (o.wait) el.style.visibility = "hidden";
}
function shotEnd(sh) {
  const t = sh.tgt, pull = sh.o.pull != null ? sh.o.pull : t.R * .35;
  const dx = sh.lx - sh.x0, dy = sh.ly - sh.y0, L = Math.hypot(dx, dy) || 1;
  return [sh.lx - dx / L * pull + (sh.o.offx || 0), sh.ly - dy / L * pull + (sh.o.offy || 0)];
}
export function stepShots(now) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const sh = shots[i], o = sh.o;
    if (now < sh.t0) continue;
    sh.el.style.visibility = "";
    if (sh.tgt && !sh.tgt.removed) { sh.lx = sh.tgt.px; sh.ly = sh.tgt.py; }
    const el = (now - sh.t0) / sh.ms;
    let x, y, rot = 0, done = false;
    const [ex, ey] = shotEnd(sh);
    if (o.glaive) {
      // out to the target, a quick spin on it, then back to its spot in orbit
      const O = ORBIT[o.glaive].pose, bx = view.HERO_X + O.x, by = view.HERO_Y + O.y;
      if (el < 1) { const u = 1 - (1 - el) * (1 - el); x = sh.x0 + (ex - sh.x0) * u; y = sh.y0 + (ey - sh.y0) * u; }
      else if (el < 1.4) { x = ex; y = ey; }
      else { const u = Math.min(1, (el - 1.4) / 1), uu = u * u; x = ex + (bx - ex) * uu; y = ey + (by - ey) * uu; done = u >= 1; }
      rot = (now - sh.t0) * (o.fast ? 1.6 : 1.1);
    } else {
      const u = Math.min(1, el), dx = ex - sh.x0, dy = ey - sh.y0, L = Math.hypot(dx, dy) || 1, bulge = (o.bulge || 0) * Math.sin(Math.PI * u);
      x = sh.x0 + dx * u - dy / L * bulge; y = sh.y0 + dy * u + dx / L * bulge;
      const c = (o.bulge || 0) * Math.PI * Math.cos(Math.PI * u), vx = dx - dy / L * c, vy = dy + dx / L * c;
      rot = o.face != null ? Math.atan2(vy, vx) * 57.2958 + o.face : (o.spin || 0) * u;
      done = u >= 1;
    }
    sh.el.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + rot.toFixed(0) + ")");
    if (done) { sh.el.remove(); shots.splice(i, 1); if (o.done) o.done(x, y); }
  }
}
// The three orbital slots. The main one always fires (a bare Glaive when empty); the others fire when open and filled.
// share: damage relative to the main orbital. pose: where it sits around the core right now. cd: time to its next volley.
export const ORBITALS = [
  { key: "weapon", label: "Main orbital", nth: "main", share: () => 1, open: () => true, ids: ["hBladeOrbit", "hWpn1", "hWeapon"], cd0: .5, pose: { a: -1.57, r: 31, x: 0, y: -31, ux: 0, uy: -1, sp: 0 } },
  { key: "weapon2", label: "Second orbital", nth: "second", share: () => SLOT2_DMG, open: () => S.peak >= SLOT2_AT, lockTile: "Stage " + SLOT2_AT, lockRow: "Unlocks at stage " + SLOT2_AT, lockNote: () => "Unlocks permanently when you first reach stage " + SLOT2_AT + ".", ids: ["hBladeOrbit2", "hWpn2", "hWeapon2"], cd0: .9, pose: { a: 1.57, r: 37, x: 0, y: 37, ux: 0, uy: 1, sp: 0 } },
  { key: "weapon3", label: "Third orbital", nth: "third", share: () => ST.orbit3, open: () => ST.orbit3 > 0, lockTile: "Locked", lockNote: () => transOpen() ? "Open it with Third Orbital in the Star Forge (Transcend tab)." : "Unlocks after your first Transcend, through the Star Forge.", ids: ["hBladeOrbit3", "hWpn3", "hWeapon3"], cd0: .7, pose: { a: 3.14, r: 43, x: -43, y: 0, ux: -1, uy: 0, sp: 0 } }
];
ORBITALS.forEach((o, i) => { o.i = i; o.cd = o.cd0; o.has = () => o.open() && !!S.equip[o.key]; o.active = () => i === 0 || o.has(); });
export const ORBIT = Object.fromEntries(ORBITALS.map(o => [o.key, o]));
export const openOrbitals = () => ORBITALS.filter(o => o.open());
// the slot an item of this gear type goes in, and what the slot is called
export const baseSlot = k => ORBIT[k] ? "weapon" : k;
export const slotLabel = k => ORBIT[k] ? ORBIT[k].label : SLOT[k].name;
export const slotOpen = k => !ORBIT[k] || ORBIT[k].open();
export function slotAtk(slot) {
  if (slot !== "weapon2" && slot !== "weapon3") return ST.atk;
  const p1 = S.equip.weapon ? S.equip.weapon.power : 0, p2 = S.equip[slot] ? S.equip[slot].power : 0;
  return ST.atk * (5 + p2) / (5 + p1) * ORBIT[slot].share() * ST.orbDmg;
}
// orbitals glide around the core toward the target's side and keep their muzzles pointed at it
let orbT = 0;
export function poseOrbitals(dt) {
  const t = enemy && !enemy.dead ? enemy : null, od = hero.odT > 0;
  const act = ORBITALS.map(o => o.active()), n = act.filter(Boolean).length;
  if (!reduce) orbT += dt * (od ? 2.4 : 1);
  let k = -1;
  for (let i = 0; i < 3; i++) {
    if (!act[i]) continue;
    k++;
    const o = ORBITALS[i].pose, W = WEAPON[wType(ORBITALS[i].key)];
    const spread = n === 1 ? 0 : n === 2 ? (k ? .55 : -.55) : [-.8, 0, .8][k];
    if (t) {
      const goal = Math.atan2(t.py - view.HERO_Y, t.px - view.HERO_X) + spread + (reduce ? 0 : Math.sin(orbT * [1.2, .9, 1.05][i] + i * 2.1) * (n > 1 ? .3 : .55));
      let d = goal - o.a; d = Math.atan2(Math.sin(d), Math.cos(d));
      o.a += reduce ? d : Math.max(-7 * dt, Math.min(7 * dt, d * (1 - Math.exp(-dt * 5))));
    } else if (!reduce) o.a += [.9, -.7, .6][i] * dt * (od ? 2.5 : 1);
    o.x = Math.cos(o.a) * o.r; o.y = Math.sin(o.a) * o.r;
    const aim = t ? Math.atan2(t.py - (view.HERO_Y + o.y), t.px - (view.HERO_X + o.x)) : o.a;
    o.ux = Math.cos(aim); o.uy = Math.sin(aim);
    let rot = aim * 57.2958 + 90;
    if (W.spin) { if (!reduce) o.sp = (o.sp + dt * (od ? 900 : 420)) % 360; rot = o.sp; }
    $(ORBITALS[i].ids[1]).setAttribute("transform", "translate(" + o.x.toFixed(1) + " " + o.y.toFixed(1) + ") rotate(" + rot.toFixed(1) + ")");
  }
}
function orbitPos(slot = "weapon") {
  const o = ORBIT[slot].pose, L = WEAPON[wType(slot)].muzzle;
  return [view.HERO_X + o.x + o.ux * L, view.HERO_Y + o.y + o.uy * L];
}
export function throwBlade(crit, idx, slot = "weapon") {
  if (slot === "weapon" && idx === undefined) sfx(wType(slot), 0, 200);
  anim($("hCore"), [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], 200);
  if (reduce || !enemy) return;
  const tgt = enemy, T = wDelay(slot);
  const w = S.equip[slot], W = WEAPON[wType(slot)], col = w ? ARENA_C[w.r] : "#effffc", glowC = w ? col : "#7be0d0";
  const off = idx ? ((idx % 3) - 1) * 14 : 0, [ox, oy] = orbitPos(slot);
  let tx = tgt.px, ty = tgt.py + off;
  { const dd = Math.hypot(tx - ox, ty - oy) || 1, pull = tgt.R * .35; tx -= (tx - ox) / dd * pull; ty -= (ty - oy) / dd * pull; }
  if (W.flash) {
    anim($(ORBIT[slot].ids[2]), [{ transform: "translate(0px,0px)" }, { transform: "translate(0px,3.5px)", offset: .25 }, { transform: "translate(0px,0px)" }], 160);
    tempFx(svgEl("circle", { cx: ox, cy: oy, r: crit ? 5 : 3.5, fill: "#fff" }), [{ opacity: .95 }, { opacity: 0 }], 120);
  }
  W.shoot({ crit, idx, slot, tgt, T, col, glowC, ox, oy, tx, ty, off, O: ORBIT[slot].pose, orbit: $(ORBIT[slot].ids[0]) });
}
export function fireOrbital(slot) {
  const W = WEAPON[wType(slot)], tr = wTr(slot), base = slotAtk(slot) * tr.dmg;
  const T = wDelay(slot);
  throwBlade(false, undefined, slot);
  hit(base, T, "blade", slot);
  if (W.again) hit(base, Math.round(T * W.again), "blade", slot);
  if (tr.chain && Math.random() < tr.chain[0]) setTimeout(() => chainZap(enemy, tr.chain[1], slotAtk(slot) * .6, slot), T + 20);
  emit("fire", { slot, delay: T });
}
function nearFoes(x, y, n, skip, maxD) {
  return foes.filter(f => !f.dead && !skip.has(f) && Math.hypot(f.px - x, f.py - y) < (maxD || 1e9)).sort((a, b) => Math.hypot(a.px - x, a.py - y) - Math.hypot(b.px - x, b.py - y)).slice(0, n);
}
// Coil: lightning jumps from the target to other enemies, one after another
function chainZap(from, n, dmg, slot) {
  if (!from || heroDown) return;
  const hitSet = new Set([from]); let cur = from;
  for (let i = 0; i < n; i++) {
    const nx = nearFoes(cur.px, cur.py, 1, hitSet, 260)[0];
    if (!nx) break;
    hitSet.add(nx);
    const a = cur, b = nx;
    setTimeout(() => {
      if (heroDown || b.dead) return;
      if (!reduce && !fxBusy()) tempFx(svgEl("path", { d: zigzag(a.px, a.py, b.px, b.py, 6, 10), fill: "none", stroke: "#9fe8ff", "stroke-width": 2, class: "glow" }), [{ opacity: 1 }, { opacity: 0 }], 180);
      land(b, dmg, "blade", slot);
    }, i * 70);
    cur = nx;
  }
}
export function splitShot(from, dmg, slot) {
  if (!from || heroDown) return;
  const tg = nearFoes(from.px, from.py, 2, new Set([from]), 300);
  while (tg.length < 2 && !from.dead) tg.push(from);
  tg.forEach((f, i) => {
    if (!reduce && !fxBusy()) { const g = svgEl("circle", { r: 2.6, fill: "#fff" }); moveFx(g, from.px, from.py, f.px, f.py, 140, null, 0, "linear"); }
    setTimeout(() => { if (!f.dead && !heroDown) land(f, dmg, "blade", slot); }, 140 + i * 20);
  });
}
export const orbRate = slot => wTr(slot).rate * ST.orbRate;
export function heroAttack() {
  attackCount++;
  fireOrbital("weapon");
  emit("attack", { count: attackCount });
}
