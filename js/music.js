export const BPM = 124;
export const SCALE = [0, 2, 3, 5, 7, 8, 10];
export function hash(text) {
  let n = 2166136261;
  for (const c of text.toLowerCase()) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function scaleNote(degree, root = 33) {
  return root + SCALE[((degree % 7) + 7) % 7] + 12 * Math.floor(degree / 7);
}
export function frequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }
export function nextStep(time, start, bpm = BPM) {
  return Math.max(0, Math.floor((time - start) / (60 / bpm / 4) + 1e-9) + 1);
}
export function identity(name) {
  const n = hash(name);
  return { instrument: ['bass', 'pluck', 'lead', 'pad', 'arp'][n % 5], pan: (n % 101) / 100 * 1.2 - 0.6 };
}
