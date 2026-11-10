import { describe, it, expect } from 'vitest';
import { VERSION } from './index.js';

describe('core setup', () => {
  it('exports version', () => {
    expect(VERSION).toBe('1.0.0');
  });
});

