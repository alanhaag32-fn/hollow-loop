// Synthesized sound effects (no audio files).
import { musicInit } from "./music.js";
import { S } from "../core/save.js";

export let actx = null, master = null, bus = null, noiseBuf = null, voices = 0;
const SND_VOL = { low: .35, med: .65, high: 1 };
const sndVol = () => S.sound === false ? 0 : SND_VOL[S.vol || "med"];
export function audioInit() {
  if (actx) { if (actx.state === "suspended") actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = sndVol();
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 4;
    const soften = actx.createBiquadFilter(); soften.type = "lowpass"; soften.frequency.value = 5200;
    master.connect(soften); soften.connect(comp); comp.connect(actx.destination);
    musicInit(comp);
    // light echo for a glassy, spacious feel
    bus = actx.createGain(); bus.connect(master);
    const dl = actx.createDelay(1), fb = actx.createGain(), wet = actx.createGain(), dlf = actx.createBiquadFilter();
    dl.delayTime.value = .19; fb.gain.value = .3; wet.gain.value = .32; dlf.type = "lowpass"; dlf.frequency.value = 2600;
    bus.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(wet); wet.connect(master);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (err) { actx = null; }
}
export function setVolume() { if (master) master.gain.setTargetAtTime(sndVol(), actx.currentTime, .05); }
function env(g, t, dur, peak, atk) {
  const a = atk || .008;
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(dur, a + .02));
}
// soft sine/triangle voices only, routed through the echo bus
function tone(type, f0, f1, dur, peak, delay, atk) {
  const t = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, dur, peak, atk); o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + .05); voices++; o.onended = () => voices--;
}
function air(f0, f1, dur, peak, delay) {
  const t = actx.currentTime + (delay || 0), src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuf; f.type = "bandpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, dur, peak, dur * .35); src.connect(f); f.connect(g); g.connect(bus);
  src.start(t, Math.random() * .5); src.stop(t + dur + .05); voices++; src.onended = () => voices--;
}
// everything is tuned to one pentatonic scale so overlapping sounds stay in harmony
const NOTE = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7, 1318.5, 1568, 1760];
const pickN = (lo, hi) => NOTE[lo + Math.floor(Math.random() * (hi - lo + 1))];
const bell = (f, peak, delay, len) => { tone("sine", f, f, len || .45, peak, delay); tone("sine", f * 2, f * 2, (len || .45) * .6, peak * .3, delay); };
const SFX = {
  Drone: () => { const f = pickN(10, 12); tone("sine", f, f, .07, .02); tone("sine", f, f, .07, .016, .06); },
  Glaive: () => air(700, 1500, .22, .03),
  Laser: () => tone("sine", 1568, 1046.5, .14, .022),
  Swarm: () => [9, 10, 11].forEach((n, i) => tone("triangle", NOTE[n], NOTE[n], .07, .014, i * .04)),
  Hammer: () => { tone("sine", 165, 82, .28, .07, .21); tone("triangle", 330, 165, .18, .018, .21); },
  Coil: () => { tone("sine", 1318.5, 1318.5, .12, .012); tone("sine", 1330, 1330, .12, .012); },
  Mote: () => tone("sine", 1046.5, 1046.5, .07, .014),
  hit: () => {},
  crit: () => bell(pickN(10, 13), .045),
  tap: () => tone("sine", pickN(8, 12), 0, .05, .012),
  miss: () => {},
  shatter: big => {
    const n = big ? 5 : 2, start = big ? 12 : 13;
    for (let i = 0; i < n; i++) bell(NOTE[Math.max(5, start - i * 2)], big ? .03 : .018, i * .06, .35);
    if (big) tone("sine", 130.8, 98, .7, .06, 0, .02);
  },
  hurt: () => tone("sine", 220, 165, .14, .04),
  block: () => tone("triangle", 880, 880, .1, .022),
  evade: () => air(900, 1800, .18, .018),
  bossIn: () => { tone("sine", 98, 98, 1.4, .07, 0, .5); tone("sine", 146.8, 146.8, 1.4, .05, .1, .5); tone("sine", 196, 196, 1.2, .03, .2, .4); },
  eliteIn: () => { tone("sine", 196, 196, .5, .045, 0, .08); tone("sine", 293.7, 293.7, .45, .025, .05, .08); },
  warn: () => { tone("sine", 440, 440, .12, .03); tone("sine", 440, 440, .12, .03, .25); tone("sine", 523.3, 523.3, .16, .035, .5); },
  crush: () => { tone("sine", 110, 55, .55, .12, 0, .01); air(300, 120, .45, .03); },
  status: () => { tone("sine", 622.3, 622.3, .3, .018, 0, .03); tone("sine", 587.3, 587.3, .3, .018, 0, .03); },
  loot: r => [5, 7, 8, 10, 12].slice(0, 2 + r).forEach((n, i) => bell(NOTE[n], .03, i * .08, .4)),
  death: () => [10, 8, 6, 5].forEach((n, i) => tone("sine", NOTE[n], NOTE[n], .45, .035, i * .14, .02)),
  chord: () => [5, 7, 8, 10].forEach((n, i) => tone("sine", NOTE[n], NOTE[n], .9, .025, i * .05, .06)),
  ascend: () => [0, 2, 3, 5, 7, 8, 10, 12].forEach((n, i) => bell(NOTE[n], .03, i * .09, .9)),
  buy: () => { bell(1046.5, .022, 0, .2); bell(1318.5, .022, .07, .3); },
  shard: () => bell(1568, .014, 0, .25),
  nova: () => { tone("sine", 261.6, 523.3, .35, .05, 0, .05); bell(784, .025, .12, .5); },
  barrier: () => { tone("sine", 523.3, 523.3, .8, .025, 0, .15); tone("sine", 784, 784, .8, .02, .05, .15); },
  overdrive: () => [7, 8, 10, 12].forEach((n, i) => tone("triangle", NOTE[n], NOTE[n], .12, .018, i * .045)),
  storm: () => air(500, 2200, .5, .028),
  dash: () => [7, 9, 12].forEach((n, i) => bell(NOTE[n], .018, i * .035, .2)),
  shatterSkill: () => [13, 12, 14].forEach((n, i) => bell(NOTE[n], .022, i * .05, .5))
};
const lastSnd = {};
export function sfx(key, arg, gap) {
  if (!actx || actx.state !== "running" || S.sound === false || voices > 22) return;
  const now = performance.now();
  if (now - (lastSnd[key] || 0) < (gap === undefined ? 50 : gap)) return;
  lastSnd[key] = now;
  try { SFX[key](arg); } catch (err) {}
}

export function initSound() {
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, audioInit, { passive: true }));
}
