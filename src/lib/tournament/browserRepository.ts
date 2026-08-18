import { parseTournamentJson, TOURNAMENT_FILE_FORMAT, TOURNAMENT_SCHEMA_VERSION, validateTournament } from './fileFormat';
import type { Tournament } from './types';
import type { TournamentRepository } from './repository';

export const STORAGE_KEY = 'tournament-desk:tournaments';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface BrowserStorageEnvelope {
  format: typeof TOURNAMENT_FILE_FORMAT;
  schemaVersion: typeof TOURNAMENT_SCHEMA_VERSION;
  tournaments: Tournament[];
}

function browserStorage(): StorageLike | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function parseStoredTournaments(raw: string): Tournament[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Saved tournament data is not valid JSON. Exported backups are still available.');
  }

  if (Array.isArray(parsed)) {
    // Migrate the original unversioned localStorage array in memory. It is
    // rewritten in the new envelope on the next successful save.
    return parsed.map((item) => parseTournamentJson(JSON.stringify(item)));
  }

  if (typeof parsed !== 'object' || parsed === null) throw new Error('Saved tournament data has an invalid format.');
  const envelope = parsed as Partial<BrowserStorageEnvelope>;
  if (envelope.format !== TOURNAMENT_FILE_FORMAT || envelope.schemaVersion !== TOURNAMENT_SCHEMA_VERSION || !Array.isArray(envelope.tournaments)) {
    throw new Error('Saved tournament data uses an unsupported schema. Export a backup before continuing.');
  }
  return envelope.tournaments.map(validateTournament);
}

export class BrowserTournamentRepository implements TournamentRepository {
  private readonly storage: StorageLike | undefined;

  constructor(storage: StorageLike | undefined = browserStorage()) {
    this.storage = storage;
  }

  async list(): Promise<Tournament[]> {
    if (!this.storage) return [];
    const raw = this.storage.getItem(STORAGE_KEY);
    return raw ? parseStoredTournaments(raw) : [];
  }

  async get(id: string): Promise<Tournament | null> {
    return (await this.list()).find((tournament) => tournament.id === id) ?? null;
  }

  async save(tournament: Tournament): Promise<void> {
    if (!this.storage) return;
    const valid = validateTournament(tournament);
    const tournaments = (await this.list()).filter((item) => item.id !== valid.id);
    const envelope: BrowserStorageEnvelope = {
      format: TOURNAMENT_FILE_FORMAT,
      schemaVersion: TOURNAMENT_SCHEMA_VERSION,
      tournaments: [valid, ...tournaments]
    };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  }

  async delete(id: string): Promise<void> {
    if (!this.storage) return;
    const tournaments = (await this.list()).filter((item) => item.id !== id);
    const envelope: BrowserStorageEnvelope = {
      format: TOURNAMENT_FILE_FORMAT,
      schemaVersion: TOURNAMENT_SCHEMA_VERSION,
      tournaments
    };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  }
}

export function createBrowserTournamentRepository(storage?: StorageLike): BrowserTournamentRepository {
  return new BrowserTournamentRepository(storage);
}
