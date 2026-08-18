import { describe, expect, it } from 'vitest';
import { DEFAULT_DIVISION_SETTINGS, startTimeForEventDate } from './defaults';

describe('division defaults', () => {
  it('uses the requested pool and playoff settings', () => {
    expect(DEFAULT_DIVISION_SETTINGS.poolCount).toBe(2);
    expect(DEFAULT_DIVISION_SETTINGS.poolRoundCount).toBe(6);
    expect(DEFAULT_DIVISION_SETTINGS.playoffQualifiersPerPool).toBe(1);
  });

  it('starts divisions at 9:00 AM on the tournament date', () => {
    expect(startTimeForEventDate('2026-08-17')).toBe('2026-08-17T09:00');
  });
});
