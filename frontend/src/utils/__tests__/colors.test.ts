import { describe, it, expect } from 'vitest';
import { cisToColor, cisToRadius } from '../colors';

describe('cisToColor', () => {
  it('returns amber (#f5a623) at CIS 0', () => {
    expect(cisToColor(0).toLowerCase()).toBe('#f5a623');
  });

  it('returns signal red (#c0392b) at CIS 100', () => {
    expect(cisToColor(100).toLowerCase()).toBe('#c0392b');
  });
});

describe('cisToRadius', () => {
  it('returns 8 at CIS 0', () => {
    expect(cisToRadius(0)).toBe(8);
  });

  it('returns 24 at CIS 100', () => {
    expect(cisToRadius(100)).toBe(24);
  });
});
