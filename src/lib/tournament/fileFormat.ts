import type { Tournament } from './types';

// Keep the portable file marker stable so files exported by the PWA remain
// readable by the already-shipped v0.1.0 Windows Store app. Browser storage
// uses the current Pickle Desk marker below and the parser accepts both.
export const TOURNAMENT_FILE_FORMAT = 'tournament-desk';
export const TOURNAMENT_STORAGE_FORMAT = 'pickle-desk';
export const TOURNAMENT_SCHEMA_VERSION = 1;

export interface TournamentFileEnvelope {
  format: typeof TOURNAMENT_FILE_FORMAT;
  schemaVersion: typeof TOURNAMENT_SCHEMA_VERSION;
  exportedAt: string;
  tournament: Tournament;
}

interface RecordLike {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Tournament export is missing ${field}.`);
  return value;
}

function requiredArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Tournament export has invalid ${field}.`);
  return value;
}

/** Validate the domain boundary without normalizing nested tournament data. */
export function validateTournament(value: unknown): Tournament {
  if (!isRecord(value)) throw new Error('Tournament export must contain a tournament object.');
  requiredString(value.id, 'an id');
  requiredString(value.name, 'a name');
  requiredString(value.date, 'a date');
  if (typeof value.location !== 'string') throw new Error('Tournament export has invalid location.');
  if (typeof value.courtCount !== 'number' || !Number.isInteger(value.courtCount) || value.courtCount < 1) {
    throw new Error('Tournament export has invalid court count.');
  }
  requiredString(value.createdAt, 'createdAt');
  requiredString(value.updatedAt, 'updatedAt');
  requiredArray(value.divisions, 'divisions');
  requiredArray(value.teams, 'teams');
  requiredArray(value.pools, 'pools');
  requiredArray(value.poolMemberships, 'pool memberships');
  requiredArray(value.matches, 'matches');
  requiredArray(value.playoffMatches, 'playoff matches');
  if (!isRecord(value.standingsDraws)) throw new Error('Tournament export has invalid standings draws.');
  return value as unknown as Tournament;
}

function migrateLegacyTournament(value: RecordLike): Tournament {
  // V1 browser exports were raw Tournament objects. Keep accepting them so
  // users can restore backups made before the versioned envelope existed.
  return validateTournament({
    ...value,
    playoffMatches: value.playoffMatches ?? [],
    standingsDraws: value.standingsDraws ?? {}
  });
}

export function toTournamentFile(tournament: Tournament, exportedAt = new Date().toISOString()): TournamentFileEnvelope {
  return {
    format: TOURNAMENT_FILE_FORMAT,
    schemaVersion: TOURNAMENT_SCHEMA_VERSION,
    exportedAt,
    tournament: validateTournament(tournament)
  };
}

export function parseTournamentJson(text: string): Tournament {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (!isRecord(parsed)) throw new Error('That file is not a valid tournament export.');
  if (parsed.format === TOURNAMENT_FILE_FORMAT || parsed.format === TOURNAMENT_STORAGE_FORMAT) {
    if (parsed.schemaVersion !== TOURNAMENT_SCHEMA_VERSION) {
      throw new Error(`Unsupported tournament export schema version: ${String(parsed.schemaVersion)}.`);
    }
    return validateTournament(parsed.tournament);
  }

  return migrateLegacyTournament(parsed);
}

export function exportTournament(tournament: Tournament): Blob {
  return new Blob([JSON.stringify(toTournamentFile(tournament), null, 2)], { type: 'application/json' });
}

export async function readTournamentFile(file: Pick<File, 'text'>): Promise<Tournament> {
  return parseTournamentJson(await file.text());
}

export function serializeTournament(tournament: Tournament): string {
  return JSON.stringify(toTournamentFile(tournament));
}
