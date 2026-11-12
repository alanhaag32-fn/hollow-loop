// Behaviour tests: each one fails when a player-visible rule breaks.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, stop, open, game, baseSave, KEY } from "./helpers.mjs";

// press a button in a window tab, the way a player would (twice for tap-twice buttons)
const press = (page, win, sub, act, times = 1) => page.evaluate(([win, sub, act, times]) => {
  document.getElementById("menuBtn").click(); document.querySelector('#menuDrop [data-win="' + win + '"]').click();
  if (sub) document.querySelector('#winTabs [data-sub="' + sub + '"]').click();
  for (let i = 0; i < times; i++) document.querySelector('#sheetBody [data-act="' + act + '"]').click();
}, [win, sub, act, times]);

before(start);
after(stop);

test("a new game boots, fights and earns lumen", async () => {
  const page = await open(baseSave());
  for (let i = 0; i < 25; i++) { await page.mouse.click(195, 380); await page.waitForTimeout(200); }
  const s = await game(page, ["core/save.js"], m => ({ kills: m.save.S.totalKills, gold: m.save.S.gold, index: Object.keys(m.save.S.bestiary).length }));
  assert.ok(s.kills > 0 && s.gold > 0 && s.index > 0, JSON.stringify(s));
  assert.deepEqual(page.errors, []);
});

test("a web node's bonus reaches the stat sheet", async () => {
  const page = await open(baseSave());
  const r = await game(page, ["core/save.js", "core/stats.js", "hero/hero.js"], m => {
    const a = m.stats.ST.atk; m.save.S.tree = { e1: 2 }; m.hero.recalc(); return m.stats.ST.atk / a;
  });
  assert.ok(Math.abs(r - 1.21) < 1e-9, String(r));
});

test("Executioner finishes a normal enemy under 15% health, even an Armored one", async () => {
  const page = await open(baseSave({ stage: 5, maxStage: 5 }));
  const dead = await game(page, ["core/save.js", "hero/hero.js", "enemies/enemies.js", "enemies/foes.js", "combat/combat.js"], m => {
    m.save.S.equip.weapon = { id: 1, slot: "weapon", r: 4, power: 1, stage: 1, name: "X Drone", affs: [], u: "exec" }; m.hero.recalc();
    const e = m.foes.spawnFoe(m.enemies.makeEnemy(5, false));
    e.mods = ["armored"]; e.fx = m.enemies.foeFx(e.mods, null); e.fresh = false; e.v = Object.assign({}, e.v, { eva: 0 });
    e.hp = e.max * .1;
    m.combat.land(e, 1e-9, "blade");
    return e.hp <= 0;
  });
  assert.equal(dead, true);
});

test("Last Stand: under 30% health you take 40% less damage", async () => {
  const page = await open(baseSave());
  const ratio = await game(page, ["core/save.js", "core/stats.js", "hero/hero.js", "combat/combat.js"], m => {
    const d = m.stats.ST.maxHp * .01, hit = () => { const H = m.hero.hero; H.shield = 0; H.hp = m.stats.ST.maxHp * .2; const b = H.hp; m.combat.hurt(d, true); return b - H.hp; };
    Math.random = () => .99;
    const plain = hit();
    m.save.S.equip.armor = { id: 2, slot: "armor", r: 4, power: 1, stage: 1, name: "X Ring", affs: [], u: "last" }; m.hero.recalc();
    return hit() / plain;
  });
  assert.ok(Math.abs(ratio - .6) < 1e-9, String(ratio));
});

test("Dash goes where the stick points, even with a shape on that side", async () => {
  const page = await open(baseSave({ stage: 5, maxStage: 5 }));
  const moved = await game(page, ["hero/hero.js", "enemies/enemies.js", "enemies/foes.js", "world/scene.js"], async m => {
    m.foes.clearFoes();
    const V = m.scene.view, e = m.foes.spawnFoe(m.enemies.makeEnemy(5, false));
    e.px = V.HERO_X + 80; e.py = V.HERO_Y;
    const x0 = V.HERO_X; m.hero.hero.joyX = 1; m.hero.hero.joyY = 0;
    m.hero.startDash(1);
    await new Promise(r => setTimeout(r, 150));
    return V.HERO_X - x0;
  });
  assert.ok(moved > 20, String(moved));
});

