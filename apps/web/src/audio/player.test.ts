import { describe, it, expect } from 'vitest';
import { AudioPlayer } from './player.js';

describe('AudioPlayer (Gapless 24kHz with Barge-In Flush)', () => {
  it('instantiates cleanly without errors', () => {
    const player = new AudioPlayer(24000);
    expect(player).toBeDefined();
    expect(player.isPlaying()).toBe(false);
  });

  it('can set mute state', () => {
    const player = new AudioPlayer(24000);
    player.setMute(true);
    expect(player).toBeDefined();
    player.setMute(false);
  });

  it('flushes cleanly on barge-in / interruption', () => {
    const player = new AudioPlayer(24000);
    player.flush();
    expect(player.isPlaying()).toBe(false);
  });
});
