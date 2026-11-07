// Small helpers shared by everything: DOM lookup, random picks, number formatting, SVG building and animation.

export const NS = "http://www.w3.org/2000/svg";
export const pctS = v => (Math.round(v * 1000) / 10) + "%";
export const $ = id => document.getElementById(id);
export const rnd = n => Math.floor(Math.random() * n);
export const pick = a => a[rnd(a.length)];
const SUF = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "UDc", "DDc", "TDc"];
export function fmt(n) {
  if (!isFinite(n)) return "0";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  if (n >= 1e45) { const e = Math.floor(Math.log10(n)); return (n / Math.pow(10, e)).toFixed(2) + "e" + e; }
  const i = Math.min(SUF.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, i);
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUF[i];
}
export const pct = (v, d) => (v * 100).toFixed(d === undefined ? 1 : d).replace(/\.0$/, "") + "%";
export function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
export function polyPts(n, r, rot, cx, cy) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n - Math.PI / 2; out.push((cx + Math.cos(a) * r).toFixed(1) + "," + (cy + Math.sin(a) * r).toFixed(1)); }
  return out.join(" ");
}
export function vertices(n, r, rot, cx, cy) {
  const v = [];
  for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n - Math.PI / 2; v.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return v;
}
export function starPts(n, r1, r2) {
  const out = [];
  for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, r = i % 2 ? r2 : r1; out.push((Math.cos(a) * r).toFixed(1) + "," + (Math.sin(a) * r).toFixed(1)); }
  return out.join(" ");
}
export const mmss = ms => Math.floor(ms / 60000) + ":" + String(Math.floor(ms / 1000) % 60).padStart(2, "0");
