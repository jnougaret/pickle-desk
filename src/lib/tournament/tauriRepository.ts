import Database from '@tauri-apps/plugin-sql';
import { parseTournamentJson, serializeTournament, validateTournament } from './fileFormat';
import type { Tournament } from './types';
import type { TournamentRepository } from './repository';

const DATABASE_PATH = 'sqlite:tournament-desk.db';

interface TournamentRow {
  id: string;
  payload: string;
}

export class TauriTournamentRepository implements TournamentRepository {
  private readonly database = Database.load(DATABASE_PATH);

  private async db(): Promise<Awaited<typeof this.database>> {
    return this.database;
  }

  async list(): Promise<Tournament[]> {
    const rows = await (await this.db()).select<TournamentRow[]>(
      'SELECT id, payload FROM tournaments ORDER BY updated_at DESC, id ASC'
    );
    return rows.map((row) => parseTournamentJson(row.payload));
  }

  async get(id: string): Promise<Tournament | null> {
    const rows = await (await this.db()).select<TournamentRow[]>(
      'SELECT id, payload FROM tournaments WHERE id = ? LIMIT 1', [id]
    );
    return rows[0] ? parseTournamentJson(rows[0].payload) : null;
  }

  async save(tournament: Tournament): Promise<void> {
    const valid = validateTournament(tournament);
    await (await this.db()).execute(
      `INSERT INTO tournaments (id, name, updated_at, schema_version, payload)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         updated_at = excluded.updated_at,
         schema_version = excluded.schema_version,
         payload = excluded.payload`,
      [valid.id, valid.name, valid.updatedAt, 1, serializeTournament(valid)]
    );
  }

  async delete(id: string): Promise<void> {
    await (await this.db()).execute('DELETE FROM tournaments WHERE id = ?', [id]);
  }
}
