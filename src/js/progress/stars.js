// Stars: permanent perks that awaken at Stardust milestones. You choose which one each time.
import { sfx } from "../audio/sound.js";
import { alive, land } from "../combat/combat.js";
import { S } from "../core/save.js";
import { ST, plus, statSource } from "../core/stats.js";
import { starPts, svgEl } from "../core/util.js";
import { enemy, foes, inView } from "../enemies/foes.js";
import { ring, shake, tempFx } from "../fx/effects.js";
import { reduce } from "../fx/gfx.js";
import { hero } from "../hero/hero.js";
import { action, confirmTap } from "../ui/actions.js";
import { floatText } from "../ui/floats.js";
import { log } from "../ui/log.js";
import { view } from "../world/scene.js";

const STAR_COL = "#ffe7a3";
// total Stardust earned at which each star awakens (the first comes with your first Transcend)
const STAR_AT = [1, 60, 130, 220, 330, 460, 620, 800, 1000];
const PULSE_EVERY = 4, COMET_EVERY = 20, COMET_R = 110, HORIZON_R = 130, STARFALL_EVERY = 12;
// a comet lands on the current target and hits everything near it
function cometStrike() {
  if (!alive()) return;
  const x = enemy.px, y = enemy.py;
  if (!reduce) tempFx(svgEl("line", { x1: x + 80, y1: y - 230, x2: x, y2: y, stroke: STAR_COL, "stroke-width": 5, "stroke-linecap": "round" }), [{ opacity: 0 }, { opacity: 1, offset: .6 }, { opacity: 0 }], 260);
  ring(x, y, STAR_COL, .5, COMET_R / 10, 380, 4); shake(5, 220);
  foes.forEach(f => { if (!f.dead && Math.hypot(f.px - x, f.py - y) < COMET_R + f.R) land(f, ST.atk * 10, "aoe"); });
}
// a star shard drops onto one enemy
function shardStrike(f) {
  if (f.dead) return;
  if (!reduce) tempFx(svgEl("polygon", { points: starPts(4, 9, 3.5), fill: STAR_COL }), [{ transform: "translate(" + f.px.toFixed(1) + "px," + (f.py - 150).toFixed(1) + "px)", opacity: 0 }, { transform: "translate(" + f.px.toFixed(1) + "px," + f.py.toFixed(1) + "px)", opacity: 1 }], 160);
  land(f, ST.atk * 3, "aoe");
}
const STARS = [
  { id: "afterglow", name: "Afterglow", desc: "Transcending keeps 50% of your echo power instead of 25%", stats: () => ({ echoKeep: plus(.25) }) },
  { id: "pulsar", name: "Pulsar", desc: "Every " + PULSE_EVERY + " seconds in a fight your core pulses, hitting every enemy in view for 200% attack", fx: {
    t: 0,
    tick(c) {
      if (!alive()) return;
      this.t += c.dt;
      if (this.t < PULSE_EVERY) return;
      this.t = 0; ring(view.HERO_X, view.HERO_Y, STAR_COL, 1, 24, 480, 3);
      foes.forEach(f => { if (!f.dead && inView(f)) land(f, ST.atk * 2, "aoe"); });
    }
  } },
  { id: "comet", name: "Comet", desc: "Every " + COMET_EVERY + "th kill calls a comet down on your target: 1000% attack to it and everything near it", fx: { n: 0, kill() { if (++this.n % COMET_EVERY === 0) setTimeout(cometStrike, 250); } } },
  { id: "quasar", name: "Quasar", desc: "Casting a skill charges your next 4 orbital hits: they always crit and deal 50% more", fx: {
    order: -1, n: 0,
    cast() { this.n = 4; },
    crit(h) { if (h.kind === "blade" && this.n > 0) { this.n--; h.crit = true; h.charged = true; } },
    deal(h) { if (h.charged) h.dmg *= 1.5; }
  } },
  { id: "aurora", name: "Aurora", desc: "When a hit leaves you under 35% health, a shield worth 40% of your health forms for 6 seconds (once every 30 seconds)", fx: {
    t: 0,
    hurt() {
      const pn = performance.now(), amt = ST.maxHp * .4;
      if (pn <= this.t || hero.hp <= 0 || hero.hp >= ST.maxHp * .35 || hero.shield >= amt) return;
      this.t = pn + 30000; hero.shield = hero.shieldMax = amt; hero.shieldT = Math.max(hero.shieldT, 6);
      floatText("Aurora", "info", "hero", STAR_COL); ring(view.HERO_X, view.HERO_Y, STAR_COL, 1, 4, 320, 3);
    }
  } },
  { id: "horizon", name: "Event Horizon", desc: "Enemies close to your core take 40% more damage, so moving in on them pays", fx: { deal(h) { if (Math.hypot(h.e.px - view.HERO_X, h.e.py - view.HERO_Y) < HORIZON_R + h.e.R) h.dmg *= 1.4; } } },
  { id: "starfall", name: "Starfall", desc: "Every " + STARFALL_EVERY + "th tap rains star shards on up to 5 enemies in view for 300% attack each", fx: {
    tap(c) {
      if (c.count % STARFALL_EVERY) return;
      foes.filter(f => !f.dead && inView(f)).slice(0, 5).forEach((f, i) => setTimeout(() => shardStrike(f), 60 * i));
    }
  } },
  { id: "slip", name: "Slipstream", desc: "Momentum carries 15% further up the stages before the real climb starts", stats: () => ({ momentumAt: plus(.15) }) },
  { id: "lode", name: "Lodestar", desc: "Wisps fly to your core on their own, and their timed boons last twice as long", stats: () => ({ wispPull: plus(1), boonTime: 2 }) }
];
const STAR = {};
statSource(give => STARS.forEach(s => { if (S.stars[s.id]) give(s, 1); }));
 STARS.forEach(s => STAR[s.id] = s);
