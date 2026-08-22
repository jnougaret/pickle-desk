import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectImportFile, summarizeImportReview } from './importPipeline';

const repoRoot = resolve(process.cwd());

function fixtureFile(relativePath: string, type: string): File {
  const bytes = readFileSync(resolve(repoRoot, relativePath));
  return new File([bytes], relativePath.split('/').pop() ?? 'fixture', { type });
}

describe('organizer-style Import Teams fixtures', () => {
  it.each([
    ['test-fixtures/import-teams/01-monday-registration.csv', 'text/csv', 3, ['Mixed 3.5', "Women's 3.5"]],
    ['test-fixtures/import-teams/02-division-tabs.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 4, ['Mixed 3.5', "Men's 4.0"]],
    ['test-fixtures/import-teams/03-form-response.csv', 'text/csv', 3, ['Beginner/Intermediate', "Women's 3.5"]],
    ['test-fixtures/import-teams/04-block-layout.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 5, ['Mixed 3.5', "Men's 4.0"]],
    ['test-fixtures/import-teams/05-position-groups.csv', 'text/csv', 4, ['Division A', 'Division B']],
    ['output/pdf/06-paper-roster.pdf', 'application/pdf', 4, ['Mixed 3.5', "Men's 4.0"]],
    ['output/pdf/07-flyer-signups.pdf', 'application/pdf', 4, ['Division A', 'Division B']],
    ['test-fixtures/import-teams/08-semicolon-unlabeled.csv', 'text/csv', 4, ['Division A', 'Division B']]
  ])('imports %s with noisy organizer data', async (relativePath, type, expectedTeams, expectedDivisions) => {
    const review = await inspectImportFile(fixtureFile(relativePath, type), [], []);
    const summary = summarizeImportReview(review, []);
    expect(review.errors, review.warnings.join(' | ')).toEqual([]);
    expect(summary.ready).toBe(expectedTeams);
    expect(summary.newDivisions).toEqual(expectedDivisions);
    expect(review.rows.filter((row) => row.included).every((row) => row.team && row.division)).toBe(true);
  });
});
