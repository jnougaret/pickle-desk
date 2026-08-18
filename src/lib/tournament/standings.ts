import type { Match, Pool, PoolStandings, StandingRow, Team } from './types';

type MutableRow = StandingRow & { opponentResults: Map<string, number> };

export function calculateStandings(
  pools: Pool[],
  memberships: { poolId: string; teamId: string }[],
  teams: Team[],
  matches: Match[],
  savedDraws: Record<string, number> = {},
  random: () => number = Math.random
): { standings: PoolStandings[]; draws: Record<string, number> } {
  const draws = { ...savedDraws };
  const byTeam = new Map(teams.map((team) => [team.id, team]));
  const result: PoolStandings[] = [];
  for (const pool of [...pools].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const rows = new Map<string, MutableRow>();
    for (const membership of memberships.filter((item) => item.poolId === pool.id)) {
      const team = byTeam.get(membership.teamId);
      if (!team) continue;
      rows.set(team.id, {
        teamId: team.id,
        teamName: team.name,
        poolId: pool.id,
        poolName: pool.name,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        differential: 0,
        rank: 0,
        opponentResults: new Map()
      });
    }
    for (const match of matches.filter((item) => item.poolId === pool.id && item.status === 'completed')) {
      if (!match.teamAId || !match.teamBId || match.scoreA === undefined || match.scoreB === undefined) continue;
      const a = rows.get(match.teamAId);
      const b = rows.get(match.teamBId);
      if (!a || !b || match.scoreA === match.scoreB) continue;
      a.played += 1; b.played += 1;
      a.pointsFor += match.scoreA; a.pointsAgainst += match.scoreB;
      b.pointsFor += match.scoreB; b.pointsAgainst += match.scoreA;
      a.differential = a.pointsFor - a.pointsAgainst;
      b.differential = b.pointsFor - b.pointsAgainst;
      if (match.scoreA > match.scoreB) {
        a.wins += 1; b.losses += 1;
        a.opponentResults.set(b.teamId, 1); b.opponentResults.set(a.teamId, -1);
      } else {
        b.wins += 1; a.losses += 1;
        b.opponentResults.set(a.teamId, 1); a.opponentResults.set(b.teamId, -1);
      }
    }
    const ordered = [...rows.values()];
    ordered.sort((a, b) => compareRows(a, b, ordered, draws, random));
    ordered.forEach((row, index) => { row.rank = index + 1; });
    result.push({ poolId: pool.id, poolName: pool.name, rows: ordered.map(({ opponentResults: _opponentResults, ...row }) => row) });
  }
  return { standings: result, draws };
}

function compareRows(a: MutableRow, b: MutableRow, allRows: MutableRow[], draws: Record<string, number>, random: () => number): number {
  if (a.wins !== b.wins) return b.wins - a.wins;
  const tied = allRows.filter((row) => row.wins === a.wins);
  if (tied.length === 2) {
    const headToHead = a.opponentResults.get(b.teamId);
    if (headToHead) return headToHead > 0 ? -1 : 1;
  }
  if (a.differential !== b.differential) return b.differential - a.differential;
  if (a.pointsFor !== b.pointsFor) return b.pointsFor - a.pointsFor;
  const key = [a.poolId, ...tied.map((row) => row.teamId).sort()].join(':');
  if (draws[key] === undefined) draws[key] = random();
  const aDraw = draws[`${key}:${a.teamId}`] ?? (draws[`${key}:${a.teamId}`] = random());
  const bDraw = draws[`${key}:${b.teamId}`] ?? (draws[`${key}:${b.teamId}`] = random());
  return bDraw - aDraw;
}