test("Void Step (Abyss depth 10): a dash leaves a rift that hits shapes along its path when it ends", async () => {
  const lost = [];
  for (const best of [0, 15]) {
    const page = await open(baseSave({ stage: 5, maxStage: 5, abyss: { best, depth: 1, stone: 0, total: 0, altar: {}, seed: 1 } }));
    lost.push(await game(page, ["hero/hero.js", "enemies/enemies.js", "enemies/foes.js", "world/scene.js"], async m => {
      m.foes.clearFoes();
      Math.random = () => .99;
      const e = m.foes.spawnFoe(m.enemies.makeEnemy(5, false));
      e.v = Object.assign({}, e.v, { eva: 0 }); e.fresh = false; e.max = e.hp = 1e15;
      // the dash is steered straight through the shape, so the rift's path crosses it wherever it drifts meanwhile
      e.px = m.scene.view.HERO_X; e.py = m.scene.view.HERO_Y + 90; e.stun = 9; e.vx = e.vy = 0;
      m.hero.hero.joyX = 0; m.hero.hero.joyY = 1;
      m.hero.startDash(1);
      await new Promise(r => setTimeout(r, 600));
      return 1e15 - e.hp;
    }));
    assert.deepEqual(page.errors, []);
  }
  assert.ok(lost[1] > lost[0], JSON.stringify(lost));
});

test("ascending resets the run but keeps Stardust, the Star Forge and the Abyss", async () => {
  const page = await open(baseSave({ gold: 1e6, stage: 60, maxStage: 60, peak: 60, stardust: 7, stardustTotal: 9, forge: { craft: 1 }, abyss: { best: 3, depth: 4, stone: 5, total: 5, altar: {}, seed: 1 }, echoes: 2 }));
  await press(page, "tree", "asc", "ascend", 2);
  const s = await game(page, ["core/save.js"], m => { const S = m.save.S; return { gold: S.gold, stage: S.stage, dust: S.stardust, forge: S.forge.craft, depth: S.abyss.depth, echoes: S.echoes, asc: S.ascensions }; });
  assert.equal(s.gold, 0); assert.equal(s.stage, 1); assert.equal(s.dust, 7); assert.equal(s.forge, 1); assert.equal(s.depth, 4); assert.equal(s.asc, 1);
  assert.ok(s.echoes > 2);
});

test("transcending keeps the web, unspent echoes and a quarter of echo power, and pays Stardust", async () => {
  const page = await open(baseSave({ gold: 1e6, stage: 150, maxStage: 150, peak: 150, cyclePeak: 150, echoes: 50, echoesTotal: 5000, ascensions: 9, tree: { e1: 3 } }));
  await press(page, "tree", "trans", "transcend", 2);
  const s = await game(page, ["core/save.js", "core/stats.js"], m => { const S = m.save.S; return { tree: S.tree, echoes: S.echoes, earned: S.echoesTotal, memory: S.echoMemory, power: m.stats.ST.echoBonus, gold: S.gold, stage: S.stage, asc: S.ascensions, dust: S.stardust, t: S.transcends }; });
  assert.deepEqual([s.tree, s.echoes, s.earned, s.memory, s.power], [{ e1: 3 }, 50, 0, 1250, 12.5]);
  assert.deepEqual([s.gold, s.stage, s.asc, s.t], [0, 1, 0, 1]);
  assert.ok(s.dust >= 1);
  assert.deepEqual(page.errors, []);
});

test("Stardust grows in step with this cycle's echoes up to the cap, so splitting a Transcend gains nothing", async () => {
  const dust = [];
  for (const echoesTotal of [330, 660, 1320, 50000]) {
    const page = await open(baseSave({ stage: 150, maxStage: 150, peak: 150, cyclePeak: 150, echoesTotal }));
    await press(page, "tree", "trans", "transcend", 2);
    dust.push(await game(page, ["core/save.js"], m => m.save.S.stardust));
  }
  // 1323 echoes is the cap at stage 150: a quarter and a half of it pay a quarter and a half of the Stardust
  assert.deepEqual(dust.slice(0, 3), [9, 18, 36]);
  assert.ok(dust[3] > 36 && dust[3] < 80, String(dust));
});

