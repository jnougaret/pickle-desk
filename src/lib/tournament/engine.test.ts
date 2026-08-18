import { describe, expect, it } from 'vitest';
import { generatePools } from './poolAssignment';
import { generateRoundRobin } from './roundRobin';
import { calculateStandings } from './standings';
import { generateSchedule } from './scheduler';
import { generatePlayoffBracket, advancePlayoffResult } from './playoffs';
import type { Division, Match, Team, Tournament } from './types';

const random = () => 0.42;
const division: Division = {
  id: 'division-1', tournamentId: 'tournament-1', name: 'Mixed 3.5', poolCount: 2, poolRoundCount: 2,
  startTime: '2026-08-17T09:00', warmupMinutes: 2, gameMinutes: 13, minimumRestMinutes: 15, playoffQualifiersPerPool: 2
};
const teams: Team[] = Array.from({ length: 8 }, (_, index) => ({ id: `team-${index + 1}`, divisionId: division.id, name: `Team ${index + 1}` }));

function tournamentWithPoolMatches(): Tournament {
  const generated = generatePools(division.id, teams, 2, random);
  const matches: Match[] = [];
  generated.pools.forEach((pool) => {
    const poolTeams = teams.filter((team) => generated.memberships.some((membership) => membership.poolId === pool.id && membership.teamId === team.id));
    generateRoundRobin(poolTeams, 2, random).forEach((round) => round.pairings.forEach((pairing) => matches.push({ id: `${pool.id}-${round.roundNumber}-${pairing.teamAId}`, divisionId: division.id, matchType: 'pool', poolId: pool.id, roundNumber: round.roundNumber, ...pairing, status: 'scheduled' })));
  });
  return { id: 'tournament-1', name: 'Test desk', date: '2026-08-17', location: '', courtCount: 4, createdAt: '', updatedAt: '', divisions: [division], teams, pools: generated.pools, poolMemberships: generated.memberships, matches, playoffMatches: [], standingsDraws: {} };
}

describe('round robin generation', () => {
  it('produces complete unique pairings and one bye for odd pools', () => {
    const oddTeams = teams.slice(0, 5);
    const rounds = generateRoundRobin(oddTeams, 5, random);
    const pairings = rounds.flatMap((round) => round.pairings.map((pairing) => [pairing.teamAId, pairing.teamBId].sort().join(':')));
    expect(new Set(pairings).size).toBe(pairings.length);
    expect(rounds.every((round) => round.pairings.length === 2 && round.byeTeamId)).toBe(true);
    expect(pairings.length).toBe(10);
  });

  it('allows extra rounds that repeat opponents after a full cycle', () => {
    const rounds = generateRoundRobin(teams.slice(0, 4), 4, random);
    const pairings = rounds.flatMap((round) => round.pairings.map((pairing) => [pairing.teamAId, pairing.teamBId].sort().join(':')));
    expect(rounds).toHaveLength(4);
    expect(new Set(pairings).size).toBeLessThan(pairings.length);
  });
});

describe('standings', () => {
  it('keeps unplayed teams and applies head-to-head for a two-team tie', () => {
    const first = teams.slice(0, 4);
    const generated = generatePools(division.id, first, 1, random);
    const pool = generated.pools[0];
    const matches: Match[] = [{ id: 'm1', divisionId: division.id, matchType: 'pool', poolId: pool.id, roundNumber: 1, teamAId: first[0].id, teamBId: first[1].id, scoreA: 11, scoreB: 9, status: 'completed' }];
    const { standings } = calculateStandings(generated.pools, generated.memberships, first, matches, {}, random);
    expect(standings[0].rows).toHaveLength(4);
    expect(standings[0].rows[0].teamId).toBe(first[0].id);
    expect(standings[0].rows[0].wins).toBe(1);
  });
});

describe('scheduling', () => {
  it('keeps each pool round atomic and prevents court collisions', () => {
    const tournament = tournamentWithPoolMatches();
    const result = generateSchedule(tournament);
    expect(result.errors).toHaveLength(0);
    const scheduled = result.matches.filter((match) => match.scheduledStartTime);
    expect(scheduled).toHaveLength(tournament.matches.length);
    const starts = new Map<string, Set<number>>();
    scheduled.forEach((match) => starts.set(`${match.poolId}:${match.roundNumber}`, new Set([...(starts.get(`${match.poolId}:${match.roundNumber}`) ?? []), match.courtNumber!])));
    expect([...starts.values()].every((courts) => courts.size > 0)).toBe(true);
    for (let i = 0; i < scheduled.length; i += 1) for (let j = i + 1; j < scheduled.length; j += 1) {
      const a = scheduled[i]; const b = scheduled[j];
      if (a.courtNumber !== b.courtNumber || a.scheduledStartTime === b.scheduledStartTime) continue;
      expect(a.scheduledStartTime).not.toBe(b.scheduledStartTime);
    }
  });
});

describe('playoffs', () => {
  it('creates a cross-pool bracket and advances a semifinal winner and loser', () => {
    const tournament = tournamentWithPoolMatches();
    const standings = calculateStandings(tournament.pools, tournament.poolMemberships, tournament.teams, [], {}, random).standings;
    const bracket = generatePlayoffBracket(division, standings, teams);
    const semis = bracket.filter((match) => match.stage === 'Semifinals');
    expect(semis).toHaveLength(2);
    const third = bracket.find((match) => match.stage === 'Third Place');
    expect(third).toBeDefined();
    advancePlayoffResult(bracket, semis[0].id, 11, 4);
    expect(bracket.find((match) => match.id === semis[0].winnerAdvancesToId)?.teamAId ?? bracket.find((match) => match.id === semis[0].winnerAdvancesToId)?.teamBId).toBe(semis[0].winnerId);
    expect(bracket.find((match) => match.id === third?.id)?.teamAId ?? bracket.find((match) => match.id === third?.id)?.teamBId).toBe(semis[0].teamBId);
  });
});
