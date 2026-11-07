// Statuses enemies put on the hero (Dim, Fracture, Static, Gravity, Eclipse).
import { sfx } from "../audio/sound.js";
import { heroDown } from "../combat/combat.js";
import { ST, effectSource, emit } from "../core/stats.js";
import { sparks, statusHitFx, tempFx } from "../fx/effects.js";
import { hero } from "./hero.js";
import { floatText } from "../ui/floats.js";
import { $, svgEl } from "../core/util.js";
import { view } from "../world/scene.js";
import { anim } from "../fx/gfx.js";

export const STATUS = {
  dim: { name: "Dim", col: "#c9c4dc", desc: "Your light fades: healing reduced by 60%", fx: { heal: c => { c.v *= .4; } },
    vfx() {
      if (Math.random() >= .75) return;
      const x = view.HERO_X + Math.random() * 22 - 11, y = view.HERO_Y + Math.random() * 10 - 5;
      tempFx(svgEl("circle", { cx: x, cy: y, r: 1.5 + Math.random() * 1.5, fill: "#c9c4dc" }), [{ transform: "translate(0px,0px)", opacity: .9 }, { transform: "translate(" + (Math.random() * 16 - 8).toFixed(1) + "px," + (-28 - Math.random() * 18).toFixed(1) + "px)", opacity: 0 }], 900);
    }
  },
  fracture: { name: "Fracture", col: "#ff8463", desc: "Cracked shell: no block and 20% more damage taken", fx: { incoming: c => { c.block = 0; }, taken: c => { c.d *= 1.2; } },
    vfx() {
      if (Math.random() >= .3) return;
      const a = Math.random() * Math.PI * 2, x = view.HERO_X + Math.cos(a) * 18, y = view.HERO_Y + Math.sin(a) * 18;
      const g = svgEl("g", { transform: "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")" });
      const tri = svgEl("polygon", { points: "0,-3 3,2 -3,2", fill: "#ff8463" }, g);
      tempFx(g, [{ opacity: 1 }, { opacity: 0 }], 750);
      anim(tri, [{ transform: "translate(0px,0px) rotate(0deg)" }, { transform: "translate(" + (Math.cos(a) * 10).toFixed(1) + "px,36px) rotate(" + (Math.random() * 300 - 150).toFixed(0) + "deg)" }], { duration: 750, easing: "ease-in", fill: "forwards" });
    }
  },
  static: { name: "Static", col: "#4fd3e4", desc: "Interference: half mana regen and skills cost 25% more", fx: { manaRegen: c => { c.v *= .5; }, skillCost: c => { c.v *= 1.25; } },
    vfx() {
      staticArcs();
      if (Math.random() < .35) sparks(view.HERO_X + Math.random() * 30 - 15, view.HERO_Y + Math.random() * 30 - 15, 2, "#4fd3e4", 14);
    }
  },
  gravity: { name: "Gravity", col: "#b48cff", desc: "Weighed down: 30% slower attacks and no evasion", fx: { attackSpeed: c => { c.v *= .7; }, incoming: c => { c.evade = 0; } },
    vfx() {
      if (Math.random() >= .7) return;
      const x = view.HERO_X + Math.random() * 44 - 22;
      tempFx(svgEl("line", { x1: x, y1: view.HERO_Y - 34, x2: x, y2: view.HERO_Y - 24, stroke: "#b48cff", "stroke-width": 2, "stroke-linecap": "round" }), [{ transform: "translate(0px,0px)", opacity: 0 }, { transform: "translate(0px,30px)", opacity: .9, offset: .5 }, { transform: "translate(0px,62px)", opacity: 0 }], 520);
    }
  },
  eclipse: { name: "Eclipse", col: "#ffd04d", desc: "Your light is covered: half crit chance", fx: { critChance: c => { c.v *= .5; } },
    vfx() {
      if (Math.random() >= .35) return;
      const a = Math.random() * Math.PI * 2;
      tempFx(svgEl("line", { x1: view.HERO_X + Math.cos(a) * 13, y1: view.HERO_Y + Math.sin(a) * 13, x2: view.HERO_X + Math.cos(a) * 22, y2: view.HERO_Y + Math.sin(a) * 22, stroke: "#ffd04d", "stroke-width": 1.5, "stroke-linecap": "round" }), [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], 500);
    }
  }
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
function staticArcs() {
  const g = $("hStatic"); g.innerHTML = "";
  for (let k = 0; k < 3; k++) {
    let a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 4, d = "";
    for (let i = 0; i < 5; i++) {
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      d += (i ? " L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      a += .25 + Math.random() * .2; r += Math.random() * 6 - 1;
    }
    svgEl("path", { d }, g);
  }
}
