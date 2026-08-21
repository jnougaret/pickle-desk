import { describe, expect, it } from 'vitest';
import { generatePools, hasPoolsForDivisions } from './poolAssignment';
import type { Pool, Team } from './types';

const teams: Team[] = [
  { id: 'team-1', divisionId: 'division-1', name: 'Team 1' },
  { id: 'team-2', divisionId: 'division-1', name: 'Team 2' }
];

describe('pool generation state', () => {
  it('recognizes a generated single pool for a division', () => {
    const generated = generatePools('division-1', teams, 1, () => 0.42);

    expect(generated.pools).toHaveLength(1);
    expect(hasPoolsForDivisions(['division-1'], generated.pools)).toBe(true);
  });

  it('requires every division to have a pool in the all-divisions view', () => {
    const pools: Pool[] = [
      { id: 'pool-1', divisionId: 'division-1', name: 'Pool A', sortOrder: 0 },
      { id: 'pool-2', divisionId: 'division-2', name: 'Pool A', sortOrder: 0 }
    ];

    expect(hasPoolsForDivisions(['division-1'], pools)).toBe(true);
    expect(hasPoolsForDivisions(['division-1', 'division-2'], pools)).toBe(true);
    expect(hasPoolsForDivisions(['division-1', 'division-3'], pools)).toBe(false);
    expect(hasPoolsForDivisions([], pools)).toBe(false);
  });
});
