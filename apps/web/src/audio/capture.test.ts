import { describe, it, expect } from 'vitest';
import { downsampleTo16k, pickBestInput, type InputProbe } from './capture.js';

describe('downsampleTo16k', () => {
  it('passes native 16 kHz audio through unchanged in length', () => {
    const input = new Float32Array(1600).fill(0.5);
    const out = downsampleTo16k(input, 16000);
    expect(out.length).toBe(1600);
    expect(out[0]).toBeGreaterThan(16000);
  });

  it('decimates 48 kHz audio to one third of the samples', () => {
    const input = new Float32Array(4800).fill(0.25);
    const out = downsampleTo16k(input, 48000);
    expect(out.length).toBe(1600);
  });

  it('handles a 44.1 kHz device without a 48 kHz assumption', () => {
    const input = new Float32Array(4410).fill(0.5);
    const out = downsampleTo16k(input, 44100);
    expect(out.length).toBe(1600);
    expect(out[0]).toBeGreaterThan(16000);
  });

  it('preserves a constant DC level (box filter has unity gain)', () => {
    const input = new Float32Array(4800).fill(-0.5);
    const out = downsampleTo16k(input, 48000);
    // -0.5 * 0x8000 = -16384
    for (let i = 0; i < out.length; i++) {
      expect(Math.abs(out[i] - -16384)).toBeLessThanOrEqual(1);
    }
  });

  it('attenuates content above the 8 kHz Nyquist limit instead of aliasing it', () => {
    const rate = 48000;
    const freq = 14000; // above 8 kHz -> must not survive decimation
    const samples = 4800;
    const input = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      input[i] = Math.sin((2 * Math.PI * freq * i) / rate);
    }

    const out = downsampleTo16k(input, rate);

    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));

    // Nearest-neighbour decimation would preserve ~full amplitude (32767).
    expect(peak).toBeLessThan(0.3 * 32767);
  });

  it('clamps out-of-range input rather than wrapping', () => {
    const input = new Float32Array([2, -2, 2, -2]);
    const out = downsampleTo16k(input, 16000);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(-32768);
      expect(out[i]).toBeLessThanOrEqual(32767);
    }
  });
});

const probe = (overrides: Partial<InputProbe> = {}): InputProbe => ({
  deviceId: 'mic-1',
  label: 'Microphone 1',
  peakLevel: 0,
  sampleRate: 48000,
  relaxed: false,
  muted: false,
  ...overrides,
});

describe('pickBestInput', () => {
  it('returns the loudest working input', () => {
    const best = pickBestInput([
      probe({ deviceId: 'quiet', peakLevel: 0.0001 }),
      probe({ deviceId: 'loud', peakLevel: 0.08 }),
      probe({ deviceId: 'medium', peakLevel: 0.04 }),
    ]);

    expect(best?.deviceId).toBe('loud');
  });

  it('ignores silent and failed inputs', () => {
    const best = pickBestInput([
      probe({ deviceId: 'dead', peakLevel: 0 }),
      probe({ deviceId: 'busy', peakLevel: 1, error: 'NotReadableError' }),
    ]);

    expect(best).toBeNull();
  });

  it('prefers a relaxed probe when the processed stream is silent', () => {
    const best = pickBestInput([
      probe({ deviceId: 'array', relaxed: false, peakLevel: 0 }),
      probe({ deviceId: 'array', relaxed: true, peakLevel: 0.02 }),
    ]);

    expect(best?.relaxed).toBe(true);
    expect(best?.deviceId).toBe('array');
  });
});