const starsOwned = () => STARS.filter(s => S.stars[s.id]).length;
const starsDue = () => Math.min(STARS.length, STAR_AT.filter(t => (S.stardustTotal || 0) >= t).length);
// stars you may choose right now
export const starPoints = () => Math.max(0, starsDue() - starsOwned());
// the Stars section of the Transcend tab
export function renderStars() {
  const pts = starPoints(), next = STAR_AT[starsDue()];
  let h = '<h4 class="forgeH">Stars</h4><p class="note" style="margin-top:0">' + (pts ? '<b class="dustC">' + pts + " star" + (pts > 1 ? "s" : "") + " to choose.</b> " : "") +
    "Stars are permanent and cost nothing. " + (!(S.stardustTotal > 0) ? "Your first Transcend awakens one, and more follow as your total Stardust grows. You choose which."
      : next ? "The next one awakens at " + next + " Stardust earned in total (you have " + Math.floor(S.stardustTotal) + "). You choose which." : "Every star has awakened.") + "</p>";
  STARS.forEach(s => {
    const has = !!S.stars[s.id];
    h += '<div class="row forge"><span class="n">' + s.name + (has ? " ✓" : "") + '</span><span class="d"' + (has || pts ? "" : ' style="opacity:.6"') + ">" + s.desc + "</span>" +
      (has ? "" : '<div class="side"><button class="btn dustb' + (pts ? " afford" : "") + '" data-act="star" data-id="' + s.id + '"' + (pts ? "" : " disabled") + ">Choose</button></div>") + "</div>";
  });
  return h;
}
action("star", (id, b) => {
  const s = STAR[id];
  if (!s || S.stars[id] || !starPoints()) return false;
  if (!confirmTap(b, "Tap again to keep")) return false;
  S.stars[id] = 1; sfx("chord", 0, 0);
  log("Star chosen: " + s.name, "r4");
});