test("a star awakens with the first Transcend, is chosen once, and its bonus applies", async () => {
  const page = await open(baseSave({ stage: 150, maxStage: 150, peak: 150, cyclePeak: 150, echoesTotal: 2000 }));
  const before = await game(page, ["progress/stars.js", "core/stats.js"], m => [m.stars.starPoints(), m.stats.ST.echoKeep]);
  await press(page, "tree", "trans", "transcend", 2);
  await page.evaluate(() => { const b = document.querySelector('#sheetBody [data-act="star"][data-id="afterglow"]'); b.click(); b.click(); });
  const after = await game(page, ["progress/stars.js", "core/stats.js", "core/save.js"], m => [m.stars.starPoints(), m.stats.ST.echoKeep, m.save.S.stars, document.querySelectorAll('#sheetBody [data-act="star"]:not([disabled])').length]);
  assert.deepEqual(before, [0, .25]);
  assert.deepEqual(after, [0, .5, { afterglow: 1 }, 0]);
  assert.deepEqual(page.errors, []);
});

test("Pulsar hits every shape in view, and Quasar turns orbital hits after a cast into stronger crits", async () => {
  const page = await open(baseSave({ stage: 5, maxStage: 5, stardustTotal: 60, transcends: 2, stars: { pulsar: 1, quasar: 1 } }));
  const r = await game(page, ["core/stats.js", "enemies/enemies.js", "enemies/foes.js", "combat/combat.js", "world/scene.js"], m => {
    m.foes.clearFoes();
    Math.random = () => .99;
    const V = m.scene.view, mk = dx => { const e = m.foes.spawnFoe(m.enemies.makeEnemy(5, false)); e.v = Object.assign({}, e.v, { eva: 0 }); e.fresh = false; e.max = e.hp = 1e15; e.px = V.HERO_X + dx; e.py = V.HERO_Y - 300; e.stun = 9; e.vx = e.vy = 0; return e; };
    const a = mk(-60), b = mk(60), lost = e => { const d = 1e15 - e.hp; e.hp = 1e15; return d; };
    m.foes.pickTarget();
    m.stats.emit("tick", { dt: 4.1, moving: false });
    const pulse = [lost(a), lost(b)];
    m.combat.land(a, 100, "blade"); const plain = lost(a);
    m.stats.emit("cast", { id: "nova", cost: 0, dmg: 0 });
    m.combat.land(a, 100, "blade"); const charged = lost(a);
    return { pulse, ratio: charged / plain, atk: m.stats.ST.atk, critDmg: m.stats.ST.critDmg };
  });
  // .99 rolls make every hit 109.8% of its base and never a natural crit
  assert.ok(r.pulse.every(d => Math.abs(d - r.atk * 2 * 1.098) < .2), JSON.stringify(r));
  assert.ok(Math.abs(r.ratio - r.critDmg * 1.5) < .01, JSON.stringify(r));
  assert.deepEqual(page.errors, []);
});

test("reaching stage 150 for the first time announces Transcend and the Abyss", async () => {
  const page = await open(baseSave({ stage: 149, maxStage: 149, peak: 149, kills: 7 }));
  const log = await game(page, ["core/save.js", "modes/modes.js", "enemies/enemies.js"], m => {
    m.modes.MAIN.kill(m.enemies.makeEnemy(149, false), {});
    document.getElementById("menuBtn").click(); document.querySelector('#menuDrop [data-win="log"]').click();
    return [m.save.S.peak, document.getElementById("feed").textContent];
  });
  assert.equal(log[0], 150);
  assert.match(log[1], /Transcend is open/); assert.match(log[1], /The Abyss has opened/);
});

