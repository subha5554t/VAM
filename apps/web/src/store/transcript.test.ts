import { describe, it, expect } from 'vitest';
import { sanitizeTranscript, appendFragment } from './transcript.js';

describe('sanitizeTranscript', () => {
  it('removes Gemini stage-direction artifacts', () => {
    expect(sanitizeTranscript('<no speech>')).toBe('');
    expect(sanitizeTranscript('{pause}')).toBe('');
    expect(sanitizeTranscript('Aapke orders drop huye <no speech> hain')).toBe('Aapke orders drop huye hain');
    expect(sanitizeTranscript('Theek hai. {pause} Main check karti hoon.')).toBe(
      'Theek hai. Main check karti hoon.'
    );
  });

  it('collapses whitespace so no double spaces reach the UI', () => {
    expect(sanitizeTranscript('  Namaste   Rajesh  ji ')).toBe('Namaste Rajesh ji');
  });

  it('strips zero-width and control characters', () => {
    expect(sanitizeTranscript('Namaste\u200B Rajesh')).toBe('Namaste Rajesh');
    expect(sanitizeTranscript('a\u0000b')).toBe('ab');
  });

  it('is case-insensitive for artifacts', () => {
    expect(sanitizeTranscript('Hello <NO SPEECH> there')).toBe('Hello there');
  });
});

describe('appendFragment', () => {
  it('joins word fragments with exactly one space', () => {
    expect(appendFragment('Namaste', 'Rajesh ji')).toBe('Namaste Rajesh ji');
    expect(appendFragment('Namaste Rajesh ji.', 'Aapke orders')).toBe('Namaste Rajesh ji. Aapke orders');
  });

  it('never doubles a space when the chunk already starts or ends with one', () => {
    expect(appendFragment('Hello ', 'world')).toBe('Hello world');
    expect(appendFragment('Hello', ' world')).toBe('Hello world');
  });

  it('does not insert a space before punctuation', () => {
    expect(appendFragment('Aapke orders', '.')).toBe('Aapke orders.');
    expect(appendFragment('32', '%')).toBe('32%');
  });

  it('handles empty operands', () => {
    expect(appendFragment('', 'Namaste')).toBe('Namaste');
    expect(appendFragment('Namaste', '')).toBe('Namaste');
  });
});
