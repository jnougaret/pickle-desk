export const DEFAULT_DIVISION_SETTINGS = {
  poolCount: 2,
  poolRoundCount: 6,
  warmupMinutes: 2,
  gameMinutes: 13,
  minimumRestMinutes: 15,
  playoffQualifiersPerPool: 1
} as const;

export function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startTimeForEventDate(eventDate: string): string {
  return `${eventDate || localDateInputValue()}T09:00`;
}
