// The generative background music.
import { actx } from "./sound.js";
import { heroDown } from "../combat/combat.js";
import { S } from "../core/save.js";
import { enemy } from "../enemies/foes.js";
import { fightStage } from "../modes/modes.js";

let mus = null, musBus = null, musNext = 0, musStep = 0;
const MUS_VOL = { low: .3, med: .55, high: .85 };
const musVol = () => S.music === false ? 0 : MUS_VOL[S.mvol || "med"];
const CHORDS = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
const ZONE_KEY = [0, -3, 2, -5, 4, -2, 5, -4];
const ARP_EXTRA = [587.3, 880, 1174.7];
export function musicInit(out) {
  mus = actx.createGain(); mus.gain.value = musVol();
  const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000;
  musBus = actx.createGain();
  const dl = actx.createDelay(2), fb = actx.createGain(), wet = actx.createGain(), dlf = actx.createBiquadFilter();
  dl.delayTime.value = .62; fb.gain.value = .38; wet.gain.value = .4; dlf.type = "lowpass"; dlf.frequency.value = 1800;
  musBus.connect(mus); musBus.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(wet); wet.connect(mus);
  mus.connect(lp); lp.connect(out);
  musNext = actx.currentTime + .3;
}
export function setMusicVol() { if (mus) mus.gain.setTargetAtTime(musVol(), actx.currentTime, .3); }
function mnote(type, f, t, dur, peak, atk, rel) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.setValueAtTime(peak, t + Math.max(atk, dur - rel));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(musBus); o.start(t); o.stop(t + dur + .05);
}
function musStepAt(i, t, spb) {
  const zone = Math.floor((fightStage() - 1) / 10), tr = Math.pow(2, ZONE_KEY[zone % ZONE_KEY.length] / 12);
  const boss = !!(enemy && enemy.boss && !enemy.dead), rage = boss && enemy.enraged;
  const bar = Math.floor(i / 8), beat = i % 8, ch = CHORDS[Math.floor(bar / 2) % 4];
  if (i % 16 === 0) ch.forEach(f => {
    mnote("sine", f * tr, t, 16 * spb + 1, .018, 1.8, 1.6);
    mnote("triangle", f * tr * 1.004, t, 16 * spb + 1, .008, 2.2, 1.6);
  });
  if (beat === 0 || beat === 4) mnote("sine", ch[0] * tr / 2, t, spb * 3.5, boss ? .06 : .045, .04, spb * 2);
  if (boss) mnote("sine", ch[0] * tr / 2, t, spb * .8, rage ? .03 : .02, .01, spb * .6);
  if (Math.random() < (rage ? .7 : boss ? .5 : .32)) {
    const pool = ch.map(f => f * 2).concat(ch.map(f => f * 4), ARP_EXTRA);
    const f = pool[Math.floor(Math.random() * pool.length)] * tr;
    mnote("sine", f, t, 1.1, .022, .01, 1);
    mnote("sine", f * 2, t, .6, .006, .01, .55);
  }
}
function musTick() {
  if (!actx || !mus || actx.state !== "running" || heroDown === undefined) return;
  const spb = 60 / 144;
  if (musNext < actx.currentTime - .5) musNext = actx.currentTime + .05;
  if (S.music === false) { musNext = actx.currentTime + .1; return; }
  while (musNext < actx.currentTime + .6) { musStepAt(musStep, musNext, spb); musStep++; musNext += spb; }
}

export function initMusic() {
  setInterval(musTick, 150);
  document.addEventListener("visibilitychange", () => { if (!actx) return; if (document.hidden) actx.suspend(); else actx.resume(); });
}
