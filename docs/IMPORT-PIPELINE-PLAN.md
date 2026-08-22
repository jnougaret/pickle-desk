# Resilient team and division import pipeline

## Status

Planning document. This is a proposed product and engineering plan; it does not change the current importer yet.

## Objective

Make importing a registration spreadsheet the preferred way to add teams while retaining manual team entry and CSV paste as a dependable fallback. The importer should accept the files that non-technical tournament organizers are likely to have, recognize common spreadsheet layouts, explain its interpretation, and require confirmation before changing tournament data.

The feature must run entirely on the device in the browser PWA, Windows desktop app, and macOS desktop app. No uploaded workbook, remote LLM, server-side parser, telemetry, or network connection may be required.

## Current baseline

The current path is deliberately small but strict:

- `src/App.svelte` reads the selected file as text and passes it to `previewCsv`.
- `src/lib/tournament/csv.ts` parses exactly two fields, `division,team`, and creates a preview with valid rows, errors, and new divisions.
- `commitCsv` appends `Team` records whose only user-facing value is `Team.name`; participant names are not stored separately today.
- A single malformed or differently shaped row produces an error that disables the whole import.
- The UI only accepts `.csv`, provides a text-area fallback, and keeps `+ Add team` available for manual entry.

The new pipeline should preserve the existing `Division` and `Team` domain model and place all inference before the existing persistence/save path. It must not alter the `.tournament` transfer format or the browser/Tauri storage boundary.

## Goals

1. Accept CSV and common spreadsheet workbooks, beginning with `.xlsx` and `.xls` if the selected parser meets the bundle and license gates. Treat `.ods` as a follow-on unless it can be added without materially increasing the app footprint.
2. Handle common variations without requiring users to rename columns:
   - normal rows such as `division,team`;
   - a division name used as a column header;
   - one name column with division marker rows and fill-down sections;
   - `Player 1`, `Player 2`, and similar adjacent participant columns;
   - multiple sheets, including sheet names that identify divisions;
   - title rows, blank rows, repeated headers, instructions, totals, and unrelated columns.
3. Reuse existing divisions when labels differ only by case, whitespace, punctuation, apostrophes, or token order, and propose—not silently apply—uncertain matches.
4. Show a clear, editable preview of what will be imported, including ignored data, warnings, source sheet/row provenance, duplicate rows, new divisions, and unresolved rows.
5. Import valid rows after review even when unrelated rows are malformed; block only when the workbook cannot be read or required fields remain unresolved.
6. Keep the normal application startup small by code-splitting the parser and inference bundle, while ensuring the importer chunk is packaged and available offline once the app is installed or desktop build is installed.
7. Keep manual entry, CSV paste, template download, and explicit cancellation available as fallback controls.

## Non-goals for the first release

- Extracting player records, phone numbers, emails, ratings, payments, or notes into new tournament entities. If no explicit team name exists, participant columns will be joined into the existing team-name string, for example `Smith / Jones`.
- Importing scores, pools, schedules, or tournament configuration from registration workbooks.
- Executing spreadsheet formulas, macros, external links, or embedded workbook content.
- Sending files to a service for interpretation or training a model from user workbooks.
- Silently guessing a low-confidence division or team boundary.
- Replacing the manual `Add team` path.

## Proposed user experience

### 1. Start import

Rename the primary action to `Import teams` and accept `.csv`, `.xlsx`, and `.xls` when supported by the chosen reader. Keep a secondary `Paste CSV or table` route for users who copied cells from a spreadsheet and do not know how to export a file. The template download should offer a simple CSV and, if practical, a matching `.xlsx` template.

The file picker should not imply that the user must produce a specially formatted CSV. Helper copy should say that Pickle Desk will inspect sheets, headers, and common division layouts before asking for confirmation.

### 2. Inspect and detect

After a file is selected, parse it locally and show a short progress state for larger workbooks. The parser should run in a Web Worker when the workbook is large enough to risk blocking the UI. Display:

- workbook name and sheet names;
- sheets selected for import and sheets ignored, with a reason;
- detected layout for each selected sheet;
- proposed division/team/participant columns;
- rows and sections found;
- warnings and unresolved rows.

### 3. Review and correct

Use a review table rather than a raw text dump. Each accepted row should show:

| Division | Team | Source | Confidence | Action |
| --- | --- | --- | --- | --- |
| Mixed 3.5 | Smith / Jones | Registrations, row 8 | High | Import |

Users should be able to change a row's division, exclude a row, include a flagged duplicate, and adjust the inferred column mapping. A compact `Why?` detail can explain decisions such as `Used sheet name as division` or `Joined Player 1 + Player 2`.

