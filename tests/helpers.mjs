// Test harness: serves src/ (the real ES modules) and opens it in Chromium. Tests reach into the running game by
// importing the same module instances in the page, e.g. game(page, "core/save.js").
import { createRequire } from "node:module";
import { serve } from "../tools/serve.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

export const KEY = "hollow-loop-v4";
const PORT = 8000 + Math.floor(Math.random() * 900);

// a save that skips the intro and stays quiet
export const baseSave = extra => Object.assign({ v: 4, eco: 7, seenIntro: true, sound: false, music: false, gold: 0, shards: 0, stage: 1, maxStage: 1, last: Date.now() }, extra);

let server, browser;
export async function start() {
  server = await serve(PORT);
  browser = await chromium.launch();
}
export async function stop() {
  await browser.close();
  server.close();
}

// open the game with this save (a raw string is stored as-is); page.errors collects uncaught errors
export async function open(save, url = "http://localhost:" + PORT + "/") {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.errors = [];
  page.on("pageerror", e => page.errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await page.addInitScript(([key, s]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(key, s);
  }, [KEY, typeof save === "string" ? save : JSON.stringify(save)]);
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("stageLbl").textContent.length > 0);
  return page;
}

// run fn(modules) in the page, where modules maps each requested path under src/js to its live module
export function game(page, paths, fn, arg) {
  return page.evaluate(async ([paths, src, arg]) => {
    const mods = {};
    for (const p of paths) mods[p.replace(/^.*\/|\.js$/g, "")] = await import("/js/" + p);
    return new Function("m", "arg", "return (" + src + ")(m, arg)")(mods, arg);
  }, [paths, fn.toString(), arg]);
}
