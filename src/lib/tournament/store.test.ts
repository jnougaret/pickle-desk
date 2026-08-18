import { describe, expect, it } from 'vitest';
import { BrowserTournamentRepository, STORAGE_KEY, type StorageLike } from './browserRepository';
import {
  exportTournament,
  parseTournamentJson,
  TOURNAMENT_FILE_FORMAT,
  TOURNAMENT_SCHEMA_VERSION
} from './fileFormat';
import type { Tournament } from './types';

function tournament(id = 'tournament-1'): Tournament {
  return {
    id,
    name: 'Saturday Classic',
    date: '2026-08-18',
    location: 'Courts',
    courtCount: 4,
    createdAt: '2026-08-18T12:00:00.000Z',
    updatedAt: '2026-08-18T12:00:00.000Z',
    divisions: [],
    teams: [],
    pools: [],
    poolMemberships: [],
    matches: [],
    playoffMatches: [],
    standingsDraws: {}
  };
}

function memoryStorage(initial?: string): StorageLike {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; }
  };
}

describe('versioned tournament files', () => {
  it('round-trips a tournament in the explicit export envelope', async () => {
    const source = tournament();
    const blob = exportTournament(source);
    const parsed = JSON.parse(await blob.text()) as Record<string, unknown>;

    expect(parsed.format).toBe(TOURNAMENT_FILE_FORMAT);
    expect(parsed.schemaVersion).toBe(TOURNAMENT_SCHEMA_VERSION);
    expect(parseTournamentJson(JSON.stringify(parsed))).toEqual(source);
  });

  it('accepts legacy raw Tournament exports and migrates missing v1 collections safely', () => {
    const source = tournament();
    const { playoffMatches: _playoffMatches, standingsDraws: _standingsDraws, ...legacy } = source;
    expect(parseTournamentJson(JSON.stringify(legacy))).toEqual(source);
  });

  it('rejects malformed JSON and unsupported schema versions', () => {
    expect(() => parseTournamentJson('{not json')).toThrow('not valid JSON');
    expect(() => parseTournamentJson(JSON.stringify({ format: TOURNAMENT_FILE_FORMAT, schemaVersion: 99 }))).toThrow('Unsupported');
    expect(() => parseTournamentJson(JSON.stringify({ id: 'missing-fields' }))).toThrow('missing a name');
  });
});

describe('browser tournament repository contract', () => {
  it('lists, loads, updates, and deletes without changing the domain shape', async () => {
    const storage = memoryStorage();
    const repository = new BrowserTournamentRepository(storage);
    const source = tournament();

    await repository.save(source);
    expect(await repository.list()).toEqual([source]);
    expect(await repository.get(source.id)).toEqual(source);

    const updated = { ...source, name: 'Updated Classic', updatedAt: '2026-08-18T13:00:00.000Z' };
    await repository.save(updated);
    expect(await repository.list()).toEqual([updated]);

    await repository.delete(source.id);
    expect(await repository.list()).toEqual([]);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      format: TOURNAMENT_FILE_FORMAT,
      schemaVersion: TOURNAMENT_SCHEMA_VERSION,
      tournaments: []
    });
  });

  it('reads the original raw localStorage array and rewrites it in the versioned format', async () => {
    const source = tournament();
    const storage = memoryStorage(JSON.stringify([source]));
    const repository = new BrowserTournamentRepository(storage);

    expect(await repository.list()).toEqual([source]);
    await repository.save({ ...source, name: 'Migrated Classic' });
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      format: TOURNAMENT_FILE_FORMAT,
      schemaVersion: TOURNAMENT_SCHEMA_VERSION
    });
  });

  it('does not overwrite malformed saved data while reporting the failure', async () => {
    const storage = memoryStorage('{broken');
    const repository = new BrowserTournamentRepository(storage);

    await expect(repository.list()).rejects.toThrow('Saved tournament data is not valid JSON');
    await expect(repository.save(tournament())).rejects.toThrow('Saved tournament data is not valid JSON');
    expect(storage.getItem(STORAGE_KEY)).toBe('{broken');
  });
});
