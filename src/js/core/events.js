// Things that happened in play (a kill, a crit, a cast, a stage cleared...), for features that keep count of them
// (bounties, the Index) without the code where they happen knowing those features.
const LISTENERS = [];
// fn(type, n, detail)
export const listen = fn => LISTENERS.push(fn);
export const tell = (type, n = 1, detail) => LISTENERS.forEach(fn => fn(type, n, detail));