The summary must distinguish `ready to import`, `warnings`, `duplicates`, `new divisions`, and `ignored rows`. The final action should say exactly how many teams and divisions will be created. Closing or cancelling the review must leave the tournament unchanged.

### 4. Commit atomically

Only the reviewed, accepted canonical rows are passed to the domain commit function. Commit divisions and teams as one logical update through the existing `touch`/`saveQueue` path. Do not create partial tournament state while parsing or while the user is reviewing.

## Canonical import model

Introduce an internal, format-neutral model between file parsing and tournament mutation:

```ts
interface ImportWorkbook {
  sourceName: string;
  sheets: ImportSheet[];
}

interface ImportSheet {
  name: string;
  rows: ImportCell[][];
  hidden?: boolean;
}

interface CanonicalImportRow {
  division: string;
  team: string;
  source: { sheet: string; row: number; columns: number[] };
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  warnings: string[];
  included: boolean;
}

interface ImportReview {
  rows: CanonicalImportRow[];
  mappings: SheetMapping[];
  newDivisions: string[];
  ignoredSheets: { sheet: string; reason: string }[];
  warnings: string[];
  errors: string[];
}
```

The exact TypeScript names can change during implementation, but the separation is important: workbook cells and inference metadata should never leak into `Tournament`, `Division`, or `Team`. `commitImportReview` should accept only a validated review and produce the same `{ divisions, teams }` shape currently returned by `commitCsv`.

## Hybrid import pipeline

### Stage A: Format adapters

Create a `WorkbookReader` interface with separate adapters for text CSV and binary workbook files. The adapter should return normalized cell values and sheet metadata, not semantic guesses.

Parser selection should be benchmarked before implementation is locked:

- preferred candidate: a maintained, browser-compatible reader that covers `.xlsx` and `.xls`;
- alternatives: an `.xlsx`-focused reader plus a small legacy `.xls` adapter, or a different reader if the bundle/license profile is better;
- reject any option that requires a network fetch, executes macros/formulas, or introduces an unacceptable startup payload.

Use dynamic import so spreadsheet parsing is in an import-only chunk. Keep CSV parsing compatible with existing quoted fields, BOMs, embedded newlines, and malformed-row diagnostics. Enforce reasonable file-size, sheet-count, row-count, and cell-count limits with a clear recovery message rather than allowing an unusually large workbook to exhaust memory.

### Stage B: Structural normalization

For each sheet:

1. Normalize Unicode, whitespace, common apostrophes, and empty cells for comparison while retaining the original display value for preview.
2. Remove only leading/trailing empty rows and columns from the analysis view; retain source coordinates.
3. Detect title rows, repeated header rows, blank separators, merged-looking labels, totals, and instruction blocks.
4. Preserve formulas as displayed/cached values only. Never evaluate formulas or external references.
5. Score whether a sheet looks like a registration list. Hidden sheets, cover pages, payment sheets, score sheets, and instruction tabs should default to ignored but remain user-selectable if detection is uncertain.

### Stage C: Deterministic layout inference

Run cheap, explainable rules first. The pipeline should generate several layout hypotheses and score them rather than hard-coding one header shape.

#### Standard tabular layout

Recognize semantic headers such as `division`, `class`, `category`, `bracket`, `team`, `team name`, `pair`, `player`, `player 1`, `player 2`, `partner`, and common synonyms. Ignore fields such as email, phone, payment, timestamp, rating, notes, seed, and status unless they are needed to identify a team.

Precedence for team construction:

1. An explicit `team`/`team name`/`pair` column.
2. A single participant/name column.
3. Two or more participant columns, joined left-to-right with ` / ` after empty values are removed.

When an explicit team column exists, participant columns are not added to the team name unless the user selects that option in review.

#### Division-as-column-header layout

For a sheet whose meaningful headers are values such as `Mixed 3.5` and `Men's 4.0`, classify those headers as division candidates when the columns below them contain team-like names. Each non-empty data cell under a division header becomes a team row. A generic header such as `Player 1` remains a participant column, not a division.

#### Section-marker layout

For a mostly single-column sheet, detect rows that look like division labels and apply the most recent confirmed label to following team rows until the next label. A marker requires supporting evidence—such as matching an existing division, a division-like rating/category pattern, or multiple team-like rows beneath it—before it is treated as a section. A lone ambiguous name remains unresolved for review rather than being silently discarded or promoted to a division.

#### Multiple sheets

