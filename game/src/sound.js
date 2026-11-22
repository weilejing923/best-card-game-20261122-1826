// Tiny WebAudio chimes — no audio files, just oscillators, so the game stays
// fully offline. Every call is guarded: a browser that refuses audio (or has
// none) simply plays in silence.

let context = null;

function audio() {
  if (context) return context;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    context = new AC();
    return context;
  } catch {
    return null;
  }
}

function tone(freq, start, length, type = 'sine', gain = 0.08) {
  const ac = audio();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    const t0 = ac.currentTime + start;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.02);
  } catch {
    // Silence is an acceptable soundtrack.
  }
}

export function soundClick() { tone(660, 0, 0.07, 'triangle', 0.05); }
export function soundFlip() { tone(392, 0, 0.09, 'triangle'); tone(587, 0.07, 0.1, 'triangle'); }
export function soundWin() { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.2); }
export function soundLose() { tone(392, 0, 0.14, 'sawtooth', 0.04); tone(311, 0.12, 0.14, 'sawtooth', 0.04); tone(233, 0.24, 0.24, 'sawtooth', 0.04); }
export function soundClash() { tone(196, 0, 0.16, 'square', 0.05); tone(147, 0.05, 0.18, 'square', 0.05); }
