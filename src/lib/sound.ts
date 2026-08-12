"use client";

type Ctx = { ac: AudioContext; gain: GainNode; nodes: AudioNode[] };
let current: Ctx | null = null;
let activeName = "none";

function noiseBuffer(ac: AudioContext, brown = false): AudioBuffer {
  const len = ac.sampleRate * 4;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return buf;
}

export function stopSound() {
  if (current) {
    try { current.gain.gain.value = 0; current.ac.close(); } catch { /* ignore */ }
    current = null;
  }
  activeName = "none";
}

export function currentSound() { return activeName; }

export function playSound(name: string, volume = 0.3) {
  stopSound();
  if (name === "none") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new AC();
  const gain = ac.createGain();
  gain.gain.value = volume;
  gain.connect(ac.destination);
  const nodes: AudioNode[] = [];

  if (name === "binaural") {
    [200, 240].forEach((f, i) => {
      const o = ac.createOscillator();
      const p = ac.createStereoPanner();
      o.frequency.value = f; o.type = "sine";
      p.pan.value = i === 0 ? -1 : 1;
      o.connect(p); p.connect(gain); o.start();
      nodes.push(o);
    });
  } else {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, name === "brown" || name === "ocean");
    src.loop = true;
    const filter = ac.createBiquadFilter();
    if (name === "rain") { filter.type = "highpass"; filter.frequency.value = 1000; }
    else if (name === "brown") { filter.type = "lowpass"; filter.frequency.value = 500; }
    else if (name === "ocean") { filter.type = "lowpass"; filter.frequency.value = 700; }
    else { filter.type = "bandpass"; filter.frequency.value = 500; filter.Q.value = 0.6; }
    src.connect(filter);
    if (name === "ocean" || name === "wind") {
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = name === "ocean" ? 0.12 : 0.25;
      lg.gain.value = 0.5;
      const mod = ac.createGain();
      mod.gain.value = 0.5;
      lfo.connect(lg); lg.connect(mod.gain);
      filter.connect(mod); mod.connect(gain);
      lfo.start(); nodes.push(lfo, mod);
    } else {
      filter.connect(gain);
    }
    src.start();
    nodes.push(src, filter);
  }
  current = { ac, gain, nodes };
  activeName = name;
}

export function setVolume(v: number) {
  if (current) current.gain.gain.value = v;
}
