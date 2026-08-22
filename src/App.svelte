<script lang="ts">
  import { onMount } from 'svelte';
  import pickleDeskMascot from '../pickle-desk-mascot.png';
  import { newId } from './lib/tournament/id';
  import { generatePools, hasPoolMatchesForDivisions, hasPoolsForDivisions, poolLabel, teamsInPool } from './lib/tournament/poolAssignment';
  import { generateRoundRobin } from './lib/tournament/roundRobin';
  import { calculateStandings, type PoolStandings, type StandingRow } from './lib/tournament/standings';
  import { generateSchedule } from './lib/tournament/scheduler';
  import { advancePlayoffResult, applyByes, generatePlayoffBracket } from './lib/tournament/playoffs';
  import { DEFAULT_DIVISION_SETTINGS, localDateInputValue, startTimeForEventDate } from './lib/tournament/defaults';
  import { createTournamentRepository, exportTournament, readTournamentFile } from './lib/tournament/store';
  import type { Division, Match, PlayoffMatch, Pool, Team, Tournament } from './lib/tournament/types';
  import type { CanonicalImportRow, ImportReview, SheetMapping } from './lib/tournament/importPipeline';

  const repository = createTournamentRepository();

  type View = 'overview' | 'divisions' | 'teams' | 'pools' | 'schedule' | 'sheets' | 'results' | 'standings' | 'playoffs';

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '⌂' },
    { id: 'divisions', label: 'Divisions', icon: '◫' },
    { id: 'teams', label: 'Teams', icon: '♧' },
    { id: 'pools', label: 'Pools', icon: '◈' },
    { id: 'schedule', label: 'Schedule', icon: '◷' },
    { id: 'sheets', label: 'Score sheets', icon: '▤' },
    { id: 'results', label: 'Enter results', icon: '✓' },
    { id: 'standings', label: 'Standings', icon: '↗' },
    { id: 'playoffs', label: 'Playoffs', icon: '◇' }
  ];
  const allDivisionViews: View[] = ['teams', 'pools', 'schedule', 'sheets', 'results'];

  let tournaments: Tournament[] = [];
  let tournament: Tournament | null = null;
  let view: View = 'overview';
  let selectedDivisionId = '';
  let toast = '';
  let createOpen = false;
  let importOpen = false;
  let deleteArmed = false;
  let importText = 'division,team\nMixed 3.5,Smith / Jones\nMixed 3.5,Davis / Chen\nMen\'s 4.0,Brown / Lee';
  let importReview: ImportReview | null = null;
  let importFileName = '';
  let importBusy = false;
  let importError = '';
  let newTeamName = '';
  let editingTeamId = '';
  let editingTeamName = '';
  let newDivisionName = '';
  let editingDivisionId = '';
  let editingDivisionName = '';
  let newTournamentName = '';
  let newTournamentDate = localDateInputValue();
  let newTournamentLocation = '';
  let newTournamentCourts = 4;
  let draggedTeamId = '';
  let sheetRound = 'all';
  let resultRound = 'all';
  let resultDrafts: Record<string, { a: string; b: string }> = {};
  let resultErrors: Record<string, string> = {};
  let playoffDrafts: Record<string, { a: string; b: string }> = {};
  let saveQueue: Promise<void> = Promise.resolve();


  $: allDivisionSelected = selectedDivisionId === 'all' && allDivisionViews.includes(view);
  $: currentDivision = tournament?.divisions.find((division) => division.id === selectedDivisionId) ?? tournament?.divisions[0];
  $: divisionTeams = tournament && currentDivision ? tournament.teams.filter((team) => team.divisionId === currentDivision!.id) : [];
  $: divisionPools = tournament && currentDivision ? tournament.pools.filter((pool) => pool.divisionId === currentDivision!.id).sort((a, b) => a.sortOrder - b.sortOrder) : [];
  $: divisionMatches = tournament && currentDivision ? tournament.matches.filter((match) => match.divisionId === currentDivision!.id) : [];
  $: poolViewDivisions = tournament && allDivisionSelected ? tournament.divisions : currentDivision ? [currentDivision] : [];
  $: poolViewPools = tournament ? tournament.pools.filter((pool) => poolViewDivisions.some((division) => division.id === pool.divisionId)).sort((a, b) => a.sortOrder - b.sortOrder) : [];
  $: workingMatches = tournament && allDivisionSelected ? tournament.matches : divisionMatches;
  $: scheduleDivisionIds = tournament && allDivisionSelected ? tournament.divisions.map((division) => division.id) : currentDivision ? [currentDivision.id] : [];
  $: schedulePoolsGenerated = tournament ? hasPoolsForDivisions(scheduleDivisionIds, tournament.pools) : false;
  $: scheduleMatchesGenerated = tournament ? hasPoolMatchesForDivisions(scheduleDivisionIds, tournament.matches) : false;
  $: divisionPlayoffs = tournament && currentDivision ? tournament.playoffMatches.filter((match) => match.divisionId === currentDivision!.id) : [];
  $: openingPlayoffMatches = divisionPlayoffs.filter((match) => match.stage === 'Opening Round').sort((a, b) => a.bracketPosition - b.bracketPosition);
  $: quarterfinalPlayoffMatches = divisionPlayoffs.filter((match) => match.stage === 'Quarterfinals').sort((a, b) => a.bracketPosition - b.bracketPosition);
  $: semifinalPlayoffMatches = divisionPlayoffs.filter((match) => match.stage === 'Semifinals').sort((a, b) => a.bracketPosition - b.bracketPosition);
  $: championshipPlayoffMatches = divisionPlayoffs.filter((match) => match.stage === 'Championship').sort((a, b) => a.bracketPosition - b.bracketPosition);
  $: thirdPlacePlayoffMatches = divisionPlayoffs.filter((match) => match.stage === 'Third Place').sort((a, b) => a.bracketPosition - b.bracketPosition);
  $: isSingleRoundPlayoff = divisionPlayoffs.length > 0
    && new Set(divisionPlayoffs.map((match) => match.roundNumber)).size === 1
    && divisionPlayoffs.every((match) => match.stage === 'Championship');
  $: currentStandings = tournament && currentDivision && divisionPools.length
    ? calculateAndPersistStandings(divisionPools, tournament.poolMemberships, tournament.teams, tournament.matches.filter((match) => match.divisionId === currentDivision!.id), tournament.standingsDraws)
    : [];
  $: scheduleMatches = tournament && currentDivision
    ? workingMatches.filter((match) => match.scheduledStartTime).sort(sortMatches)
    : [];
  $: resultMatches = tournament && currentDivision
    ? workingMatches.filter((match) => match.scheduledStartTime && (resultRound === 'all' || String(match.roundNumber) === resultRound)).sort(sortMatches)
    : [];
  $: sheetMatches = tournament && currentDivision
    ? workingMatches.filter((match) => match.scheduledStartTime && (sheetRound === 'all' || String(match.roundNumber) === sheetRound)).sort(sortMatches)
    : [];
  $: importReadyCount = importReview?.rows.filter((row) => row.included && row.division.trim() && row.team.trim()).length ?? 0;
  $: importWarningCount = importReview?.rows.filter((row) => row.warnings.length > 0).length ?? 0;
  $: importDuplicateCount = importReview?.rows.filter((row) => row.duplicate).length ?? 0;
  $: importUnresolvedCount = importReview?.rows.filter((row) => row.included && (!row.division.trim() || !row.team.trim())).length ?? 0;
  $: importIgnoredCount = (importReview?.ignoredRows.length ?? 0) + (importReview?.rows.filter((row) => !row.included).length ?? 0);
  $: importNewDivisionCount = importReview && tournament ? new Set(importReview.rows.filter((row) => row.included && row.division.trim()).map((row) => importDivisionKey(row.division)).filter((key) => !tournament!.divisions.some((division) => importDivisionKey(division.name) === key))).size : 0;
  $: importCanCommit = Boolean(importReview && !importBusy && !importReview.errors.length && importReadyCount > 0 && importUnresolvedCount === 0);

  onMount(() => { void refreshTournaments(); });

  function notify(message: string): void {
    toast = message;
    window.setTimeout(() => { if (toast === message) toast = ''; }, 3200);
  }

  async function refreshTournaments(): Promise<void> {
    try {
      tournaments = await repository.list();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load saved tournaments.');
    }
  }

  function touch(): void {
    if (!tournament) return;
    tournament = { ...tournament, updatedAt: new Date().toISOString() };
    const saved = tournament;
    saveQueue = saveQueue
      .then(() => repository.save(saved))
      .then(refreshTournaments)
      .catch((error) => notify(error instanceof Error ? error.message : 'Could not save this tournament.'));
  }

  function calculateAndPersistStandings(
    pools: Pool[],
    memberships: { poolId: string; teamId: string }[],
    teams: Team[],
    matches: Match[],
    savedDraws: Record<string, number>
  ): PoolStandings[] {
    const result = calculateStandings(pools, memberships, teams, matches, savedDraws);
    persistStandingsDraws(result.draws);
    return result.standings;
  }

  function persistStandingsDraws(draws: Record<string, number>): void {
    if (!tournament) return;
    const currentKeys = Object.keys(tournament.standingsDraws);
    const nextKeys = Object.keys(draws);
    if (currentKeys.length === nextKeys.length && currentKeys.every((key) => tournament!.standingsDraws[key] === draws[key])) return;
    tournament = { ...tournament, standingsDraws: { ...draws } };
    touch();
  }

  function setWorkingDivision(id: string): void {
    selectedDivisionId = id;
    resultRound = 'all';
    sheetRound = 'all';
  }

  function navigate(nextView: View): void {
    view = nextView;
    if (allDivisionViews.includes(nextView)) {
      selectedDivisionId = 'all';
      resultRound = 'all';
      sheetRound = 'all';
    } else if (selectedDivisionId === 'all') {
      selectedDivisionId = tournament?.divisions[0]?.id ?? '';
    }
  }

  async function createTournament(): Promise<void> {
    if (!newTournamentName.trim() || newTournamentCourts < 1) return;
    const now = new Date().toISOString();
    const created: Tournament = {
      id: newId('tournament'), name: newTournamentName.trim(), date: newTournamentDate,
      location: newTournamentLocation.trim(), courtCount: Number(newTournamentCourts), createdAt: now, updatedAt: now,
      divisions: [], teams: [], pools: [], poolMemberships: [], matches: [], playoffMatches: [], standingsDraws: {}
    };
    try {
      await repository.save(created);
      await refreshTournaments();
      tournament = created; selectedDivisionId = ''; view = 'overview'; createOpen = false;
      newTournamentName = ''; newTournamentDate = localDateInputValue(); newTournamentLocation = ''; newTournamentCourts = 4;
      notify('Tournament created.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create this tournament.');
    }
  }

  function openTournament(item: Tournament): void {
    tournament = structuredClone(item);
    setWorkingDivision(item.divisions[0]?.id ?? '');
    deleteArmed = false;
    view = 'overview';
  }

  function tournamentFilename(item: Tournament): string {
    const safeName = item.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'tournament';
    return `${safeName}.tournament`;
  }

  function downloadTournament(item: Tournament): void {
    const url = URL.createObjectURL(exportTournament(item));
    const link = document.createElement('a');
    link.href = url;
    link.download = tournamentFilename(item);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCurrentTournament(): void {
    if (tournament) downloadTournament(tournament);
  }

  async function armDeleteTournament(): Promise<void> {
    if (!tournament) return;
    if (!deleteArmed) {
      deleteArmed = true;
      return;
    }
    const deleted = tournament;
    downloadTournament(deleted);
    try {
      await repository.delete(deleted.id);
      await refreshTournaments();
      tournament = null;
      view = 'overview';
      selectedDivisionId = '';
      deleteArmed = false;
      resultDrafts = {};
      resultErrors = {};
      playoffDrafts = {};
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete this tournament.');
    }
  }

  function selectDivision(event: Event): void {
    setWorkingDivision((event.target as HTMLSelectElement).value);
  }

  function closeTournament(): void { tournament = null; view = 'overview'; deleteArmed = false; }

  async function importTournamentFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return;
    try {
      const restored = await readTournamentFile(file);
      await repository.save(restored);
      await refreshTournaments();
      openTournament(restored);
      notify('Tournament restored.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not open that tournament.'); }
    input.value = '';
  }

  function addDivision(): void {
    if (!tournament || !newDivisionName.trim()) return;
    const division: Division = { id: newId('division'), tournamentId: tournament.id, name: newDivisionName.trim(), startTime: startTimeForEventDate(tournament.date), ...DEFAULT_DIVISION_SETTINGS };
    tournament = { ...tournament, divisions: [...tournament.divisions, division] }; setWorkingDivision(division.id); newDivisionName = ''; touch(); notify('Division added.');
  }

  function saveDivisionName(): void {
    if (!tournament || !editingDivisionId || !editingDivisionName.trim()) return;
    tournament = { ...tournament, divisions: tournament.divisions.map((division) => division.id === editingDivisionId ? { ...division, name: editingDivisionName.trim() } : division) }; editingDivisionId = ''; touch();
  }

  function updateDivision(field: keyof Division, value: string | number): void {
    if (!tournament || !currentDivision) return;
    const next = tournament.divisions.map((division) => division.id === currentDivision!.id ? { ...division, [field]: value } : division);
    tournament = { ...tournament, divisions: next }; touch();
  }

  function deleteDivision(division: Division): void {
    if (!tournament) return;
    const hasData = tournament.teams.some((team) => team.divisionId === division.id) || tournament.pools.some((pool) => pool.divisionId === division.id) || tournament.matches.some((match) => match.divisionId === division.id);
    if (hasData && !window.confirm(`Delete ${division.name} and its teams, pools, schedule, and results?`)) return;
    const teamIds = new Set(tournament.teams.filter((team) => team.divisionId === division.id).map((team) => team.id));
    const poolIds = new Set(tournament.pools.filter((pool) => pool.divisionId === division.id).map((pool) => pool.id));
    tournament = { ...tournament, divisions: tournament.divisions.filter((item) => item.id !== division.id), teams: tournament.teams.filter((team) => team.divisionId !== division.id), pools: tournament.pools.filter((pool) => pool.divisionId !== division.id), poolMemberships: tournament.poolMemberships.filter((membership) => !poolIds.has(membership.poolId) && !teamIds.has(membership.teamId)), matches: tournament.matches.filter((match) => match.divisionId !== division.id), playoffMatches: tournament.playoffMatches.filter((match) => match.divisionId !== division.id) }; setWorkingDivision(tournament.divisions[0]?.id ?? ''); touch(); notify('Division deleted.');
  }

  function addTeam(): void {
    if (allDivisionSelected) { notify('Select a division before adding a team.'); return; }
    if (!tournament || !currentDivision || !newTeamName.trim()) return;
    const team: Team = { id: newId('team'), divisionId: currentDivision.id, name: newTeamName.trim() };
    tournament = { ...tournament, teams: [...tournament.teams, team] }; newTeamName = ''; touch();
  }

  function saveTeamName(): void {
    if (!tournament || !editingTeamId || !editingTeamName.trim()) return;
    tournament = { ...tournament, teams: tournament.teams.map((team) => team.id === editingTeamId ? { ...team, name: editingTeamName.trim() } : team) }; editingTeamId = ''; touch();
  }

  function removeTeam(team: Team): void {
    if (!tournament) return;
    const dependent = tournament.matches.some((match) => match.teamAId === team.id || match.teamBId === team.id);
    if (dependent && !window.confirm('This team already appears in scheduled matches. Remove it and clear dependent pool data?')) return;
    tournament = { ...tournament, teams: tournament.teams.filter((item) => item.id !== team.id), poolMemberships: tournament.poolMemberships.filter((membership) => membership.teamId !== team.id), matches: tournament.matches.filter((match) => match.teamAId !== team.id && match.teamBId !== team.id), playoffMatches: tournament.playoffMatches.filter((match) => match.teamAId !== team.id && match.teamBId !== team.id) }; touch();
  }

  function moveTeam(teamId: string, poolId: string): void {
    if (!tournament) return;
    const team = tournament.teams.find((item) => item.id === teamId);
    const pool = tournament.pools.find((item) => item.id === poolId);
    if (!team || !pool || team.divisionId !== pool.divisionId) { notify('Teams can only move within their division.'); return; }
    if (tournament.poolMemberships.find((membership) => membership.teamId === teamId)?.poolId === poolId) return;
    const memberships = tournament.poolMemberships.filter((membership) => membership.teamId !== teamId);
    tournament = { ...tournament, poolMemberships: [...memberships, { teamId, poolId }] }; touch();
    draggedTeamId = '';
  }

  function moveTeamFromControl(teamId: string, poolId: string): void {
    moveTeam(teamId, poolId);
  }

  function selectedPoolDivisions(): Division[] {
    if (!tournament) return [];
    return allDivisionSelected ? tournament.divisions : currentDivision ? [currentDivision] : [];
  }

  function poolsForDivision(divisionId: string): Pool[] {
    return tournament?.pools.filter((pool) => pool.divisionId === divisionId).sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
  }

  function regeneratePools(): void {
    if (!tournament) return;
    const divisions = selectedPoolDivisions();
    if (!divisions.length) return;
    const hasMatches = divisions.some((division) => tournament!.matches.some((match) => match.divisionId === division.id));
    const confirmMessage = allDivisionSelected
      ? 'Regenerate pools and discard all divisions’ pool schedules and results?'
      : 'Regenerate pools and discard this division’s pool schedule and results?';
    if (hasMatches && !window.confirm(confirmMessage)) return;
    const divisionsWithTeams = divisions.filter((division) => tournament!.teams.some((team) => team.divisionId === division.id));
    if (!divisionsWithTeams.length) { notify('Add teams before generating pools.'); return; }
    try {
      const generatedByDivision = divisionsWithTeams.map((division) => {
        const teams = tournament!.teams.filter((team) => team.divisionId === division.id);
        try {
          return { division, teams, generated: generatePools(division.id, teams, division.poolCount) };
        } catch (error) {
          throw new Error(`${division.name}: ${error instanceof Error ? error.message : 'Could not generate pools.'}`);
        }
      });
      const generatedDivisionIds = new Set(generatedByDivision.map(({ division }) => division.id));
      const oldPoolIds = new Set(tournament.pools.filter((pool) => generatedDivisionIds.has(pool.divisionId)).map((pool) => pool.id));
      const generatedTeamIds = new Set(generatedByDivision.flatMap(({ teams }) => teams.map((team) => team.id)));
      tournament = {
        ...tournament,
        pools: [...tournament.pools.filter((pool) => !oldPoolIds.has(pool.id)), ...generatedByDivision.flatMap(({ generated }) => generated.pools)],
        poolMemberships: [...tournament.poolMemberships.filter((membership) => !oldPoolIds.has(membership.poolId) && !generatedTeamIds.has(membership.teamId)), ...generatedByDivision.flatMap(({ generated }) => generated.memberships)],
        matches: tournament.matches.filter((match) => !generatedDivisionIds.has(match.divisionId)),
        playoffMatches: tournament.playoffMatches.filter((match) => !generatedDivisionIds.has(match.divisionId))
      };
      touch();
      notify(allDivisionSelected ? `Pools randomized for ${generatedByDivision.length} divisions.` : 'Pools randomized evenly.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not generate pools.'); }
  }

  function createPoolMatches(divisions: Division[]): Match[] {
    if (!tournament) return [];
    const generated: Match[] = [];
    for (const division of divisions) {
      for (const pool of poolsForDivision(division.id)) {
        const poolTeams = teamsInPool(pool.id, tournament.poolMemberships, tournament.teams);
        if (poolTeams.length < 2) continue;
        const rounds = generateRoundRobin(poolTeams, division.poolRoundCount);
        for (const round of rounds) for (const pairing of round.pairings) generated.push({ id: newId('match'), divisionId: division.id, matchType: 'pool', poolId: pool.id, roundNumber: round.roundNumber, teamAId: pairing.teamAId, teamBId: pairing.teamBId, status: 'scheduled' });
      }
    }
    return generated;
  }

  function saveGeneratedMatches(divisions: Division[], generated: Match[]): void {
    if (!tournament) return;
    const divisionIds = new Set(divisions.map((division) => division.id));
    tournament = { ...tournament, matches: [...tournament.matches.filter((match) => !divisionIds.has(match.divisionId)), ...generated], playoffMatches: tournament.playoffMatches.filter((match) => !divisionIds.has(match.divisionId)) };
    touch();
  }

  function generateMatches(): void {
    if (!tournament) return;
    const divisions = selectedPoolDivisions();
    if (!divisions.length) { notify('Generate pools first.'); return; }
    const missingPools = divisions.filter((division) => poolsForDivision(division.id).length === 0);
    if (missingPools.length) { notify(allDivisionSelected ? 'Generate pools for all divisions first.' : 'Generate pools first.'); return; }
    const generated = createPoolMatches(divisions);
    saveGeneratedMatches(divisions, generated);
    notify(`${generated.length} pool matches generated${allDivisionSelected ? ` for ${divisions.length} divisions.` : '.'}`);
  }

  function ensureScheduleMatches(): boolean {
    if (!tournament) return false;
    const divisions = selectedPoolDivisions();
    if (!divisions.length) { notify('Generate pools first.'); return false; }
    const missingPools = divisions.filter((division) => poolsForDivision(division.id).length === 0);
    if (missingPools.length) { notify(allDivisionSelected ? 'Generate pools for all divisions first.' : 'Generate pools first.'); return false; }
    const missingMatches = divisions.filter((division) => !tournament!.matches.some((match) => match.divisionId === division.id));
    if (!missingMatches.length) return true;
    const generated = createPoolMatches(missingMatches);
    const unableToGenerate = missingMatches.filter((division) => !generated.some((match) => match.divisionId === division.id));
    if (unableToGenerate.length) {
      notify(`Add at least two teams to ${unableToGenerate[0].name} before generating matches.`);
      return false;
    }
    saveGeneratedMatches(missingMatches, generated);
    return true;
  }

  function generateTournamentSchedule(): void {
    if (!tournament || !ensureScheduleMatches()) return;
    const result = generateSchedule(tournament);
    if (result.errors.length) { notify(result.errors[0].message); return; }
    tournament = { ...tournament, matches: result.matches }; touch(); navigate('schedule'); notify('Pool schedule generated.');
  }

  function generateBracket(): void {
    if (!tournament || !currentDivision || !divisionPools.length) { notify('Generate pools and matches first.'); return; }
    const standings = calculateAndPersistStandings(divisionPools, tournament.poolMemberships, tournament.teams, divisionMatches, tournament.standingsDraws);
    try {
      const bracket = generatePlayoffBracket(currentDivision, standings, divisionTeams);
      tournament = { ...tournament, playoffMatches: [...tournament.playoffMatches.filter((match) => match.divisionId !== currentDivision!.id), ...bracket] }; touch(); notify('Playoff bracket created.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not create the bracket.'); }
  }

  function scoreDraftFor(match: Match): { a: string; b: string } {
    const draft = resultDrafts[match.id];
    return {
      a: draft?.a ?? (match.scoreA !== undefined ? String(match.scoreA) : ''),
      b: draft?.b ?? (match.scoreB !== undefined ? String(match.scoreB) : '')
    };
  }

  function poolResultError(draft: { a: string; b: string }): string {
    if (!draft.a || !draft.b) return '';
    const scoreA = Number(draft.a); const scoreB = Number(draft.b);
    if (!Number.isInteger(scoreA) || scoreA < 0 || !Number.isInteger(scoreB) || scoreB < 0) return 'Enter two non-negative whole-number scores.';
    return scoreA === scoreB ? 'A match must have one final winner.' : '';
  }

  function updatePoolResultDraft(match: Match, side: 'a' | 'b', value: string): void {
    const draft = { ...scoreDraftFor(match), [side]: value };
    resultDrafts = { ...resultDrafts, [match.id]: draft };
    const error = poolResultError(draft);
    resultErrors = { ...resultErrors, [match.id]: error };
    if (error || !draft.a || !draft.b || !tournament) return;

    const scoreA = Number(draft.a); const scoreB = Number(draft.b);
    const existing = tournament.matches.find((item) => item.id === match.id);
    if (!existing || (existing.status === 'completed' && existing.scoreA === scoreA && existing.scoreB === scoreB)) return;
    tournament = { ...tournament, matches: tournament.matches.map((item) => item.id === match.id ? { ...item, scoreA, scoreB, status: 'completed' } : item) };
    touch();
  }

  function savePlayoffResult(match: PlayoffMatch, showNotice = false): boolean {
    if (!tournament) return false;
    const draft = playoffDrafts[match.id] ?? { a: '', b: '' };
    if (!draft.a || !draft.b) return false;
    const scoreA = Number(draft.a); const scoreB = Number(draft.b);
    if (!Number.isInteger(scoreA) || scoreA < 0 || !Number.isInteger(scoreB) || scoreB < 0 || scoreA === scoreB) {
      if (showNotice) notify('Enter two different non-negative whole-number scores.');
      return false;
    }
    try {
      const matches = structuredClone(tournament.playoffMatches);
      advancePlayoffResult(matches, match.id, scoreA, scoreB); applyByes(matches);
      tournament = { ...tournament, playoffMatches: matches };
      const { [match.id]: _draft, ...remainingDrafts } = playoffDrafts;
      playoffDrafts = remainingDrafts;
      touch();
      if (showNotice) notify('Playoff result saved and bracket advanced.');
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save playoff result.'); return false; }
  }

  function integerInputValue(value: string): string { return value.replace(/[^0-9]/g, ''); }

  function updatePlayoffDraft(match: PlayoffMatch, side: 'a' | 'b', value: string): void {
    const draft = { ...(playoffDrafts[match.id] ?? { a: '', b: '' }), [side]: integerInputValue(value) };
    playoffDrafts = { ...playoffDrafts, [match.id]: draft };
  }

  function editPlayoffResult(match: PlayoffMatch): void {
    playoffDrafts = {
      ...playoffDrafts,
      [match.id]: {
        a: match.scoreA !== undefined ? String(match.scoreA) : '',
        b: match.scoreB !== undefined ? String(match.scoreB) : ''
      }
    };
  }

  function importDivisionKey(value: string): string {
    return value.trim().toLocaleLowerCase().replace(/[’‘`´']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
  }

  function openImport(): void {
    importOpen = true;
    importReview = null;
    importFileName = '';
    importBusy = false;
    importError = '';
    importText = 'division,team\nMixed 3.5,Smith / Jones\nMixed 3.5,Davis / Chen\nMen\'s 4.0,Brown / Lee';
  }

  function closeImport(): void {
    importOpen = false;
    importReview = null;
    importBusy = false;
    importError = '';
  }

  async function handleImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !tournament) return;
    importBusy = true;
    importError = '';
    importReview = null;
    importFileName = file.name;
    try {
      const importer = await import('./lib/tournament/importPipeline');
      importReview = await importer.inspectImportFile(file, tournament.divisions, tournament.teams);
      if (file.name.toLocaleLowerCase().endsWith('.csv') || file.type === 'text/csv') importText = await file.text();
      else importText = '';
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Could not inspect this file.';
    } finally {
      importBusy = false;
      input.value = '';
    }
  }

  async function previewImport(): Promise<void> {
    if (!tournament || !importText.trim()) return;
    importBusy = true;
    importError = '';
    try {
      const importer = await import('./lib/tournament/importPipeline');
      importReview = importer.inspectImportText(importText, tournament.divisions, tournament.teams, 'pasted.csv');
      importFileName = 'pasted.csv';
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Could not inspect the pasted data.';
    } finally {
      importBusy = false;
    }
  }

  function updateImportRow(rowId: string, field: 'division' | 'team', value: string): void {
    if (!importReview) return;
    importReview = { ...importReview, rows: importReview.rows.map((row) => row.id === rowId ? { ...row, [field]: value } : row) };
  }

  function toggleImportRow(row: CanonicalImportRow): void {
    if (!importReview) return;
    importReview = { ...importReview, rows: importReview.rows.map((item) => item.id === row.id ? { ...item, included: !item.included } : item) };
  }

  function toggleImportSheet(mapping: SheetMapping): void {
    if (!importReview) return;
    const selected = !mapping.selected;
    importReview = {
      ...importReview,
      mappings: importReview.mappings.map((item) => item.sheet === mapping.sheet ? { ...item, selected } : item),
      rows: importReview.rows.map((row) => row.source.sheet === mapping.sheet ? { ...row, included: selected && Boolean(row.division.trim() && row.team.trim() && row.confidence !== 'low') } : row),
      ignoredSheets: selected ? importReview.ignoredSheets.filter((item) => item.sheet !== mapping.sheet) : [...importReview.ignoredSheets.filter((item) => item.sheet !== mapping.sheet), { sheet: mapping.sheet, reason: 'Unchecked during review.' }]
    };
  }

  function commitImport(): void {
    if (!tournament || !importReview || !importCanCommit) return;
    try {
      const importerPromise = import('./lib/tournament/importPipeline');
      void importerPromise.then((importer) => {
        if (!tournament || !importReview) return;
        const before = tournament.teams.length;
        const result = importer.commitImportReview(importReview, tournament.divisions, tournament.teams, tournament.id, tournament.date);
        tournament = { ...tournament, divisions: result.divisions, teams: result.teams };
        touch();
        closeImport();
        notify(`${result.teams.length - before} teams imported.`);
      }).catch((error) => notify(error instanceof Error ? error.message : 'Could not import these teams.'));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not import these teams.');
    }
  }

  function sortMatches(a: Match, b: Match): number { return (a.scheduledStartTime ?? '').localeCompare(b.scheduledStartTime ?? '') || (a.courtNumber ?? 0) - (b.courtNumber ?? 0); }
  function divisionName(id?: string): string { return tournament?.divisions.find((division) => division.id === id)?.name ?? 'Unassigned'; }
  function teamName(id?: string): string { return tournament?.teams.find((team) => team.id === id)?.name ?? 'TBD'; }
  function poolName(id?: string): string { return tournament?.pools.find((pool) => pool.id === id)?.name ?? ''; }
  function displayTime(value?: string): string { if (!value) return '—'; return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
  function displayDate(value: string): string { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
  function matchLabel(match: Match): string { return match.matchType === 'playoff' ? (match as PlayoffMatch).stage : `${poolName(match.poolId)} · Round ${match.roundNumber}`; }
  function inputDateTime(value: string): string { return value ? value.slice(0, 16) : ''; }
  function allRounds(matches: Match[]): string[] { return [...new Set(matches.map((match) => String(match.roundNumber)))].sort((a, b) => Number(a) - Number(b)); }
  function divisionStandings(poolId: string): PoolStandings | undefined { return currentStandings.find((pool) => pool.poolId === poolId); }
  function teamPool(teamId: string): Pool | undefined { const membership = tournament?.poolMemberships.find((item) => item.teamId === teamId); return tournament?.pools.find((pool) => pool.id === membership?.poolId); }
  function printSheets(): void { window.print(); }

</script>

<svelte:head>
  <title>{tournament ? tournament.name : 'Pickle Desk'}</title>
</svelte:head>

{#if !tournament}
  <main class="home-shell">

    <section class="home-hero">
      <div class="home-heading"><img class="home-logo" src={pickleDeskMascot} alt="Pickle Desk mascot" /><h1>Pickle Desk</h1></div>
      <div class="home-actions"><button class="button button-primary button-large" on:click={() => createOpen = true}>+ New tournament</button><label class="button button-secondary button-large">↥ Import from file<input type="file" on:change={importTournamentFile} /></label></div>
    </section>
    <section class="recent-section">
      <div class="section-heading"><h2>Tournaments</h2></div>
      {#if tournaments.length}
        <div class="tournament-grid">{#each tournaments as item}<button class="tournament-card" on:click={() => openTournament(item)}><div class="card-accent"></div><div class="card-body"><div class="card-topline"><span class="date-chip">{displayDate(item.date)}</span><span class="arrow">→</span></div><h3>{item.name}</h3><p>{item.location || 'Location not set'}</p><div class="card-stats"><span>{item.divisions.length} divisions</span><span>{item.teams.length} teams</span><span>{item.courtCount} courts</span></div></div></button>{/each}</div>
      {:else}
        <div class="empty-panel home-empty"><h3>No tournaments yet</h3><button class="button button-secondary" on:click={() => createOpen = true}>Create tournament</button></div>
      {/if}
    </section>

  </main>
{:else}
  <div class="app-shell">
    <aside class="sidebar">

      <div class="sidebar-tournament"><strong>{tournament.name}</strong><span class="tournament-date">{displayDate(tournament.date)}</span><span class="tournament-location">{tournament.location || 'Location not set'}</span></div>
      <nav>{#each navItems as item}<button class:active={view === item.id} on:click={() => navigate(item.id)}><span class="nav-icon">{item.icon}</span>{item.label}</button>{/each}<button on:click={exportCurrentTournament}><span class="nav-icon">↧</span>Export</button><button class="mobile-nav-item" on:click={closeTournament}><span class="nav-icon">‹</span>Tournaments</button><button class:confirm={deleteArmed} class="mobile-nav-item" on:click={armDeleteTournament}><span class="nav-icon">×</span>{deleteArmed ? 'Confirm deletion' : 'Delete'}</button></nav>
      <div class="sidebar-divider" aria-hidden="true"></div>
      <button class="sidebar-utility" on:click={closeTournament}>‹ All tournaments</button>
      <div class="sidebar-bottom"><button class:confirm={deleteArmed} class="sidebar-delete" on:click={armDeleteTournament}>{deleteArmed ? 'Confirm deletion' : 'Delete tournament'}</button></div>
    </aside>
    <main class="main-content">
      {#if view !== 'overview' && view !== 'divisions' && tournament.divisions.length}<div class="context-bar"><label>Division <select value={selectedDivisionId} on:change={selectDivision}>{#if allDivisionViews.includes(view)}<option value="all">All</option>{/if}{#each tournament.divisions as division}<option value={division.id}>{division.name}</option>{/each}</select></label><span class="context-divider"></span><span>{allDivisionSelected ? tournament.teams.length : divisionTeams.length} teams · {allDivisionSelected ? tournament.pools.length : divisionPools.length} pools</span></div>{/if}

      {#if view === 'overview'}
        <section class="content-section overview-view"><div class="welcome-card"><div><h2>{tournament.name}</h2><p>{tournament.location || 'Set a location in the Divisions area'} · {displayDate(tournament.date)}</p></div></div><div class="stat-grid"><div class="stat-card"><span class="stat-label">DIVISIONS</span><strong>{tournament.divisions.length}</strong></div><div class="stat-card"><span class="stat-label">REGISTERED TEAMS</span><strong>{tournament.teams.length}</strong></div><div class="stat-card"><span class="stat-label">POOL MATCHES</span><strong>{tournament.matches.length}</strong></div><div class="stat-card"><span class="stat-label">COURTS</span><strong>{tournament.courtCount}</strong></div></div><div class="overview-grid"><div class="panel"><div class="panel-heading"><div><div class="eyebrow">WORKFLOW</div><h3>Build your tournament</h3></div></div><div class="workflow-list">{#each [{label:'Set up divisions',view:'divisions',done:tournament.divisions.length > 0},{label:'Register teams',view:'teams',done:tournament.teams.length > 0},{label:'Generate pools & matches',view:'pools',done:tournament.matches.length > 0},{label:'Create the schedule',view:'schedule',done:tournament.matches.some((match) => match.scheduledStartTime)},{label:'Enter results & standings',view:'results',done:tournament.matches.some((match) => match.status === 'completed')},{label:'Build playoffs',view:'playoffs',done:tournament.playoffMatches.length > 0}] as step, i}<button class="workflow-row" on:click={() => navigate(step.view as View)}><span class:done={step.done} class="workflow-check">{step.done ? '✓' : i + 1}</span><span>{step.label}</span></button>{/each}</div></div></div></section>
      {:else if view === 'divisions'}
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <section class="content-section divisions-view"><div class="section-intro section-intro-actions"><div class="toolbar"><button class="button button-secondary" on:click={openImport}>↥ Import teams</button><div class="inline-add"><input placeholder="New division name" bind:value={newDivisionName} on:keydown={(event) => event.key === 'Enter' && addDivision()} /><button class="button button-primary" on:click={addDivision}>+ Add division</button></div></div></div>{#if tournament.divisions.length}<div class="division-list">{#each tournament.divisions as division}<article class:current={currentDivision?.id === division.id} class="division-card" role="button" tabindex="0" on:click={() => setWorkingDivision(division.id)} on:keydown={(event) => (event.key === 'Enter' || event.key === ' ') && setWorkingDivision(division.id)}><div class="division-card-top"><div class="division-name"><span class="division-dot"></span>{#if editingDivisionId === division.id}<input class="edit-input" bind:value={editingDivisionName} on:keydown={(event) => event.key === 'Enter' && saveDivisionName()} />{:else}<h3>{division.name}</h3>{/if}<span>{tournament.teams.filter((team) => team.divisionId === division.id).length} teams · {tournament.pools.filter((pool) => pool.divisionId === division.id).length || 0} pools</span></div><div class="card-actions">{#if editingDivisionId === division.id}<button class="text-button" on:click={saveDivisionName}>Save</button>{:else}<button class="text-button" on:click={() => { editingDivisionId = division.id; editingDivisionName = division.name; }}>Rename</button>{/if}<button class="text-button danger" on:click={() => deleteDivision(division)}>Delete</button><button class="button button-secondary small-button" on:click={() => { navigate('teams'); setWorkingDivision(division.id); }}>Open division →</button></div></div>{#if currentDivision?.id === division.id}<div class="settings-grid"><label>Start time<input type="datetime-local" value={inputDateTime(division.startTime)} on:change={(event) => updateDivision('startTime', (event.target as HTMLInputElement).value)} /></label><label>Warm-up minutes<input type="number" min="0" value={division.warmupMinutes} on:change={(event) => updateDivision('warmupMinutes', Number((event.target as HTMLInputElement).value))} /></label><label>Game minutes<input type="number" min="1" value={division.gameMinutes} on:change={(event) => updateDivision('gameMinutes', Number((event.target as HTMLInputElement).value))} /></label><label>Minimum rest minutes<input type="number" min="0" value={division.minimumRestMinutes} on:change={(event) => updateDivision('minimumRestMinutes', Number((event.target as HTMLInputElement).value))} /></label><label>Number of pools<input type="number" min="1" max={Math.max(1, divisionTeams.length)} value={division.poolCount} on:change={(event) => updateDivision('poolCount', Math.max(1, Number((event.target as HTMLInputElement).value)))} /></label><label>Pool-play rounds<input type="number" min="1" value={division.poolRoundCount} on:change={(event) => updateDivision('poolRoundCount', Math.max(1, Number((event.target as HTMLInputElement).value)))} /></label><label>Playoff qualifiers per pool<input type="number" min="1" value={division.playoffQualifiersPerPool} on:change={(event) => updateDivision('playoffQualifiersPerPool', Math.max(1, Number((event.target as HTMLInputElement).value)))} /></label></div>{/if}</article>{/each}</div>{:else}<div class="empty-panel"><div class="empty-icon">◫</div><h3>Start with a division</h3><p>Try “Mixed 3.5” or “Men’s 4.0”.</p></div>{/if}</section>
      {:else if view === 'teams'}
        <section class="content-section teams-view"><div class="section-intro section-intro-actions"><div class="toolbar"><button class="button button-secondary" on:click={openImport}>↥ Import teams</button>{#if !allDivisionSelected}<div class="inline-add"><input placeholder="Team name" bind:value={newTeamName} on:keydown={(event) => event.key === 'Enter' && addTeam()} /><button class="button button-primary" on:click={addTeam}>+ Add team</button></div>{/if}</div></div>{#if allDivisionSelected}<div class="table-panel"><div class="table-toolbar"><div><h3>All divisions</h3><span class="muted">{tournament.teams.length} {tournament.teams.length === 1 ? 'team' : 'teams'} registered</span></div></div>{#if tournament.teams.length}<div class="team-list">{#each tournament.divisions as division}<div class="team-division"><h4 class="team-division-heading">{division.name}</h4>{@render TeamRows(division)}</div>{/each}</div>{:else}<div class="empty-table"><p>No teams registered yet.</p></div>{/if}</div>{:else if currentDivision}<div class="table-panel"><div class="table-toolbar"><div><h3>{currentDivision.name}</h3><span class="muted">{divisionTeams.length} {divisionTeams.length === 1 ? 'team' : 'teams'} registered</span></div></div>{#if divisionTeams.length}<div class="team-list">{@render TeamRows(currentDivision)}</div>{:else}<div class="empty-table"><p>No teams in this division yet.</p><button class="button button-secondary" on:click={() => document.querySelector<HTMLInputElement>('.inline-add input')?.focus()}>Add the first team</button></div>{/if}</div>{:else}<div class="empty-panel"><div class="empty-icon">◫</div><h3>Add a division first</h3><button class="button button-secondary" on:click={() => navigate('divisions')}>Go to divisions</button></div>{/if}</section>
      {:else if view === 'pools'}
        <section class="content-section pools-view"><div class="section-intro section-intro-actions"><div class="toolbar"><button class="button button-secondary" on:click={regeneratePools}>⤨ {allDivisionSelected ? (poolViewPools.length ? 'Re-randomize all' : 'Generate all pools') : (poolViewPools.length ? 'Re-randomize' : 'Generate pools')}</button><button class="button button-primary" disabled={!poolViewPools.length || (allDivisionSelected && poolViewDivisions.some((division) => poolsForDivision(division.id).length === 0))} on:click={generateMatches}>{allDivisionSelected ? 'Generate all matches →' : 'Generate matches →'}</button></div></div>{#if currentDivision}{#if poolViewPools.length}{#if allDivisionSelected}<div class="pool-division-list">{#each poolViewDivisions as division}{#if poolsForDivision(division.id).length}<section class="pool-division"><div class="pool-division-heading"><h3>{division.name}</h3><span>{tournament.teams.filter((team) => team.divisionId === division.id).length} teams</span></div>{@render PoolGrid(poolsForDivision(division.id))}</section>{/if}{/each}</div>{:else}{@render PoolGrid(poolViewPools)}{/if}{:else}<div class="empty-panel pool-empty-panel"><div class="empty-icon">◈</div><h3>Ready to build pools</h3><button class="button button-primary" on:click={regeneratePools}>{allDivisionSelected ? 'Generate all pools' : 'Generate pools'}</button></div>{/if}{:else}<div class="empty-panel"><div class="empty-icon">◈</div><h3>Add a division first</h3><button class="button button-secondary" on:click={() => navigate('divisions')}>Go to divisions</button></div>{/if}</section>
      {:else if view === 'schedule'}
        <section class="content-section schedule-view"><div class="section-intro section-intro-actions"><div class="toolbar"><label class="court-control">Courts <input type="number" min="1" bind:value={tournament.courtCount} on:change={touch} /></label><button class="button button-primary" on:click={generateTournamentSchedule}>Generate schedule</button></div></div>{#if scheduleMatches.length}<div class="schedule-list">{#each scheduleMatches as match, index}<div class="schedule-row"><div class="schedule-time"><strong>{displayTime(match.scheduledStartTime)}</strong>{#if index === 0 || displayTime(scheduleMatches[index - 1].scheduledStartTime) !== displayTime(match.scheduledStartTime)}<span>{new Date(match.scheduledStartTime!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>{/if}</div><div class="court-badge">C{match.courtNumber}</div><div class="schedule-detail"><strong>{divisionName(match.divisionId)} <span>·</span> {matchLabel(match)}</strong><span>{teamName(match.teamAId)} <b>vs</b> {teamName(match.teamBId)}</span></div><span class:complete={match.status === 'completed'} class="status-pill">{match.status === 'completed' ? 'Completed' : 'Scheduled'}</span></div>{/each}</div>{:else}<div class="empty-panel"><div class="empty-icon">◷</div><h3>No schedule yet</h3>{#if !schedulePoolsGenerated}<p>Generate pool matches first, then create a fixed-court schedule.</p><button class="button button-primary" on:click={() => navigate('pools')}>Go to pools</button>{:else if !scheduleMatchesGenerated}<p>Now that pools have been assigned for {allDivisionSelected ? 'all divisions' : 'this division'}, it's time to generate matches.</p><button class="button button-primary" on:click={generateTournamentSchedule}>Generate schedule</button>{:else}<p>Now that pools have been assigned for {allDivisionSelected ? 'all divisions' : 'this division'}, create a fixed-court schedule.</p><button class="button button-primary" on:click={generateTournamentSchedule}>Generate schedule</button>{/if}</div>{/if}</section>
      {:else if view === 'sheets'}
        <section class="content-section print-screen sheets-view"><div class="section-intro section-intro-actions no-print"><button class="button button-primary" on:click={printSheets}>▤ Print {sheetMatches.length} sheets</button></div><div class="filter-bar no-print"><label>Round <select bind:value={sheetRound}><option value="all">All rounds</option>{#each allRounds(workingMatches) as round}<option value={round}>Round {round}</option>{/each}</select></label><span class="muted">{sheetMatches.length} sheets ready</span></div>{#if sheetMatches.length}<div class="sheet-preview">{#each sheetMatches as match}<article class="score-sheet"><div class="sheet-top"><span class="sheet-court">Court {match.courtNumber}</span><strong class="sheet-time">{displayTime(match.scheduledStartTime)}</strong></div><div class="sheet-divider" aria-hidden="true"></div><div class="sheet-teams"><div class="sheet-team-row"><span class="sheet-team-name">{teamName(match.teamAId)}</span><span class="sheet-score-entry" aria-hidden="true">____</span></div><span class="sheet-versus">vs.</span><div class="sheet-team-row"><span class="sheet-team-name">{teamName(match.teamBId)}</span><span class="sheet-score-entry" aria-hidden="true">____</span></div></div><div class="sheet-divider" aria-hidden="true"></div><div class="sheet-meta">{divisionName(match.divisionId)} — {matchLabel(match)}</div></article>{/each}</div>{:else}<div class="empty-panel no-print"><div class="empty-icon">▤</div><h3>No scheduled matches</h3><p>Generate the schedule to create printable score sheets.</p></div>{/if}</section>
      {:else if view === 'results'}
        <section class="content-section results-view"><div class="section-intro section-intro-actions"><div class="filter-bar compact"><label>Round <select bind:value={resultRound}><option value="all">All rounds</option>{#each allRounds(workingMatches) as round}<option value={round}>Round {round}</option>{/each}</select></label></div></div>{#if resultMatches.length}<div class="result-list">{#each resultMatches as match}<article class:completed={match.status === 'completed'} class="result-card"><div class="result-card-head"><div class="result-card-top"><span class="result-court">Court {match.courtNumber}</span><span class="result-time">{displayTime(match.scheduledStartTime)}</span></div></div><div class="score-entry"><div><span>{teamName(match.teamAId)}</span><input type="number" min="0" step="1" inputmode="numeric" aria-label={`${teamName(match.teamAId)} score`} value={scoreDraftFor(match).a} on:input={(event) => updatePoolResultDraft(match, 'a', (event.target as HTMLInputElement).value)} /></div><div class="versus">-</div><div><input type="number" min="0" step="1" inputmode="numeric" aria-label={`${teamName(match.teamBId)} score`} value={scoreDraftFor(match).b} on:input={(event) => updatePoolResultDraft(match, 'b', (event.target as HTMLInputElement).value)} /><span>{teamName(match.teamBId)}</span></div></div>{#if resultErrors[match.id]}<p class="result-entry-error" role="alert">{resultErrors[match.id]}</p>{/if}<div class="result-card-meta">{divisionName(match.divisionId)} — {matchLabel(match)}</div></article>{/each}</div>{:else}<div class="empty-panel"><div class="empty-icon">✓</div><h3>No matches waiting for results</h3><p>Generate and schedule pool matches first.</p><button class="button button-secondary" on:click={() => navigate('schedule')}>View schedule</button></div>{/if}</section>
      {:else if view === 'standings'}
        <section class="content-section">{#if currentStandings.length}<div class="standings-grid">{#each currentStandings as pool}<div class="standings-card"><div class="standings-head"><div><span class="eyebrow">POOL STANDINGS</span><h3>{pool.poolName}</h3></div><span class="muted">{pool.rows.reduce((sum, row) => sum + row.played, 0) / 2} matches played</span></div><div class="standings-table"><div class="standing-row heading"><span>#</span><span>Team</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>+/-</span></div>{#each pool.rows as row}<div class="standing-row"><strong>{row.rank}</strong><span class="standing-team">{row.teamName}</span><strong>{row.wins}</strong><span>{row.losses}</span><span>{row.pointsFor}</span><span>{row.pointsAgainst}</span><strong class:difference-positive={row.differential > 0} class:difference-negative={row.differential < 0}>{row.differential > 0 ? '+' : ''}{row.differential}</strong></div>{/each}</div></div>{/each}</div>{:else}<div class="empty-panel"><div class="empty-icon">↗</div><h3>Standings appear after pools are generated</h3><p>Every registered team will appear, even before results are entered.</p><button class="button button-secondary" on:click={() => view = 'pools'}>Set up pools</button></div>{/if}</section>
      {:else if view === 'playoffs'}
        {#key selectedDivisionId}<section class="content-section"><div class="section-intro section-intro-actions"><div class="toolbar"><button class="button button-secondary" on:click={generateBracket}>↻ Generate bracket</button></div></div>{#if divisionPlayoffs.length}<div class="playoff-status"><span class="status-dot"></span>{divisionPlayoffs.filter((match) => match.status === 'completed').length} of {divisionPlayoffs.length} matches complete <span class="playoff-note">Input scores to advance to the next round.</span></div>{#if isSingleRoundPlayoff}<div class="bracket single-round"><div class="single-round-column"><div class="bracket-title">Championship</div>{#each championshipPlayoffMatches as match (match.id)}{@render PlayoffCard(match)}{/each}</div></div>{:else}<div class="bracket"><div class="bracket-column"><div class="bracket-title">Opening round</div>{#each [...openingPlayoffMatches, ...quarterfinalPlayoffMatches] as match (match.id)}{@render PlayoffCard(match)}{/each}</div><div class="bracket-column"><div class="bracket-title">Semifinals</div>{#each semifinalPlayoffMatches as match (match.id)}{@render PlayoffCard(match)}{/each}</div><div class="bracket-column"><div class="bracket-title">Finals</div>{#each championshipPlayoffMatches as match (match.id)}{@render PlayoffCard(match)}{/each}{#each thirdPlacePlayoffMatches as match (match.id)}<div class="third-place-label">Third place</div>{@render PlayoffCard(match)}{/each}</div></div>{/if}{:else}<div class="empty-panel"><div class="empty-icon">◇</div><h3>Build the playoff bracket</h3><p>Use final pool standings to create cross-pool single-elimination playoffs.</p><button class="button button-primary" on:click={generateBracket}>Generate bracket</button></div>{/if}</section>{/key}
      {/if}
    </main>
  </div>
{/if}

{#if createOpen}<div class="modal-backdrop" role="presentation" on:click={(event) => event.target === event.currentTarget && (createOpen = false)}><div class="modal"><div class="modal-header"><div><div class="eyebrow">NEW TOURNAMENT</div><h2>Set up a tournament</h2></div><button class="close-button" on:click={() => createOpen = false}>×</button></div><div class="modal-body"><label>Tournament name<input placeholder="Saturday Pickleball Classic" bind:value={newTournamentName} /></label><div class="form-row"><label>Date<input type="date" bind:value={newTournamentDate} /></label><label>Courts<input type="number" min="1" bind:value={newTournamentCourts} /></label></div><label>Location <span class="optional">Optional</span><input placeholder="Harbor Athletic Club" bind:value={newTournamentLocation} /></label></div><div class="modal-footer"><button class="button button-secondary" on:click={() => createOpen = false}>Cancel</button><button class="button button-primary" on:click={createTournament}>Create tournament</button></div></div></div>{/if}

{#if importOpen && tournament}
  <div class="modal-backdrop" role="presentation" on:click={(event) => event.target === event.currentTarget && closeImport()}>
    <div class="modal import-modal">
      <div class="modal-header">
        <div>
          <div class="eyebrow">TEAM IMPORT</div>
          <h2>Import Teams</h2>
          <p class="modal-help">Upload a roster in almost any spreadsheet or PDF layout. Pickle Desk inspects it locally, ignores unrelated details, groups unlabeled sections when it can, and asks you to confirm the teams before changing the tournament.</p>
        </div>
        <button class="close-button" on:click={closeImport}>×</button>
      </div>
      <div class="modal-body">
        <div class="import-upload">
          <div><strong>{importFileName || 'Import a file'}</strong><span class="import-file-help">CSV, XLSX, XLS, or PDF · up to 10 MB</span></div>
          <label class="button button-secondary">Choose file<input type="file" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" on:change={handleImportFile} /></label>
        </div>
        <label class="import-paste-label">Paste CSV or table<textarea rows="6" bind:value={importText} aria-label="CSV or table import contents" placeholder="division,team&#10;Mixed 3.5,Smith / Jones"></textarea></label>
        <button class="text-button" disabled={importBusy || !importText.trim()} on:click={previewImport}>{importBusy ? 'Inspecting…' : 'Preview pasted data'}</button>
        {#if importError}<div class="import-preview has-errors"><p>{importError}</p></div>{/if}
        {#if importReview}
          <div class="import-review-body">
            <div class="import-overview">
              <div><strong>{importReadyCount} ready</strong><span>{importWarningCount} warnings</span><span>{importDuplicateCount} duplicates</span><span>{importNewDivisionCount} new divisions</span><span>{importIgnoredCount} ignored</span></div>
              {#if importReview.errors.length}{#each importReview.errors as error}<p class="import-error">{error}</p>{/each}{:else if importReview.warnings.length}{#each importReview.warnings as warning}<p>{warning}</p>{/each}{/if}
            </div>
            <div class="import-sheets">
              <strong>Sheets</strong>
              {#each importReview.mappings as mapping}
                <label><input type="checkbox" checked={mapping.selected} on:change={() => toggleImportSheet(mapping)} /> <span>{mapping.sheet}</span><small>{mapping.layout} · {mapping.foundRows} rows{#if mapping.reason} · {mapping.reason}{/if}</small></label>
              {/each}
            </div>
            {#if importReview.rows.length}
              <div class="import-review-table">
                <div class="import-review-heading"><span>Division</span><span>Team</span><span>Source</span><span>Confidence</span><span>Action</span></div>
                {#each importReview.rows as row (row.id)}
                  <div class:excluded={!row.included} class:duplicate-row={row.duplicate} class="import-review-row">
                    <input value={row.division} placeholder="Choose division" aria-label={`Division for row ${row.source.row}`} on:input={(event) => updateImportRow(row.id, 'division', (event.target as HTMLInputElement).value)} />
                    <input value={row.team} placeholder="Team name" aria-label={`Team for row ${row.source.row}`} on:input={(event) => updateImportRow(row.id, 'team', (event.target as HTMLInputElement).value)} />
                    <span class="import-source">{row.source.sheet}, row {row.source.row}</span>
                    <span class={`confidence-${row.confidence}`}>{row.confidence}</span>
                    <div class="import-row-action"><button class="text-button" on:click={() => toggleImportRow(row)}>{row.included ? 'Exclude' : row.duplicate ? 'Include anyway' : 'Include'}</button><details><summary>Why?</summary><span>{row.reasons.join(' ')}</span>{#each row.warnings as warning}<span class="import-warning">{warning}</span>{/each}</details></div>
                  </div>
                {/each}
              </div>
            {/if}
            {#if importReview.ignoredRows.length}<details class="import-ignored"><summary>{importReview.ignoredRows.length} ignored rows</summary>{#each importReview.ignoredRows.slice(0, 12) as ignored}<span>{ignored.source.sheet}, row {ignored.source.row}: {ignored.reason}</span>{/each}</details>{/if}
          </div>
        {/if}
      </div>
      <div class="modal-footer"><a class="text-button" href="data:text/csv;charset=utf-8,division%2Cteam%0AMixed%203.5%2CSmith%20%2F%20Jones%0AMixed%203.5%2CDavis%20%2F%20Chen" download="teams-template.csv">Download simple template</a><button class="button button-secondary" on:click={closeImport}>Cancel</button><button class="button button-primary" disabled={!importCanCommit} on:click={commitImport}>Import {importReadyCount} teams</button></div>
    </div>
  </div>
{/if}

{#if toast}<div class="toast"><span>✓</span>{toast}</div>{/if}

{#snippet TeamRows(division: Division)}
  {#each tournament!.teams.filter((team) => team.divisionId === division.id) as team, index}
    <div class="team-row"><span class="team-number">{String(index + 1).padStart(2, '0')}</span>{#if editingTeamId === team.id}<input class="edit-input team-edit" bind:value={editingTeamName} on:keydown={(event) => event.key === 'Enter' && saveTeamName()} />{:else}<strong>{team.name}</strong>{/if}<span class="team-pool">{teamPool(team.id)?.name ?? 'Not assigned'}</span><div class="row-actions">{#if editingTeamId === team.id}<button class="text-button" on:click={saveTeamName}>Save</button>{:else}<button class="text-button" on:click={() => { editingTeamId = team.id; editingTeamName = team.name; }}>Edit</button>{/if}<button class="text-button danger" on:click={() => removeTeam(team)}>Remove</button></div></div>
  {/each}
{/snippet}

{#snippet PoolGrid(pools: Pool[])}
  <div class="pool-grid">
    {#each pools as pool}
      <div class="pool-card" role="list" on:dragover|preventDefault on:drop={() => { if (draggedTeamId) moveTeam(draggedTeamId, pool.id); }}>
        <div class="pool-card-head"><div><h3>{pool.name}</h3></div><span class="pool-count">{teamsInPool(pool.id, tournament!.poolMemberships, tournament!.teams).length} teams</span></div>
        <div class="pool-team-list">{#each teamsInPool(pool.id, tournament!.poolMemberships, tournament!.teams) as team}<div class="pool-team" role="listitem" draggable="true" on:dragstart={() => draggedTeamId = team.id} on:dragend={() => draggedTeamId = ''}><span class="drag-handle" aria-hidden="true">⋮⋮</span><span class="pool-team-copy">{team.name}</span><label class="pool-team-move"><span class="visually-hidden">Move {team.name} to pool</span><select value={pool.id} aria-label={`Move ${team.name} to pool`} on:change={(event) => moveTeamFromControl(team.id, (event.target as HTMLSelectElement).value)}>{#each pools as destination}<option value={destination.id}>{destination.name}</option>{/each}</select></label></div>{/each}</div>
        <div class="drop-hint">Drop a team here to move it</div>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet PlayoffCard(match: PlayoffMatch)}
  <article class:completed={match.status === 'completed'} class="playoff-card">
    <div class="bracket-team" class:winner={match.winnerId === match.teamAId}>
      <span>{teamName(match.teamAId) !== 'TBD' ? teamName(match.teamAId) : match.placeholderA ?? 'TBD'}</span>
      {#if playoffDrafts[match.id] || (match.status === 'scheduled' && match.teamAId && match.teamBId)}
        <input type="number" min="0" step="1" inputmode="numeric" aria-label={`${teamName(match.teamAId)} score`} value={playoffDrafts[match.id]?.a ?? (match.scoreA !== undefined ? String(match.scoreA) : '')} on:input={(event) => updatePlayoffDraft(match, 'a', (event.target as HTMLInputElement).value)} />
      {:else if match.scoreA !== undefined}
        <b>{match.scoreA}</b>
      {/if}
    </div>
    <div class="bracket-team" class:winner={match.winnerId === match.teamBId}>
      <span>{teamName(match.teamBId) !== 'TBD' ? teamName(match.teamBId) : match.placeholderB ?? 'TBD'}</span>
      {#if playoffDrafts[match.id] || (match.status === 'scheduled' && match.teamAId && match.teamBId)}
        <input type="number" min="0" step="1" inputmode="numeric" aria-label={`${teamName(match.teamBId)} score`} value={playoffDrafts[match.id]?.b ?? (match.scoreB !== undefined ? String(match.scoreB) : '')} on:input={(event) => updatePlayoffDraft(match, 'b', (event.target as HTMLInputElement).value)} />
      {:else if match.scoreB !== undefined}
        <b>{match.scoreB}</b>
      {/if}
    </div>
    {#if playoffDrafts[match.id] || (match.status === 'scheduled' && match.teamAId && match.teamBId)}
      <div class="bracket-result"><button class="button button-primary" on:click={() => savePlayoffResult(match, true)}>{match.status === 'completed' ? 'Update result' : 'Save result'}</button></div>
    {:else if match.status === 'completed' && match.scoreA !== undefined && match.scoreB !== undefined}
      <div class="bracket-result"><button class="button button-secondary" on:click={() => editPlayoffResult(match)}>Update result</button></div>
    {/if}
    {#if match.isBye && match.status === 'scheduled'}<span class="bye-label">BYE advances automatically</span>{/if}
  </article>
{/snippet}
