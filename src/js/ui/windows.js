// Windows and their tabs, and the menu.
import { S } from "../core/save.js";
import { $, polyPts } from "../core/util.js";
import { PANELS, runAction } from "./actions.js";

const WINDOWS = [
  { id: "log", name: "Log", d: "Everything that happened", icon: "M5 4 L19 4 L19 20 L5 20 Z M8 8 L16 8 L16 9.5 L8 9.5 Z M8 11.5 L16 11.5 L16 13 L8 13 Z M8 15 L13 15 L13 16.5 L8 16.5 Z" },
  { id: "stats", d: "Your full stat sheet", name: "Stats", icon: "M3 20 L3 10 L7 10 L7 20 Z M10 20 L10 4 L14 4 L14 20 Z M17 20 L17 13 L21 13 L21 20 Z" },
  { id: "gear", d: "Equipped items and sets", name: "Gear", icon: "M12 2 L16 14 L12 22 L8 14 Z" },
  { id: "pack", d: "Spare items and salvage", name: "Pack", icon: "M4 8 L20 8 L19 21 L5 21 Z M8 8 Q8 3 12 3 Q16 3 16 8 L14 8 Q14 5 12 5 Q10 5 10 8 Z" },
  { id: "skills", d: "Upgrade skills, auto-cast", name: "Skills", icon: "M12 0 L14 9 L24 12 L14 15 L12 24 L10 15 L0 12 L10 9 Z" },
  { id: "train", d: "Lumen upgrades", name: "Train", icon: "M2 10 L5 10 L5 14 L2 14 Z M5 8 L8 8 L8 16 L5 16 Z M8 11 L16 11 L16 13 L8 13 Z M16 8 L19 8 L19 16 L16 16 Z M19 10 L22 10 L22 14 L19 14 Z" },
  { id: "index", d: "Enemy records and bonuses", name: "Index", icon: "M3 3 L10 3 L10 10 L3 10 Z M17.5 2.5 L21.5 10 L13.5 10 Z M6.5 13.5 A3.75 3.75 0 1 1 6.49 13.5 Z M17.5 13 L21.5 15.5 L21.5 19.5 L17.5 22 L13.5 19.5 L13.5 15.5 Z" },
  { id: "board", d: "Bounties to claim", name: "Board", title: "Bounty board", icon: "M3 4 L21 4 L21 20 L3 20 Z M6 7 L12 7 L12 12 L6 12 Z M14 8 L19 8 L19 10 L14 10 Z M14 12 L19 12 L19 14 L14 14 Z M6 15 L19 15 L19 17 L6 17 Z" },
  { id: "guide", d: "Help and settings", name: "Guide", icon: "M3 4 L11 5.5 L11 21 L3 19.5 Z M13 5.5 L21 4 L21 19.5 L13 21 Z" },
  { id: "tree", d: "Ascend and the web", name: "Tree", title: "Ascension web", icon: "M12 10 A2.5 2.5 0 1 1 11.99 10 Z M4 4 A2 2 0 1 1 3.99 4 Z M20 4 A2 2 0 1 1 19.99 4 Z M4 18 A2 2 0 1 1 3.99 18 Z M20 18 A2 2 0 1 1 19.99 18 Z M5 5.5 L11 11 L10 12 L4.5 6.5 Z M19 5.5 L13 11 L14 12 L19.5 6.5 Z M5 18.5 L11 13 L10 12 L4.5 17.5 Z M19 18.5 L13 13 L14 12 L19.5 17.5 Z" }
];
const TI = {
  abyss: "M5 2 L19 4 L23 13 L14 22 L9 15 L2 18 L4 9 Z M9 8 L15 8.5 L16 14 L11 12.5 Z",
  trans: "M12 1 L14.6 9.2 L23 9.2 L16.2 14.2 L18.8 22.5 L12 17.4 L5.2 22.5 L7.8 14.2 L1 9.2 L9.4 9.2 Z",
  off: "M12 2 L21.5 20 L2.5 20 Z M12 8.5 L16.6 17 L7.4 17 Z",
  def: "M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z M12 6.3 L17.3 9.3 L17.3 14.7 L12 17.7 L6.7 14.7 L6.7 9.3 Z",
  mana: "M12 2 Q20 12 18 16 A6 6 0 1 1 6 16 Q4 12 12 2 Z",
  fort: "M12 2.5 A9.5 9.5 0 1 1 11.99 2.5 Z M12 6.5 L16.5 12 L12 17.5 L7.5 12 Z",
  jour: "M5 2 L7 2 L7 22 L5 22 Z M7 3 L19.5 3 L16 7.5 L19.5 12 L7 12 Z",
  equip: "M12 2 L16 14 L12 22 L8 14 Z",
  sets: "M7 2.5 L11 7.5 L7 12.5 L3 7.5 Z M17 2.5 L21 7.5 L17 12.5 L13 7.5 Z M12 11 L16 16.5 L12 22 L8 16.5 Z",
  items: "M4 8 L20 8 L19 21 L5 21 Z M8 8 Q8 3 12 3 Q16 3 16 8 L14 8 Q14 5 12 5 Q10 5 10 8 Z",
  opts: "M4 6.5 L12 2 L20 6.5 L20 11 L17 11 L17 8.3 L12 5.5 L7 8.3 L7 15.7 L12 18.5 L17 15.7 L17 13 L20 13 L20 17.5 L12 22 L4 17.5 Z",
  web: "M12 10 A2.5 2.5 0 1 1 11.99 10 Z M4 4 A2 2 0 1 1 3.99 4 Z M20 4 A2 2 0 1 1 19.99 4 Z M4 18 A2 2 0 1 1 3.99 18 Z M20 18 A2 2 0 1 1 19.99 18 Z M5 5.5 L11 11 L10 12 L4.5 6.5 Z M19 5.5 L13 11 L14 12 L19.5 6.5 Z M5 18.5 L11 13 L10 12 L4.5 17.5 Z M19 18.5 L13 13 L14 12 L19.5 17.5 Z",
  asc: "M12 2.5 L20.5 11 L17 11 L12 6 L7 11 L3.5 11 Z M12 11 L20.5 19.5 L17 19.5 L12 14.5 L7 19.5 L3.5 19.5 Z",
  set: "M3 5.5 L21 5.5 L21 7.5 L3 7.5 Z M3 16.5 L21 16.5 L21 18.5 L3 18.5 Z M6.5 3 L10.5 3 L10.5 10 L6.5 10 Z M13.5 14 L17.5 14 L17.5 21 L13.5 21 Z",
  save: "M11 2.5 L13 2.5 L13 12.5 L16.6 9 L18 10.4 L12 16.4 L6 10.4 L7.4 9 L11 12.5 Z M4 19 L20 19 L20 21.5 L4 21.5 Z",
  help: "M3 4 L11 5.5 L11 21 L3 19.5 Z M13 5.5 L21 4 L21 19.5 L13 21 Z",
  bonus: "M12 1.5 L14.6 9 L22.5 9.2 L16.2 14 L18.5 21.6 L12 17.1 L5.5 21.6 L7.8 14 L1.5 9.2 L9.4 9 Z"
};
// a panel's tabs: [id, label, sides (a polygon icon for shape families)], from its tabs() (none: no tab row)
const subList = win => PANELS[win].tabs ? PANELS[win].tabs() : null;
const curSub = {};
const subIcon = (id, sides) => sides ? '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="' + polyPts(sides, 9.5, 0, 12, 12.5) + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>'
  : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (TI[id] || TI.equip) + '" fill="currentColor" fill-rule="evenodd"/></svg>';
