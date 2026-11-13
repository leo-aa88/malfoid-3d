/*
 * Loudness over time of a decoded sound: what moves a speaker's mouth. Pure (no Web Audio
 * objects needed beyond the sample data), so it is unit-tested.
 */

/** loudness envelopes are sampled this often (per second) */
export const ENVELOPE_RATE = 100;

export interface Samples {
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(c: number): Float32Array;
}

/** RMS loudness per 1 / ENVELOPE_RATE s of a buffer's [start, end), scaled so the 95th percentile is 1 */
export function loudnessEnvelope(buffer: Samples, start: number, end: number): Float32Array {
  const sr = buffer.sampleRate;
  const hop = Math.max(1, Math.round(sr / ENVELOPE_RATE));
  const i0 = Math.floor(start * sr);
  const n = Math.max(0, Math.floor(((end - start) * sr) / hop));
  const out = new Float32Array(n);
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = i0 + f * hop, e = i + hop; i < e; i++) {
      let x = 0;
      for (const ch of chans) x += ch[i] ?? 0;
      x /= chans.length;
      sum += x * x;
    }
    out[f] = Math.sqrt(sum / hop);
  }
  const sorted = Array.from(out).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
  for (let f = 0; f < n; f++) out[f] = Math.min(1.5, out[f] / ref);
  return out;
}
