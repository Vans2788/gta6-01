// Synthesised sound: every effect is built from WebAudio oscillators and
// noise, so the game needs no audio files at all. Audio starts on the first
// user gesture, as browsers require.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return !!ctx;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    // exponentialRampToValueAtTime throws for a target at or below zero.
    if (slideTo && slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  return {
    /** Call from any user gesture; safe to call often. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.4;
      return muted;
    },
    shot() {
      noiseBurst(0.14, 0.5, 2600);
      blip(190, 0.09, 'square', 0.22, 60);
    },
    punch() {
      noiseBurst(0.08, 0.35, 500);
    },
    pickup() {
      blip(660, 0.1, 'sine', 0.3, 990);
    },
    cash() {
      blip(880, 0.09, 'sine', 0.28);
      setTimeout(() => blip(1320, 0.14, 'sine', 0.28), 90);
    },
    crash() {
      noiseBurst(0.25, 0.45, 900);
    },
    wasted() {
      blip(320, 0.5, 'sawtooth', 0.25, 70);
    },
    busted() {
      blip(520, 0.18, 'square', 0.2, 380);
      setTimeout(() => blip(520, 0.18, 'square', 0.2, 380), 220);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.3), i * 110));
    },
    /** A continuous engine hum whose pitch follows the car's speed. */
    engine(speedRatio) {
      if (!ensure() || muted) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
      engineGain.gain.setTargetAtTime(speedRatio > 0.03 ? 0.05 + speedRatio * 0.05 : 0, t, 0.1);
    },
    /** The two-tone police siren, on while any wanted level is active. */
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.035;
        sirenOsc.frequency.value = 700;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        let high = false;
        sirenTimer = setInterval(() => {
          high = !high;
          if (sirenOsc) sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
        }, 420);
      } else if (!on && sirenOsc) {
        clearInterval(sirenTimer);
        sirenTimer = null;
        const osc = sirenOsc;
        const gain = sirenGain;
        sirenOsc = null;
        sirenGain = null;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(() => {
          try { osc.stop(); } catch { /* already stopped */ }
        }, 300);
      }
    },
  };
}
