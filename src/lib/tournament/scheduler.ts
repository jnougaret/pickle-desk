import type { Division, Match, ScheduleError, Tournament } from './types';

const MS_PER_MINUTE = 60_000;

function timeValue(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.parse(`1970-01-01T${value}`);
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function duration(division: Division): number {
  return (division.warmupMinutes + division.gameMinutes) * MS_PER_MINUTE;
}

function rest(division: Division): number {
  return division.minimumRestMinutes * MS_PER_MINUTE;
}

interface Unit {
  division: Division;
  poolId: string;
  poolName: string;
  roundNumber: number;
  matches: Match[];
  readyAt: number;
}

export function validateScheduleInputs(tournament: Tournament): ScheduleError[] {
  const errors: ScheduleError[] = [];
  for (const division of tournament.divisions) {
    const pools = tournament.pools.filter((pool) => pool.divisionId === division.id);
    for (const pool of pools) {
      const maxSimultaneous = tournament.matches.filter((match) => match.divisionId === division.id && match.poolId === pool.id && match.matchType === 'pool')
        .reduce((max, match) => Math.max(max, match.roundNumber), 0);
      for (let round = 1; round <= maxSimultaneous; round += 1) {
        const count = tournament.matches.filter((match) => match.poolId === pool.id && match.roundNumber === round && match.matchType === 'pool').length;
        if (count > tournament.courtCount) {
          errors.push({ divisionId: division.id, divisionName: division.name, poolId: pool.id, poolName: pool.name, message: `${pool.name} requires ${count} simultaneous courts in round ${round}, but this tournament has only ${tournament.courtCount} courts.` });
        }
      }
    }
  }
  return errors;
}

export function generateSchedule(tournament: Tournament): { matches: Match[]; errors: ScheduleError[] } {
  const errors = validateScheduleInputs(tournament);
  if (errors.length) return { matches: tournament.matches, errors };
  const divisions = new Map(tournament.divisions.map((division) => [division.id, division]));
  const pools = new Map(tournament.pools.map((pool) => [pool.id, pool]));
  const units: Unit[] = [];
  for (const division of tournament.divisions) {
    const divisionPools = tournament.pools.filter((pool) => pool.divisionId === division.id);
    for (const pool of divisionPools) {
      const roundNumbers = [...new Set(tournament.matches.filter((match) => match.poolId === pool.id && match.matchType === 'pool').map((match) => match.roundNumber))].sort((a, b) => a - b);
      roundNumbers.forEach((roundNumber) => units.push({
        division, poolId: pool.id, poolName: pool.name, roundNumber,
        matches: tournament.matches.filter((match) => match.poolId === pool.id && match.roundNumber === roundNumber && match.matchType === 'pool'),
        readyAt: timeValue(division.startTime)
      }));
    }
  }

  const schedule: Match[] = tournament.matches.map((match): Match => ({ ...match, scheduledStartTime: undefined, courtNumber: undefined }));
  const courtsAvailableAt = Array.from({ length: tournament.courtCount }, () => 0);
  const teamAvailableAt = new Map<string, number>();
  const poolLastEnd = new Map<string, number>();
  const done = new Set<string>();
  let fairnessCursor = -1;
  let safety = 0;
  while (done.size < units.length && safety < units.length * 10 + 10) {
    safety += 1;
    const nextTimes = units.filter((unit) => !done.has(`${unit.poolId}:${unit.roundNumber}`)).map((unit) => {
      const previous = poolLastEnd.get(unit.poolId) ?? 0;
      const teamReady = Math.max(...unit.matches.flatMap((match) => [match.teamAId, match.teamBId].filter(Boolean).map((teamId) => teamAvailableAt.get(teamId!) ?? 0)), 0);
      return { unit, readyAt: Math.max(timeValue(unit.division.startTime), previous + rest(unit.division), teamReady) };
    });
    if (!nextTimes.length) break;
    const earliest = Math.min(...nextTimes.map((item) => item.readyAt));
    const feasible = nextTimes.filter((item) => item.readyAt <= earliest);
    let selected = feasible.find((item) => item.unit.division.id === tournament.divisions[(fairnessCursor + 1) % Math.max(1, tournament.divisions.length)]?.id);
    if (!selected) selected = feasible[0];
    fairnessCursor = tournament.divisions.findIndex((division) => division.id === selected.unit.division.id);
    const matchDuration = duration(selected.unit.division);
    const start = Math.max(selected.readyAt, Math.min(...courtsAvailableAt));
    const availableCourtIndexes = courtsAvailableAt.map((availableAt, index) => ({ availableAt, index })).filter((court) => court.availableAt <= start).map((court) => court.index);
    if (availableCourtIndexes.length < selected.unit.matches.length) {
      const nextCourtTime = Math.min(...courtsAvailableAt.filter((availableAt) => availableAt > start));
      selected.readyAt = nextCourtTime;
      poolLastEnd.set(selected.unit.poolId, nextCourtTime - rest(selected.unit.division));
      continue;
    }
    const end = start + matchDuration;
    selected.unit.matches.forEach((match, index) => {
      const target = schedule.find((item) => item.id === match.id);
      if (!target) return;
      const courtIndex = availableCourtIndexes[index];
      target.courtNumber = courtIndex + 1;
      target.scheduledStartTime = formatDateTime(start);
      courtsAvailableAt[courtIndex] = end;
      if (target.teamAId) teamAvailableAt.set(target.teamAId, end + rest(selected.unit.division));
      if (target.teamBId) teamAvailableAt.set(target.teamBId, end + rest(selected.unit.division));
    });
    poolLastEnd.set(selected.unit.poolId, end);
    done.add(`${selected.unit.poolId}:${selected.unit.roundNumber}`);
  }

  return { matches: schedule, errors: [] };
}
