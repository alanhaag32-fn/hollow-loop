// Static checks on src/js with the TypeScript checker (JavaScript stays untyped; only these mistakes are reported):
// names that aren't declared or imported, imports of things a module doesn't export, assigning to an import,
// and declarations nothing uses. Then the bundle is built, which checks top-level names are unique.
//   node tools/check.mjs
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "./build.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); });
walk(path.join(ROOT, "src/js"));

const CODES = {
  2304: "undeclared", 2552: "undeclared", 2305: "missing export", 2724: "missing export", 2614: "missing export",
  2632: "assigns an import", 2630: "assigns a function", 2448: "used before declared", 2454: "used before assigned",
  6133: "unused", 6192: "unused", 6198: "unused", 6196: "unused"
};
const prog = ts.createProgram(files, {
  allowJs: true, checkJs: true, noEmit: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], noUnusedLocals: true
});
const found = ts.getPreEmitDiagnostics(prog).filter(d => d.file && CODES[d.code]).map(d => {
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  return path.relative(ROOT, d.file.fileName) + ":" + (line + 1) + "  " + CODES[d.code] + ": " + ts.flattenDiagnosticMessageText(d.messageText, " ");
});
bundle();
if (found.length) { console.log(found.join("\n")); process.exit(1); }
console.log("check ok:", files.length, "modules");
