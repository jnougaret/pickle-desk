import { BrowserTournamentRepository } from './browserRepository';
import type { Tournament } from './types';

export interface TournamentRepository {
  list(): Promise<Tournament[]>;
  get(id: string): Promise<Tournament | null>;
  save(tournament: Tournament): Promise<void>;
  delete(id: string): Promise<void>;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

class LazyTauriTournamentRepository implements TournamentRepository {
  private readonly delegate = import('./tauriRepository').then(({ TauriTournamentRepository }) => new TauriTournamentRepository());

  async list(): Promise<Tournament[]> { return (await this.delegate).list(); }
  async get(id: string): Promise<Tournament | null> { return (await this.delegate).get(id); }
  async save(tournament: Tournament): Promise<void> { return (await this.delegate).save(tournament); }
  async delete(id: string): Promise<void> { return (await this.delegate).delete(id); }
}

export function createTournamentRepository(): TournamentRepository {
  return isTauriRuntime() ? new LazyTauriTournamentRepository() : new BrowserTournamentRepository();
}
