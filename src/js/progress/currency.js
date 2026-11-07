// The currencies you earn: lumen and shards.
import { sfx } from "../audio/sound.js";
import { bump } from "../bounty/bounty.js";
import { lumenAt } from "../core/curves.js";
import { S } from "../core/save.js";
import { ST } from "../core/stats.js";
import { markDirty } from "../ui/actions.js";
import { floatText } from "../ui/floats.js";

// counts: whether it counts toward "Earn lumen" bounties (combat lumen does; salvage and payouts don't)
export function addGold(n, counts) { S.gold += n; if (counts) bump("gold", n); }
export const goldScale = () => lumenAt(Math.max(1, S.maxStage)) * (ST ? ST.gold : 1);
// shards are scarce: you can't max every skill at each cap, so pick favorites
export const shardAmt = st => 1 + Math.floor(st / 12);
export function addShards(n, float) { if (n <= 0) return; S.shards += n; markDirty("skills"); if (float) { floatText("+" + n + " shard" + (n > 1 ? "s" : ""), "shardf", float === true ? "enemy" : float); sfx("shard", 0, 120); } }
