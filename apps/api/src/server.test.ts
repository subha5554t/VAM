import { describe, it, expect } from 'vitest';
import { API_VERSION } from './server.js';

describe('api setup', () => {
  it('exports api version', () => {
    expect(API_VERSION).toBe('1.0.0');
  });
});

