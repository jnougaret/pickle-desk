export type MatchType = 'pool' | 'playoff';
export type MatchStatus = 'scheduled' | 'completed';
export type PlayoffStage = 'Opening Round' | 'Quarterfinals' | 'Semifinals' | 'Championship' | 'Third Place';

export interface Tournament {
  id: string;
  name: string;
  date: string;
  location: string;
  courtCount: number;
  createdAt: string;
  updatedAt: string;
  divisions: Division[];
  teams: Team[];
  pools: Pool[];
  poolMemberships: PoolMembership[];
  matches: Match[];
  playoffMatches: PlayoffMatch[];
  standingsDraws: Record<string, number>;
}

export interface Division {
  id: string;
  tournamentId: string;
  name: string;
  poolCount: number;
  poolRoundCount: number;
  startTime: string;
  warmupMinutes: number;
  gameMinutes: number;
  minimumRestMinutes: number;
  playoffQualifiersPerPool: number;
}

export interface Team {
  id: string;
  divisionId: string;
  name: string;
}

export interface Pool {
  id: string;
  divisionId: string;
  name: string;
  sortOrder: number;
}

export interface PoolMembership {
  poolId: string;
  teamId: string;
}

export interface Match {
  id: string;
  divisionId: string;
  matchType: MatchType;
  poolId?: string;
  roundNumber: number;
  teamAId?: string;
  teamBId?: string;
  courtNumber?: number;
  scheduledStartTime?: string;
  scoreA?: number;
  scoreB?: number;
  status: MatchStatus;
}

export interface PlayoffMatch extends Match {
  matchType: 'playoff';
  stage: PlayoffStage;
  bracketPosition: number;
  sourceMatchAId?: string;
  sourceMatchBId?: string;
  winnerAdvancesToId?: string;
  loserAdvancesToId?: string;
  winnerSlot?: 'A' | 'B';
  loserSlot?: 'A' | 'B';
  placeholderA?: string;
  placeholderB?: string;
  isBye?: boolean;
  winnerId?: string;
}

export interface RoundRobinPairing {
  teamAId: string;
  teamBId: string;
}

export interface RoundRobinRound {
  roundNumber: number;
  pairings: RoundRobinPairing[];
  byeTeamId?: string;
}

export interface StandingRow {
  teamId: string;
  teamName: string;
  poolId: string;
  poolName: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
  rank: number;
}

export interface PoolStandings {
  poolId: string;
  poolName: string;
  rows: StandingRow[];
}

export interface ScheduleError {
  divisionId: string;
  divisionName: string;
  poolId?: string;
  poolName?: string;
  message: string;
}
