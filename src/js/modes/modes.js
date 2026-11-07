// Run modes: the main run and the Abyss share combat; the current mode owns stage, spawns, kills and deaths.
import { sfx } from "../audio/sound.js";
import { bump } from "../bounty/bounty.js";
import { S, save } from "../core/save.js";
import { ST } from "../core/stats.js";
import { rnd } from "../core/util.js";
import { makeEnemy } from "../enemies/enemies.js";
import { clearFoes, foes, pickSpawnAngle, spawnFoe } from "../enemies/foes.js";
import { fillOrbital } from "../gear/inventory.js";
import { recalc } from "../hero/hero.js";
import { ORBIT, SLOT2_AT } from "../hero/orbitals.js";
import { TRANS_AT } from "../progress/transcend.js";
import { SKILLS, buildSkillbar } from "../skills/skills.js";
import { TRAIN } from "../train/train.js";
import { markDirty } from "../ui/actions.js";
import { updateUI } from "../ui/hud.js";
import { log } from "../ui/log.js";
import { setZone } from "../world/scene.js";

// Momentum: stages below this cap fly by
const momentumCap = () => (S.transcends || 0) >= 1 ? Math.floor((S.peak || 1) * ST.momentumAt) : 0;
export const momentum = () => mode === MAIN && S.stage < momentumCap();

export const spawn = {
  stageSpawned: 0,
  spawnT: .3
};
// Combat runs inside a mode: the main run (stages you push or farm, with Momentum after a Transcend) or the Abyss.
// The mode says what stage the fight is at and owns spawning, kills, deaths, boss escapes and the stage readout.
// S.stage is only ever the main run's stage.
export const MAIN = {
  stage: () => S.stage,
  zone: () => Math.floor((S.stage - 1) / 10),
  mythic: st => (S.transcends || 0) >= 1 && st >= TRANS_AT,
  lumen: () => momentum() ? 8 / 3 : 1,
  auto: true,
  enter() { spawn.stageSpawned = S.kills; spawn.spawnT = .6; },
  leave() {},
  step() {},
  stepSpawns(dt) {
    const need = killsNeeded();
    if (spawn.stageSpawned >= need) return;
    const st = S.stage, boss = st % 10 === 0;
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
      spawnFoe(makeEnemy(st, elite), base + (i - (n - 1) / 2) * .32, i * 22); spawn.stageSpawned++;
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
      const before = S.maxStage; S.maxStage = S.stage; markDirty("tree");
      SKILLS.forEach(sk => { if (before < sk.unlock && S.maxStage >= sk.unlock) { log("Skill unlocked: " + sk.name, "r4"); sfx("chord", 0, 300); buildSkillbar(); markDirty("skills"); } });
      TRAIN.forEach(t => { if (before < t.unlock && S.maxStage >= t.unlock) { log("Training unlocked: " + t.name, "r3"); markDirty("train"); } });
    }
    if (S.stage > S.peak) {
      if (S.peak < SLOT2_AT && S.stage >= SLOT2_AT) {
        log("Second orbital slot unlocked", "r4");
        const best = S.autoEquip && fillOrbital(ORBIT.weapon2);
        if (best) log("Equipped " + best.name + " as your second orbital", "r" + best.r);
        S.peak = S.stage; recalc(); markDirty("gear", "pack");
      }
      S.peak = S.stage;
    }
  },
  death() {
    log(S.stage > 1 ? "Your core collapsed. Back to stage " + (S.stage - 1) + ", now farming" : "Your core collapsed. Trying again", "bad");
    S.push = S.stage <= 1 ? S.push : false; S.stage = Math.max(1, S.stage - 1); S.kills = 0;
  },
  escape() {
    log("The boss escaped. Back to stage " + Math.max(1, S.stage - 1) + ", now farming", "bad");
    S.push = S.stage <= 1 ? S.push : false; S.stage = Math.max(1, S.stage - 1); S.kills = 0;
    clearFoes(true); spawn.spawnT = 1;
  },
  hud() {
    const need = killsNeeded();
    return {
      title: "Stage " + S.stage, button: S.push ? "Pushing" : "Farming", prog: S.kills / need,
      sub: (momentum() ? "Momentum: " : "") + (S.stage % 10 === 0 ? "Boss fight" : S.kills + "/" + need + " kills" + (foes.some(f => f.elite && !f.dead) ? ", elite here" : "")) + ", best " + S.maxStage
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
  save(); updateUI();
}

const killsNeeded = () => (S.stage % 10 === 0 ? 1 : momentum() ? 3 : 8);
