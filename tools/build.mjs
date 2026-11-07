// Build the game from src/ with no dependencies.
//   node tools/build.mjs            writes the GitHub Pages site (index.html, sw.js, manifest, icons) to the repo root
//                                   and the single-file game to dist/hollow-loop.html
//   node tools/build.mjs --check    only bundles and checks, writes nothing
//
// The modules in src/js are bundled by concatenating them in ES module evaluation order inside one function,
// with their import and export keywords removed. That only works because every top-level name is unique across
// modules, so the build checks it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const IMPORT = /^import (?:\{([^}]*)\} from )?"([^"]+)";\n/gm;
const DECL = /^(?:export )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm;

export function bundle() {
  const order = [], seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT)) visit(path.resolve(path.dirname(file), m[2]));
    order.push({ file, text });
  };
  visit(path.join(SRC, "js/main.js"));
  const owner = new Map(), problems = [];
  const parts = order.map(({ file, text }) => {
    const rel = path.relative(SRC, file);
    for (const m of text.matchAll(DECL)) {
      if (owner.has(m[1])) problems.push(m[1] + " is declared in both " + owner.get(m[1]) + " and " + rel);
      owner.set(m[1], rel);
    }
    const body = text.replace(IMPORT, "").replace(/^export /gm, "");
    return "// ---- " + rel + "\n" + body.trim() + "\n";
  });
  if (problems.length) throw new Error("bundle: top-level names must be unique across modules:\n  " + problems.join("\n  "));
  return '(() => {\n"use strict";\n' + parts.join("\n") + "})();\n";
}

// the page with its stylesheet and script inlined; extraHead/extraBody add the PWA bits
export function page(js, { extraHead = "", extraBody = "" } = {}) {
  let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(SRC, "style.css"), "utf8");
  const swap = (from, to) => { if (!html.includes(from)) throw new Error("index.html is missing " + from); html = html.replace(from, () => to); };
  swap('<link rel="stylesheet" href="style.css">\n', "<style>\n" + css + "</style>\n");
  swap('<script type="module" src="js/main.js"></script>\n', "<script>\n" + js + "</script>\n" + extraBody);
  if (extraHead) swap("<title>Hollow Loop</title>\n", "<title>Hollow Loop</title>\n" + extraHead);
  return html;
}

const PWA_HEAD = `<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#0d0b16">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hollow Loop">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
`;
const SW_REGISTER = `<script>
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
</script>
`;

function main() {
  const js = bundle();
  if (process.argv.includes("--check")) { console.log("bundle ok,", js.length, "chars"); return; }
  fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "dist/hollow-loop.html"), page(js));
  // GitHub Pages serves the repo root, so the installable site is written there
  fs.writeFileSync(path.join(ROOT, "index.html"), page(js, { extraHead: PWA_HEAD, extraBody: SW_REGISTER }));
  const pwa = path.join(SRC, "pwa");
  // a new cache name per build, so phones pick up the new version on their next launch
  const version = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
  fs.writeFileSync(path.join(ROOT, "sw.js"), fs.readFileSync(path.join(pwa, "sw.js"), "utf8").replace("VERSION", version));
  for (const f of ["manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]) fs.copyFileSync(path.join(pwa, f), path.join(ROOT, f));
  console.log("built dist/hollow-loop.html and the Pages site, version", version);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