function buildWinTabs(win) {
  const list = subList(win) || [];
  if (!curSub[win] && list.length) curSub[win] = list[0][0];
  $("winTabs").parentElement.classList.toggle("dense", list.length > 5);
  if (PANELS[win].bar) { $("winTabs").innerHTML = PANELS[win].bar(); return; }
  $("winTabs").innerHTML = list.length > 1 ? list.map(([id, name, sides]) => '<button type="button" role="tab" class="wt chf' + (curSub[win] === id ? " on" : "") + '" data-sub="' + id + '" aria-selected="' + (curSub[win] === id) + '">' + subIcon(id, sides) + "<span>" + name + "</span></button>").join("") : "";
}
function applySub(win) {
  if (!win) return;
  const list = subList(win), cur = curSub[win];
  $("p-" + win).querySelectorAll(".wsub").forEach(el => el.classList.toggle("on", !list || list.length < 2 || el.dataset.sub === cur));
  // a panel can fill the whole sheet (the web, the board) instead of scrolling
  const fill = PANELS[win].fill ? PANELS[win].fill(cur) : "";
  $("sheetInner").className = "sheetInner" + (fill ? " fill fill-" + fill : "");
}
export let tab = null;
const CURRENCY = { echo: () => S.echoes, shard: () => S.shards, dust: () => S.stardust || 0, gold: () => S.gold };
// cheap refresh of the open panel
export function refreshPanel() {
  if (!tab) return;
  $("p-" + tab).querySelectorAll("[data-cost]").forEach(b => b.classList.toggle("afford", !b.disabled && CURRENCY[b.dataset.cur || "gold"]() >= Number(b.dataset.cost)));
  if (PANELS[tab].refresh) PANELS[tab].refresh();
  applySub(tab);
}
function openWindow(id) {
  tab = id;
  const w = WINDOWS.find(x => x.id === id);
  closeMenu();
  $("sheetTitle").textContent = w.title || w.name;
  $("sheetIcon").innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + w.icon + '" fill="currentColor" fill-rule="evenodd"/></svg>';
  document.querySelectorAll("#menuDrop [data-win]").forEach(b => b.classList.toggle("on", b.dataset.win === id));
  Object.keys(PANELS).forEach(n => { $("p-" + n).hidden = n !== id; });
  buildWinTabs(id);
  $("sheet").hidden = false; document.body.classList.add("locked");
  $("sheetBody").scrollTop = 0;
  PANELS[id].stale = false; PANELS[id].render(); refreshPanel();
  if (PANELS[id].shown) requestAnimationFrame(PANELS[id].shown);
  $("sheetClose").focus();
}
export function closeWindow() { $("sheetInner").className = "sheetInner"; $("sheet").hidden = true; document.body.classList.remove("locked"); tab = null; document.querySelectorAll("#menuDrop [data-win]").forEach(b => b.classList.remove("on")); }
const MENU_ORDER = ["stats", "gear", "pack", "skills", "train", "index", "board", "tree", "-", "log", "guide"];
function openMenu() { $("menuDrop").hidden = false; $("menuBtn").setAttribute("aria-expanded", "true"); }
function closeMenu() { $("menuDrop").hidden = true; $("menuBtn").setAttribute("aria-expanded", "false"); }

