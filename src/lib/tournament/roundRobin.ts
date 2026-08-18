import type { RoundRobinRound, Team } from './types';
import { shuffle } from './id';

export function maxRoundRobinRounds(teamCount: number): number {
  return teamCount % 2 === 0 ? Math.max(0, teamCount - 1) : teamCount;
}

export function generateRoundRobin(
  teams: Team[],
  requestedRounds: number,
  random: () => number = Math.random
): RoundRobinRound[] {
  if (teams.length < 2) return [];
  if (requestedRounds < 1) {
    throw new Error('Pool-play rounds must be at least 1.');
  }

  const rotation = shuffle(teams.map((team) => team.id), random);
  if (rotation.length % 2 === 1) rotation.push('__BYE__');
  const rounds: RoundRobinRound[] = [];
  for (let roundIndex = 0; roundIndex < requestedRounds; roundIndex += 1) {
    const pairings: { teamAId: string; teamBId: string }[] = [];
    let byeTeamId: string | undefined;
    for (let i = 0; i < rotation.length / 2; i += 1) {
      const left = rotation[i];
      const right = rotation[rotation.length - 1 - i];
      if (left === '__BYE__') byeTeamId = right;
      else if (right === '__BYE__') byeTeamId = left;
      else pairings.push({ teamAId: left, teamBId: right });
    }
    rounds.push({ roundNumber: roundIndex + 1, pairings, byeTeamId });

    // Keep the first position fixed and rotate the remaining positions.
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop()!);
    rotation.splice(0, rotation.length, fixed, ...rest);
  }
  return rounds;
}
