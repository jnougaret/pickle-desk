import type { Division, PlayoffMatch, PoolStandings, Team } from './types';
import { newId } from './id';

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function stageFor(round: number, rounds: number, hasOpening: boolean): PlayoffMatch['stage'] {
  if (round === rounds - 1) return 'Championship';
  if (round === rounds - 2) return 'Semifinals';
  if (round === rounds - 3) return 'Quarterfinals';
  return hasOpening ? 'Opening Round' : 'Quarterfinals';
}

function snakeQualifiers(standings: PoolStandings[], qualifiers: number): { teamId: string; poolId: string; label: string }[] {
  const result: { teamId: string; poolId: string; label: string }[] = [];
  for (let rank = 1; rank <= qualifiers; rank += 1) {
    const rows = standings.map((pool) => pool.rows.find((row) => row.rank === rank)).filter(Boolean);
    const ordered = rank % 2 === 0 ? rows.reverse() : rows;
    ordered.forEach((row) => result.push({ teamId: row!.teamId, poolId: row!.poolId, label: `${row!.poolName} #${rank}` }));
  }
  return result;
}

export function generatePlayoffBracket(
  division: Division,
  standings: PoolStandings[],
  teams: Team[]
): PlayoffMatch[] {
  const qualifierCount = division.playoffQualifiersPerPool * standings.length;
  if (qualifierCount < 2) throw new Error('At least two teams are needed to create playoffs.');
  const qualifiers = snakeQualifiers(standings, division.playoffQualifiersPerPool);
  const slots = nextPowerOfTwo(qualifierCount);
  const rounds = Math.log2(slots);
  const hasOpening = slots > qualifierCount;
  const matches: PlayoffMatch[] = [];
  const firstRound: PlayoffMatch[] = [];
  for (let position = 0; position < slots / 2; position += 1) {
    const a = qualifiers[position];
    const b = qualifiers[slots - 1 - position];
    const match: PlayoffMatch = {
      id: newId('playoff'), divisionId: division.id, matchType: 'playoff', roundNumber: 1,
      status: 'scheduled', stage: stageFor(0, rounds, hasOpening), bracketPosition: position,
      teamAId: a?.teamId, teamBId: b?.teamId,
      placeholderA: a?.label ?? 'BYE', placeholderB: b?.label ?? 'BYE',
      isBye: !a || !b
    };
    firstRound.push(match); matches.push(match);
  }
  const roundMatches: PlayoffMatch[][] = [firstRound];
  for (let round = 1; round < rounds; round += 1) {
    const previous = roundMatches[round - 1];
    const current: PlayoffMatch[] = [];
    for (let position = 0; position < previous.length / 2; position += 1) {
      const match: PlayoffMatch = {
        id: newId('playoff'), divisionId: division.id, matchType: 'playoff', roundNumber: round + 1,
        status: 'scheduled', stage: stageFor(round, rounds, hasOpening), bracketPosition: position,
        sourceMatchAId: previous[position * 2].id, sourceMatchBId: previous[position * 2 + 1].id,
        placeholderA: `Winner of ${previous[position * 2].stage} ${previous[position * 2].bracketPosition + 1}`,
        placeholderB: `Winner of ${previous[position * 2 + 1].stage} ${previous[position * 2 + 1].bracketPosition + 1}`
      };
      previous[position * 2].winnerAdvancesToId = match.id;
      previous[position * 2].winnerSlot = 'A';
      previous[position * 2 + 1].winnerAdvancesToId = match.id;
      previous[position * 2 + 1].winnerSlot = 'B';
      current.push(match); matches.push(match);
    }
    roundMatches.push(current);
  }
  const semis = matches.filter((match) => match.stage === 'Semifinals');
  if (semis.length === 2) {
    const final = matches.find((match) => match.stage === 'Championship')!;
    const third: PlayoffMatch = {
      id: newId('playoff'), divisionId: division.id, matchType: 'playoff', roundNumber: final.roundNumber,
      status: 'scheduled', stage: 'Third Place', bracketPosition: 0,
      sourceMatchAId: semis[0].id, sourceMatchBId: semis[1].id,
      placeholderA: 'Loser of Semifinal 1', placeholderB: 'Loser of Semifinal 2'
    };
    semis[0].loserAdvancesToId = third.id; semis[0].loserSlot = 'A';
    semis[1].loserAdvancesToId = third.id; semis[1].loserSlot = 'B';
    matches.push(third);
  }
  applyByes(matches);
  return matches;
}

export function applyByes(matches: PlayoffMatch[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of matches) {
      if (!match.isBye || match.winnerId || match.status === 'completed') continue;
      const winner = match.teamAId ?? match.teamBId;
      if (!winner) continue;
      match.winnerId = winner;
      match.status = 'completed';
      const downstream = matches.find((item) => item.id === match.winnerAdvancesToId);
      if (downstream && match.winnerSlot) {
        if (match.winnerSlot === 'A') downstream.teamAId = winner;
        else downstream.teamBId = winner;
        changed = true;
      }
    }
  }
}

export function advancePlayoffResult(matches: PlayoffMatch[], matchId: string, scoreA: number, scoreB: number): void {
  if (scoreA === scoreB) throw new Error('Playoff scores cannot be tied.');
  const match = matches.find((item) => item.id === matchId);
  if (!match || !match.teamAId || !match.teamBId) throw new Error('This playoff match is not ready for a result.');
  match.scoreA = scoreA; match.scoreB = scoreB; match.status = 'completed';
  match.winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
  const loserId = scoreA > scoreB ? match.teamBId : match.teamAId;
  const next = matches.find((item) => item.id === match.winnerAdvancesToId);
  if (next && match.winnerSlot) {
    if (match.winnerSlot === 'A') next.teamAId = match.winnerId;
    else next.teamBId = match.winnerId;
  }
  const loserNext = matches.find((item) => item.id === match.loserAdvancesToId);
  if (loserNext && match.loserSlot) {
    if (match.loserSlot === 'A') loserNext.teamAId = loserId;
    else loserNext.teamBId = loserId;
  }
}
