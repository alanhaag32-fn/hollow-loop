// How enemy health and damage, gear power and lumen grow with the stage.

const HPG = 1.35;
const LATE = 80;
const curve = (st, g1, g2) => Math.pow(g1, Math.min(st, LATE) - 1) * Math.pow(g2, Math.max(0, st - LATE));
// stages 120 to 150 are the climb to your first Transcend
const span = (st, a, b) => Math.max(0, Math.min(st, b) - a);
export const stageHp = st => 20 * curve(st, HPG, 1.3) * Math.pow(1.28 / 1.3, span(st, 100, 120)) * Math.pow(1.23 / 1.3, span(st, 120, 150));
export const stageDmg = st => .9 * curve(st, 1.27, 1.24);
export const itemPow = st => 6 * Math.pow(1.13, st - 1);
const MILES = [25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];
export const milesAt = L => MILES.filter(m => L >= m).length;
export const nextMile = L => MILES.find(m => m > L);
export const lumenBase = st => 3 * curve(st, HPG, 1.3);
export const lumenAt = st => lumenBase(st) * (1 + Math.min(1, Math.max(0, st - 80) / 40));
