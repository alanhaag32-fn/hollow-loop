// The single-file build must run the same game as the modules.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle, page as buildPage } from "../tools/build.mjs";
import { start, stop, open, baseSave } from "./helpers.mjs";

before(start);
after(stop);

test("the bundled page boots and plays without errors", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hl-")), "game.html");
  fs.writeFileSync(file, buildPage(bundle()));
  const page = await open(baseSave(), "file://" + file);
  for (let i = 0; i < 15; i++) { await page.mouse.click(195, 380); await page.waitForTimeout(200); }
  assert.equal(await page.evaluate(() => document.getElementById("stageLbl").textContent), "Stage 1");
  assert.deepEqual(page.errors, []);
});