test("tapping a wisp catches it for a boon and counts toward a wisp bounty", async () => {
  const page = await open(baseSave({ stage: 5, maxStage: 5, peak: 5, bounties: [{ type: "wisp", n: 2, prog: 0, tier: 0, poster: "x", eff: 180, shards: 3 }] }));
  // every roll 0: the wisp enters from the left and holds the first boon, a lumen cache
  const at = await game(page, ["wisp/wisp.js", "core/save.js"], m => {
    Math.random = () => 0; m.wisp.spawnWisp(); m.wisp.stepWisp(2);
    const r = document.querySelector("#wisps .wisp").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, gold: m.save.S.gold };
  });
  await page.mouse.click(at.x, at.y);
  const s = await game(page, ["core/save.js"], m => ({ gold: m.save.S.gold, left: document.querySelectorAll("#wisps .wisp").length, prog: m.save.S.bounties[0].prog }));
  assert.ok(s.gold > at.gold + 100, JSON.stringify([at, s]));
  assert.deepEqual([s.left, s.prog], [0, 1]);
  assert.deepEqual(page.errors, []);
});

test("a wisp's Frenzy doubles attack speed until it runs out", async () => {
  const page = await open(baseSave({ stage: 5, maxStage: 5, peak: 5 }));
  const r = await game(page, ["wisp/wisp.js", "combat/combat.js", "core/stats.js", "ui/hud.js"], m => {
    const base = m.combat.effSpd();
    // a roll of .5 lands on Frenzy, the third boon by weight
    Math.random = () => .5; m.wisp.spawnWisp(); m.wisp.stepWisp(2);
    const [x, y] = document.querySelector("#wisps .wisp").getAttribute("transform").match(/-?[\d.]+/g).map(Number);
    const caught = m.wisp.tapWisp(x, y), fast = m.combat.effSpd() / base;
    m.hud.updateUI(); const chip = document.getElementById("stRow").textContent;
    m.stats.emit("tick", { dt: 21, moving: false });
    return { caught, fast, chip, after: m.combat.effSpd() / base };
  });
  assert.deepEqual([r.caught, r.fast, r.after], [true, 2, 1]);
  assert.match(r.chip, /Frenzy 20s/);
});

test("Lodestar: a wisp flies to the core and is caught without a tap", async () => {
  const page = await open(baseSave({ stage: 5, maxStage: 5, peak: 5, stardustTotal: 1, transcends: 1, stars: { lode: 1 } }));
  const s = await game(page, ["wisp/wisp.js", "core/save.js"], m => {
    const gold = m.save.S.gold;
    Math.random = () => 0; m.wisp.spawnWisp();
    for (let i = 0; i < 200 && document.querySelector("#wisps .wisp"); i++) m.wisp.stepWisp(.05);
    return [m.save.S.gold > gold + 100, document.querySelectorAll("#wisps .wisp").length];
  });
  assert.deepEqual(s, [true, 0]);
});

test("the Abyss fights deeper stages without touching the main run's stage", async () => {
  const page = await open(baseSave({ stage: 70, maxStage: 70, peak: 160, abyss: { best: 0, depth: 3, stone: 0, total: 0, altar: {}, seed: 5 } }));
  await press(page, "tree", "abyss", "abEnter");
  const inside = await game(page, ["core/save.js", "modes/modes.js"], m => [m.modes.fightStage(), m.save.S.stage, document.getElementById("stageLbl").textContent]);
  await page.click("#mode");
  const s = inside.concat(await game(page, ["core/save.js"], m => m.save.S.stage));
  assert.deepEqual(s, [149, 70, "Depth 3", 70]);
});

test("a save made inside the Abyss by an older version gets its main stage back", async () => {
  const page = await open(baseSave({ stage: 151, maxStage: 90, abyss: { best: 4, depth: 4, stone: 0, total: 0, altar: {}, seed: 1, ret: { stage: 88, kills: 3, push: false } } }));
  const s = await game(page, ["core/save.js"], m => [m.save.S.stage, m.save.S.kills, "ret" in m.save.S.abyss]);
  assert.deepEqual(s, [88, 3, false]);
});