export function initWindows() {
  $("winTabs").addEventListener("click", e => {
    const a = e.target.closest("[data-act]"); if (a) { if (!a.disabled) runAction(a.dataset.act, a.dataset.id, a); return; }
    const b = e.target.closest("[data-sub]"); if (!b || !tab) return;
    curSub[tab] = b.dataset.sub;
    $("winTabs").querySelectorAll(".wt").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); });
    $("sheetBody").scrollTop = 0;
    applySub(tab);
    if (PANELS[tab].shown) requestAnimationFrame(PANELS[tab].shown);
  });
  (function buildMenu() {
    let bi = 0;
    $("menuDrop").innerHTML = MENU_ORDER.map(id => {
      if (id === "-") return '<div class="sep"></div>';
      const w = WINDOWS.find(x => x.id === id);
      return '<button type="button" class="chf" style="--i:' + (bi++) + '" data-win="' + w.id + '"><span class="mi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + w.icon + '" fill="currentColor" fill-rule="evenodd"/></svg></span>' + w.name + (w.id === "board" ? '<span id="boardDot"></span>' : "") + (w.id === "pack" ? '<span class="tail" id="packN"></span>' : "") + (w.id === "log" ? '<span id="logN"></span>' : "") + "</button>";
    }).join("");
    $("menuDrop").addEventListener("click", e => { const b = e.target.closest("[data-win]"); if (b) openWindow(b.dataset.win); });
  })();
  $("menuBtn").addEventListener("click", e => { e.stopPropagation(); if ($("menuDrop").hidden) openMenu(); else closeMenu(); });
  document.addEventListener("pointerdown", e => { if (!$("menuDrop").hidden && !e.target.closest("#menuDrop button, #menuBtn")) closeMenu(); });
  $("sheetClose").addEventListener("click", closeWindow);
  $("sheet").addEventListener("click", e => { if (e.target === $("sheet")) closeWindow(); });
  document.addEventListener("keydown", e => { if (e.key !== "Escape") return; if (!$("menuDrop").hidden) closeMenu(); else if (tab) closeWindow(); });
  $("panels").addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled && b.tagName !== "SELECT") runAction(b.dataset.act, b.dataset.id, b);
  });
  $("panels").addEventListener("change", e => { const t = e.target.closest("select[data-act]"); if (t) runAction(t.dataset.act, t.value, t); });
}
