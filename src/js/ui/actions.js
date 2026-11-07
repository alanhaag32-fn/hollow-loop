// The panel and action registries: windows register panels, features register the actions their buttons name.

// Each window registers its panel next to its render code, and every button's data-act names an action registered
// next to the feature it changes. After an action, stats are recalculated, every panel is marked stale (the open
// one re-renders), the game saves and the HUD refreshes; main wires this with whenActionsRun. An action returns
// false when nothing changed (or the page is about to reload), or a function to run once the open panel re-rendered.
export const PANELS = {}, ACTIONS = {};
// def: { render(), and optionally: refresh() for cheap updates while open, tabs() its tab list,
// bar() html for the tab row instead of tabs, fill(tab) to fill the sheet, shown() once it's on screen }
export const panel = (id, def) => { PANELS[id] = Object.assign({ stale: true }, def); };
export const action = (name, fn) => { ACTIONS[name] = fn; };
// tabs a feature adds to another feature's window (the Transcend and Abyss tabs in the Tree). def: { label, at (tab
// order), open() whether the tab shows, body: the element its render() html goes in }. The window lists and renders them.
const SHEETS = {};
export const sheet = (win, id, def) => { (SHEETS[win] = SHEETS[win] || []).push(Object.assign({ id }, def)); SHEETS[win].sort((a, b) => a.at - b.at); };
export const sheetTabs = win => (SHEETS[win] || []).filter(s => s.open()).map(s => [s.id, s.label]);
export const renderSheets = win => (SHEETS[win] || []).forEach(s => { document.getElementById(s.body).innerHTML = s.render(); });
export function markDirty(...k) { k.forEach(x => { PANELS[x].stale = true; }); }
let afterAction = () => {};
// set once at boot: what follows every action that changed something
export const whenActionsRun = fn => { afterAction = fn; };
export function runAction(name, id, el) {
  const fn = ACTIONS[name];
  if (!fn) return;
  const r = fn(id, el);
  if (r === false) return;
  afterAction();
  if (typeof r === "function") r();
}
// tap-twice buttons: the first tap shows `prompt` on the button; a second tap within 3s confirms
export function confirmTap(b, prompt) {
  if (b.dataset.armed) return true;
  const was = b.innerHTML; b.dataset.armed = "1"; b.innerHTML = prompt;
  setTimeout(() => { delete b.dataset.armed; b.innerHTML = was; }, 3000);
  return false;
}