Use sheet names as division candidates when a sheet contains team-like rows but no reliable division column. If one sheet contains several recognizable divisions, use the row/column inference instead. Users should see and be able to uncheck each selected sheet; the same team from two sheets must be flagged as a possible duplicate, not silently doubled.

#### Extra columns and rows

Ignore unrelated columns and explain the reason in the review. Ignore obvious totals, notes, headers, and blank rows. Preserve any ignored row with a source location when it contains non-empty data that could plausibly be a team, so the user can include or map it manually.

### Stage D: Division reconciliation

Normalize candidate division labels for comparison:

- trim and collapse whitespace;
- case-fold;
- normalize curly/straight apostrophes and punctuation;
- compare token sets so `3.5 Mixed` and `Mixed 3.5` can match;
- optionally normalize obvious category aliases such as `M`, `Men`, `Mens`, and `Men's` only when the result is unambiguous.

Match in this order:

1. exact normalized match to an existing division;
2. unambiguous high-confidence fuzzy/token match to one existing division;
3. proposed new division;
4. unresolved candidate requiring user choice.

Never merge two existing divisions because of a weak fuzzy match. New divisions must be listed before commit and inherit the existing `DEFAULT_DIVISION_SETTINGS` behavior.

### Stage E: Compact purpose-built model

The model should be a bounded assist to the deterministic pipeline, not a free-form generator. Add a `LayoutScorer` interface so the first implementation can use heuristics and a later model without changing the UI or commit path.

Recommended model shape:

- a small character/token n-gram linear classifier or shallow decision tree;
- labels limited to `division`, `team`, `participant`, `metadata`, `section`, `header`, and `ignore`;
- features limited to header text, sheet name, position, non-empty density, value length/patterns, repeated-value rates, and neighboring-column relationships;
- inference implemented in TypeScript with a static, versioned weight file; no general ML runtime, WASM runtime, or LLM dependency;
- trained and tested only against reviewed synthetic fixtures and intentionally constructed layout variants, with no user workbook upload;
- target combined compressed parser/model overhead of roughly 250 KB or less in the import chunk, with an explicit review if the measured increase exceeds 400 KB.

The model must be optional at runtime: if the model asset cannot load, deterministic rules still produce a usable preview. Ship the model only if a held-out fixture benchmark demonstrates a meaningful improvement in layout/role selection without increasing false-positive imports. Any model decision must retain a human-readable reason and confidence band.

## Duplicate and validation policy

- Do not create exact duplicate team rows within the same division without an explicit user action.
- Detect duplicates against existing tournament teams after division reconciliation and distinguish them from duplicate rows in the source file.
- Default to excluding exact duplicates from the commit preview, with an `Include anyway` control for legitimate cases.
- Reject blank division/team values, unsupported or unreadable files, and rows whose required mapping remains unresolved.
- Permit valid rows from a partially messy file after the user reviews warnings.
- Keep a source row number for every accepted or rejected row so error messages are actionable.
- Do not overwrite existing divisions, teams, pools, matches, results, or playoff data during import.

## Implementation phases

### Phase 0: Fixture corpus and size benchmark

Create a small, reviewed fixture corpus covering the layouts in this document, malformed inputs, duplicate inputs, multilingual punctuation/case variants, multiple sheets, and irrelevant data. Add a parser comparison script or documented measurement for `.xlsx`/`.xls` support, license fit, browser compatibility, worker compatibility, and compressed bundle impact. Set final file-size limits from measured device behavior.

Exit criteria: the fixture corpus has expected canonical rows and expected warnings; the parser choice is recorded; no real user data is needed for tests.

### Phase 1: Format-neutral reader and normalization

Add workbook adapters, lazy loading, size guards, and structural normalization. Keep the current CSV parser behavior covered while routing both pasted CSV and selected files through the new intermediate representation.

Exit criteria: CSV and the selected spreadsheet formats can be read offline in both browser and Tauri builds, with source coordinates preserved and no formula/macro execution.

### Phase 2: Heuristic inference and review contract

Implement layout hypotheses, division reconciliation, team-name construction, sheet selection, ignored-row explanations, warnings, confidence, and duplicate detection. Add pure functions that turn normalized workbook data into `ImportReview` and a commit function that accepts only reviewed rows.

Exit criteria: all required example layouts produce correct or explicitly unresolved previews; no low-confidence guess is auto-committed; malformed unrelated rows do not block valid rows.

### Phase 3: Optional compact model

Train the bounded role/layout scorer from the fixture corpus, version its weights, compare it with heuristics on held-out fixtures, and integrate it behind the `LayoutScorer` interface only if it improves the acceptance metrics. Keep a deterministic fallback and a bundle-size check.

