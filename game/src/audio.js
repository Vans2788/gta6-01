// Every sound is synthesized live with WebAudio — an engine hum that follows
// speed, a wailing siren, gunshots, pickup chimes and a lazy bass-and-hats
// groove. No audio files are ever loaded, so the game stays fully offline.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let beat = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.16;
      musicBus.connect(master);
      // Engine: a pair of detuned saws through a lowpass; pitch tracks speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle voice that wails between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, delay = 0) {
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noiseBurst(dur, vol, cutoff) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  // A sunset groove in A minor: walking bass, hats on the off-beat, 112 bpm.
  // At 112 bpm one bar (4 beats) lasts 60/112*4 ≈ 2.14 s, so each of the 8
  // eighth-note steps lands 268 ms apart — that is where the interval comes from.
  const BASS_LINE = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  function startMusic() {
    if (musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (!ctx || muted) return;
      const step = beat % 8;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = BASS_LINE[step];
      const start = ctx.currentTime;
      gain.gain.setValueAtTime(0.5, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
      osc.connect(gain);
      gain.connect(musicBus);
      osc.start(start);
      osc.stop(start + 0.45);
      if (beat % 2 === 1) {
        const hat = ctx.createBufferSource();
        const len = Math.floor(ctx.sampleRate * 0.03);
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        hat.buffer = buffer;
        const hatGain = ctx.createGain();
        hatGain.gain.value = 0.12;
        hat.connect(hatGain);
        hatGain.connect(musicBus);
        hat.start();
      }
      beat += 1;
    }, 268);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    setEngine(speedRatio, driving) {
      if (!ctx) return;
      const level = driving ? 0.05 + speedRatio * 0.09 : 0;
      engineGain.gain.setTargetAtTime(level, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, ctx.currentTime, 0.08);
    },
    setSiren(on, time) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
      if (on) sirenOsc.frequency.value = 660 + Math.sin(time * 2.4) * 220;
    },
    gunshot() { noiseBurst(0.12, 0.5, 1800); tone(160, 0.08, 'square', 0.2); },
    punch() { noiseBurst(0.07, 0.3, 900); },
    crash(intensity) { noiseBurst(0.18, Math.min(0.6, 0.2 + intensity * 0.4), 500); },
    pickup() { tone(880, 0.12, 'sine', 0.25); tone(1318, 0.18, 'sine', 0.22, 0.09); },
    cash() { tone(988, 0.1, 'triangle', 0.25); tone(1319, 0.1, 'triangle', 0.25, 0.08); tone(1760, 0.22, 'triangle', 0.25, 0.16); },
    missionStart() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.11)); },
    missionDone() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.28, i * 0.12)); },
    missionFail() { [392, 330, 262].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.16, i * 0.16)); },
    horn() { tone(370, 0.16, 'square', 0.12); tone(466, 0.16, 'square', 0.12); },
    busted() { tone(220, 0.5, 'sawtooth', 0.2); tone(165, 0.7, 'sawtooth', 0.2, 0.4); },
  };
}
