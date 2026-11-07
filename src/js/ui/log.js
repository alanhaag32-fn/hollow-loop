// The event log and its window.
import { $ } from "../core/util.js";
import { markDirty, panel } from "./actions.js";
import { tab } from "./windows.js";

const feed = [];
export let unread = 0;
export function log(text, cls) {
  feed.unshift({ text, cls, t: new Date() });
  if (feed.length > 150) feed.pop();
  if (typeof tab !== "undefined" && tab === "log") markDirty("log"); else unread++;
}
function renderLog() {
  unread = 0;
  $("feed").innerHTML = feed.map(f => '<div class="' + f.cls + '"><time>' + f.t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) + "</time>" + f.text + "</div>").join("") || '<p class="note">Nothing yet.</p>';
}
panel("log", { render: renderLog });