Exit criteria: model decisions are reproducible, explainable at the UI level, fully offline, and measurably better than the heuristic baseline without increasing false positives.

### Phase 4: Product UI integration

Replace the current CSV-only modal with the upload/detect/review flow. Keep manual add, CSV paste, template download, cancel, and retry paths. Update labels and helper copy to encourage import without implying that a user must understand CSV formatting.

Exit criteria: a user can import a clean spreadsheet in one review, correct an ambiguous mapping without editing the original file, and see exactly what will be added before commit.

### Phase 5: Verification and rollout

Run the repository test/type/build gates, PWA smoke test, and Tauri smoke test. Verify that the lazy import chunk is present in the built offline asset set and that a no-network import works after the app has been installed/opened once. Validate desktop and browser behavior from the same pure pipeline tests, then perform real browser file-picker checks on supported Android/iPadOS hardware separately.

## Test plan

### Unit and fixture tests

Cover at minimum:

- quoted CSV, BOM, embedded newlines, alternate delimiters if supported, and malformed quotes;
- `division,team` with existing and new divisions;
- division headers across columns;
- section-marker rows with fill-down and ambiguous single-name rows;
- explicit team plus participant columns;
- participant-only columns joined in order, with blanks removed;
- sheet-name divisions and multiple selected/ignored sheets;
- title rows, repeated headers, blank rows, totals, notes, and unrelated metadata;
- normalization and unambiguous/ambiguous fuzzy division matches;
- duplicate source rows and duplicates against existing teams;
- partial invalid input where valid rows remain importable;
- maximum file/row/cell limits and unreadable workbook errors;
- model-enabled and model-disabled results producing the same safe review contract.

### UI and integration tests

Verify:

- the file picker accepts only supported formats;
- preview does not mutate the tournament or save queue;
- row edits, exclusions, duplicate inclusion, mapping overrides, cancellation, and retry work;
- commit is atomic and reports counts accurately;
- manual `Add team` and CSV paste continue to work;
- importer works with zero existing divisions and with existing divisions;
- the import chunk is available without network access after installation.

### Existing release gates

After implementation, rerun the commands documented in `README.md`:

```text
npm test
npx tsc --noEmit
npm run build
npm run pwa:smoke
npm run tauri:smoke
```

Also run `git diff --check` and inspect the production bundle-size report. The PWA smoke test should explicitly assert that importer assets are included in the offline asset inventory and that the parser does not make network requests.

## Offline, privacy, and performance requirements

- All workbook bytes remain local to the device and are discarded after review unless the user commits the resulting tournament data.
- Do not add analytics for workbook contents or upload failed examples automatically. If feedback is later needed, provide an explicit user-controlled diagnostic export with sensitive cell values redacted or omitted.
- Lazy-load the importer so ordinary tournament startup is not penalized; use a Web Worker for heavy parsing/inference.
- Put all parser, model, and worker chunks in the normal Vite build and service-worker asset inventory. Dynamic loading must not become a network-only path.
- Bound memory and work with file-size, sheet, row, and cell limits; report limits in plain language.
- Do not evaluate formulas, follow external references, run macros, or create DOM from workbook HTML.
- Keep the canonical commit path synchronous from the user's perspective: review first, then one save through the existing repository queue.

## Definition of done

This work is ready for release when:

1. CSV remains backward-compatible and manual entry remains available.
2. The selected spreadsheet formats import fully offline on browser and desktop builds.
3. The example layouts in this plan produce correct previews or visible, actionable ambiguity warnings.
4. Valid rows can be committed despite unrelated malformed rows, while required unresolved mappings block commit.
5. Every accepted row has source provenance, and the user confirms the final division/team list before mutation.
6. Duplicate handling, new divisions, ignored data, and participant-column joining are visible and controllable.
7. The compact model, if shipped, is local, optional, explainable, size-budgeted, and demonstrably better than the heuristic baseline.
8. Unit, type, build, PWA smoke, Tauri smoke, offline-import, and relevant physical file-picker checks pass, with device-level limits reported honestly.

## Decisions to make before implementation

- Confirm the minimum spreadsheet format set after the parser benchmark: `.xlsx` and `.xls` for the first release, with `.ods` deferred unless its incremental cost is small.
- Confirm whether the product wants exact duplicate rows excluded by default or merely flagged for review; the plan recommends exclusion until explicitly included.
- Confirm the desired maximum workbook size and target devices after measuring the chosen parser on a mid-range phone and supported desktop builds.
- Confirm whether a future tournament model should store participant names separately. The first import release should not invent that schema; it should join participant columns into the existing team name when no explicit team name is available.