test("a save with ranks in the web's old Head Start gets those echoes back, and Prospector adds shards", async () => {
  const page = await open(baseSave({ echoes: 2, tree: { f1: 1, f7: 3 } }));
  const r = await game(page, ["core/save.js", "core/stats.js", "hero/hero.js"], m => {
    const S = m.save.S, out = { echoes: S.echoes, f7: S.tree.f7, start: m.stats.ST.startStage };
    S.tree.f14 = 2; m.hero.recalc(); out.shards = m.stats.ST.shardF; return out;
  });
  assert.deepEqual(r, { echoes: 20, f7: undefined, start: 1, shards: 1.2 });
  assert.deepEqual(page.errors, []);
});

test("a save that lost its web to an old Transcend gets those echoes back, once", async () => {
  const page = await open(baseSave({ stage: 30, maxStage: 30, peak: 150, echoes: 12, echoesTotal: 300, tree: { e1: 2 }, stardust: 38, stardustTotal: 38, transcends: 1 }));
  const first = await game(page, ["core/save.js"], m => { m.save.save(); return [m.save.S.echoes, m.save.S.echoMemory, m.save.S.echoesTotal, m.save.S.tree]; });
  await page.reload(); await page.waitForTimeout(300);
  const again = await game(page, ["core/save.js"], m => [m.save.S.echoes, m.save.S.echoMemory]);
  // 38 Stardust at stage 150 under the old formula took about 3743 echoes
  assert.deepEqual(first, [3755, 935, 300, { e1: 2 }]);
  assert.deepEqual(again, [3755, 935]);
  assert.deepEqual(page.errors, []);
});

test("an unreadable save is kept aside and the game starts fresh", async () => {
  const page = await open("{not json");
  const s = await page.evaluate(k => [localStorage.getItem(k + ".broken"), document.getElementById("stageLbl").textContent], KEY);
  assert.deepEqual(s, ["{not json", "Stage 1"]);
});

test("progress survives a reload", async () => {
  const page = await open(baseSave({ gold: 1234, stage: 12, maxStage: 14, tree: { e1: 1 } }));
  await game(page, ["core/save.js"], m => { m.save.S.gold = 4321; m.save.save(); });
  await page.reload(); await page.waitForTimeout(300);
  const s = await game(page, ["core/save.js"], m => [m.save.S.stage, m.save.S.maxStage, m.save.S.tree.e1]);
  assert.deepEqual(s, [12, 14, 1]);
});

test("every button in every window works", async () => {
  const page = await open(baseSave({ gold: 1e40, shards: 1e6, echoes: 500, stardust: 300, stardustTotal: 30, transcends: 1, stage: 120, maxStage: 160, peak: 170, cyclePeak: 160, abyss: { best: 30, depth: 5, stone: 500, total: 500, altar: {}, seed: 3 } }));
  const skip = ["wipe", "saveLoad", "intro", "saveCopy", "abEnter", "ascend", "transcend"];
  const clicks = await page.evaluate(async skip => {
    let n = 0;
    for (const w of [...document.querySelectorAll("#menuDrop [data-win]")].map(b => b.dataset.win)) {
      document.getElementById("menuBtn").click(); document.querySelector('#menuDrop [data-win="' + w + '"]').click();
      const subs = [...document.querySelectorAll("#winTabs .wt")].map(b => b.dataset.sub);
      for (const sub of subs.length ? subs : [null]) {
        if (sub) document.querySelector('#winTabs [data-sub="' + sub + '"]').click();
        for (let k = 0; k < 12; k++) {
          const bs = [...document.querySelectorAll("#sheetBody .panel:not([hidden]) [data-act]")].filter(b => !b.disabled && b.tagName !== "SELECT" && !skip.includes(b.dataset.act) && b.offsetParent);
          if (!bs[k]) break;
          bs[k].click(); n++;
        }
      }
      document.getElementById("sheetClose").click();
    }
    return n;
  }, skip);
  assert.ok(clicks > 50, String(clicks));
  assert.deepEqual(page.errors, []);
});
