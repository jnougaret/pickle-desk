// Compatibility entrypoint for persistence imports. Concrete adapters live in
// browserRepository.ts and tauriRepository.ts; application code should use the
// async repository factory rather than storage-specific functions.
export { createTournamentRepository } from './repository';
export type { TournamentRepository } from './repository';
export {
  exportTournament,
  parseTournamentJson,
  readTournamentFile,
  serializeTournament,
  toTournamentFile,
  validateTournament,
  TOURNAMENT_FILE_FORMAT,
  TOURNAMENT_SCHEMA_VERSION
} from './fileFormat';
