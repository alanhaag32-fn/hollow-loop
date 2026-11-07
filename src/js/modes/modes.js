// Run modes: the main run and the Abyss share combat; the current mode owns stage, spawns, kills and deaths.
import { bump } from "../bounty/bounty.js";
import { S } from "../core/save.js";
import { ST } from "../core/stats.js";
import { rnd } from "../core/util.js";
import { makeEnemy } from "../enemies/enemies.js";
import { clearFoes, foes, pickSpawnAngle, spawnFoe } from "../enemies/foes.js";
import { recalc } from "../hero/hero.js";
import { action, markDirty } from "../ui/actions.js";
import { log } from "../ui/log.js";
import { setZone } from "../world/scene.js";
import { TRANS_AT } from "../progress/transcend.js";
import { isBoss, zoneOf } from "../core/curves.js";

// Momentum: stages below this cap fly by
const momentumCap = () => (S.transcends || 0) >= 1 ? Math.floor((S.peak || 1) * ST.momentumAt) : 0;
const momentum = () => mode === MAIN && S.stage < momentumCap();

export const spawn = {
  stageSpawned: 0,
  spawnT: .3
};
// Combat runs inside a mode: the main run (stages you push or farm, with Momentum after a Transcend) or the Abyss.
// The mode says what stage the fight is at and owns spawning, kills, deaths, boss escapes and the stage readout.
// S.stage is only ever the main run's stage.
// things that open at a stage announce themselves: fn(before, now, "best" for this run's best stage | "peak" for the best ever)
const NEW_BEST = [];
export const whenNewBest = fn => NEW_BEST.push(fn);
export const MAIN = {
  stage: () => S.stage,
  look() {
    const zone = zoneOf(S.stage), hue = (zone * 53 + 200) % 360, sides = 3 + zone % 6;
    return {
      key: zone, hue, sky: "radial-gradient(ellipse at 50% 50%, hsl(" + hue + " 40% 16%), hsl(" + hue + " 35% 6%) 75%)",
      shape: (i, rot) => Array.from({ length: sides }, (_, k) => [Math.cos(rot + k * 6.2832 / sides), Math.sin(rot + k * 6.2832 / sides)])
    };
  },
  mythic: st => (S.transcends || 0) >= 1 && st >= TRANS_AT,
  // Momentum stages need fewer kills, so each kill pays more to keep lumen per stage the same
  lumen: () => momentum() ? KILLS / MOMENTUM_KILLS : 1,
  auto: true,
  enter() { spawn.stageSpawned = S.kills; spawn.spawnT = .6; },
  leave() {},
  step() {},
  stepSpawns(dt) {
    const need = killsNeeded();
    if (spawn.stageSpawned >= need) return;
    const st = S.stage, boss = isBoss(st);
    const live = foes.filter(f => !f.dead).length, cap = boss ? 1 : st < 10 ? 3 : st < 25 ? 4 : st < 50 ? 5 : 6;
    spawn.spawnT -= dt;
    if (spawn.spawnT > 0 || live >= cap) return;
    const packMax = boss ? 1 : st < 3 ? 1 : st < 8 ? 2 : 3;
    let n = Math.min(1 + rnd(packMax), cap - live, need - spawn.stageSpawned);
    // the elite always arrives on its own, as the last spawn of the stage
    if (st > 10 && !boss && spawn.stageSpawned + n >= need && n > 1) n = Math.max(1, need - 1 - spawn.stageSpawned);
    const base = pickSpawnAngle();
    for (let i = 0; i < n; i++) {
      const elite = st > 10 && !boss && spawn.stageSpawned === need - 1;
      spawnFoe(makeEnemy(st, elite, momentum() ? { hp: .02, dmg: .25 } : undefined), base + (i - (n - 1) / 2) * .32, i * 22); spawn.stageSpawned++;
    }
    spawn.spawnT = (.9 + Math.random() * .8) * (momentum() ? .35 : 1);
  },
  kill(e, c) {
    if (c.split) return;
    S.kills++;
    if (S.kills < killsNeeded()) return;
    S.kills = 0; spawn.stageSpawned = 0; spawn.spawnT = .5;
    if (!S.push) return;
    S.stage++; bump("stage", 1);
    if (S.stage > S.maxStage) {
      const before = S.maxStage; S.maxStage = S.stage; S.cyclePeak = Math.max(S.cyclePeak || 1, S.maxStage); markDirty("tree");
      NEW_BEST.forEach(fn => fn(before, S.maxStage, "best"));
    }
    if (S.stage > S.peak) { const before = S.peak; S.peak = S.stage; NEW_BEST.forEach(fn => fn(before, S.peak, "peak")); }
  },
  death() {
    log(S.stage > 1 ? "Your core collapsed. Back to stage " + (S.stage - 1) + ", now farming" : "Your core collapsed. Trying again", "bad");
    S.push = S.stage <= 1 ? S.push : false; S.stage = Math.max(1, S.stage - 1); S.kills = 0; spawn.stageSpawned = 0;
  },
  escape() {
    log("The boss escaped. Back to stage " + Math.max(1, S.stage - 1) + ", now farming", "bad");
    S.push = S.stage <= 1 ? S.push : false; S.stage = Math.max(1, S.stage - 1); S.kills = 0;
    clearFoes(true); spawn.spawnT = 1; spawn.stageSpawned = 0;
  },
  hud() {
    const need = killsNeeded();
    return {
      title: "Stage " + S.stage, button: S.push ? "Pushing" : "Farming", prog: S.kills / need,
      sub: (momentum() ? "Momentum: " : "") + (isBoss(S.stage) ? "Boss fight" : S.kills + "/" + need + " kills" + (foes.some(f => f.elite && !f.dead) ? ", elite here" : "")) + ", best " + S.maxStage
    };
  },
  button() { S.push = !S.push; }
};
export let mode = MAIN;
export const fightStage = () => mode.stage();
// a reset (ascend, transcend) always lands in the main run, without the "you left" fanfare
export function returnToMain() { if (mode !== MAIN) { mode.leave(); mode = MAIN; } }
// pick the main run up where the save left it
export function resumeRun() { spawn.stageSpawned = S.kills; }
export function switchMode(m) {
  mode.leave(); mode = m;
  clearFoes(false); m.enter(); setZone(true); recalc();
}

const KILLS = 8, MOMENTUM_KILLS = 3;
const killsNeeded = () => (isBoss(S.stage) ? 1 : momentum() ? MOMENTUM_KILLS : KILLS);

// the button beside the stage title: push/farm in the main run, leave in the Abyss
action("modeButton", () => mode.button());
