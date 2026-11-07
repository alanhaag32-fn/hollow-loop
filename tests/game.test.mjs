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

test("ascending resets the run but keeps Stardust, the Star Forge and the Abyss", async () => {
  const page = await open(baseSave({ gold: 1e6, stage: 60, maxStage: 60, peak: 60, stardust: 7, stardustTotal: 9, forge: { craft: 1 }, abyss: { best: 3, depth: 4, stone: 5, total: 5, altar: {}, seed: 1 }, echoes: 2 }));
  await press(page, "tree", "asc", "ascend", 2);
  const s = await game(page, ["core/save.js"], m => { const S = m.save.S; return { gold: S.gold, stage: S.stage, dust: S.stardust, forge: S.forge.craft, depth: S.abyss.depth, echoes: S.echoes, asc: S.ascensions }; });
  assert.equal(s.gold, 0); assert.equal(s.stage, 1); assert.equal(s.dust, 7); assert.equal(s.forge, 1); assert.equal(s.depth, 4); assert.equal(s.asc, 1);
  assert.ok(s.echoes > 2);
});

test("transcending resets the web and echoes and pays Stardust", async () => {
  const page = await open(baseSave({ stage: 150, maxStage: 150, peak: 150, cyclePeak: 150, echoes: 50, echoesTotal: 5000, tree: { e1: 3 } }));
  await press(page, "tree", "trans", "transcend", 2);
  const s = await game(page, ["core/save.js"], m => { const S = m.save.S; return { tree: Object.keys(S.tree).length, echoes: S.echoesTotal, dust: S.stardust, t: S.transcends }; });
  assert.deepEqual([s.tree, s.echoes, s.t], [0, 0, 1]);
  assert.ok(s.dust >= 1);
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
