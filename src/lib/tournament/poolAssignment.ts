import type { Match, Pool, PoolMembership, Team } from './types';
import { newId, shuffle } from './id';

export function poolLabel(index: number): string {
  let label = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return `Pool ${label}`;
}

export function generatePools(
  divisionId: string,
  teams: Team[],
  poolCount: number,
  random: () => number = Math.random
): { pools: Pool[]; memberships: PoolMembership[] } {
  if (poolCount < 1) throw new Error('A division needs at least one pool.');
  if (poolCount > Math.max(1, teams.length)) throw new Error('A division cannot have more pools than teams.');

  const pools = Array.from({ length: poolCount }, (_, index) => ({
    id: newId('pool'),
    divisionId,
    name: poolLabel(index),
    sortOrder: index
  }));
  const memberships: PoolMembership[] = [];
  shuffle(teams, random).forEach((team, index) => {
    memberships.push({ poolId: pools[index % poolCount].id, teamId: team.id });
  });
  return { pools, memberships };
}

export function teamsInPool(poolId: string, memberships: PoolMembership[], teams: Team[]): Team[] {
  const teamIds = new Set(memberships.filter((m) => m.poolId === poolId).map((m) => m.teamId));
  return teams.filter((team) => teamIds.has(team.id));
}

export function hasPoolsForDivisions(divisionIds: string[], pools: Pool[]): boolean {
  return divisionIds.length > 0 && divisionIds.every((divisionId) => pools.some((pool) => pool.divisionId === divisionId));
}

export function hasPoolMatchesForDivisions(divisionIds: string[], matches: Match[]): boolean {
  return divisionIds.length > 0 && divisionIds.every((divisionId) => matches.some((match) => match.divisionId === divisionId));
}
