// Short two-tone "ding" for new notifications, made with the Web Audio API
// (no sound file needed). Browsers only allow sound after the person has touched
// the screen once, so unlockSound() is called on the first tap/click.

let ctx: AudioContext | null = null;
const KEY = "notifSound"; // "off" = muted; anything else = on

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  return ctx;
};

export function unlockSound() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

export const soundEnabled = () => {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
};
export const setSoundEnabled = (on: boolean) => {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
};

export function playNotificationSound() {
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  if (c.state !== "running") return; // not unlocked yet: stay silent rather than error
  const t0 = c.currentTime;
  [[880, 0], [1175, 0.18]].forEach(([freq, delay]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + delay);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.4);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + delay);
    osc.stop(t0 + delay + 0.45);
  });
  try { navigator.vibrate?.([150, 80, 150]); } catch { /* not supported */ }
}
