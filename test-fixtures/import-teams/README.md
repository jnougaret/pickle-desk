# Import Teams fixture corpus

These eight files intentionally resemble recreational organizer exports rather than a clean `division,team` template. They contain ratings, gender, contact details, payment/status fields, titles, repeated headers, totals, sheet tabs, section markers, and missing division labels.

The expected canonical team counts are:

| File | Format | Expected teams | Division behavior |
| --- | --- | ---: | --- |
| `01-monday-registration.csv` | CSV | 3 | Explicit division column |
| `02-division-tabs.xlsx` | XLSX | 4 | Sheet names provide divisions; payment/instruction tabs ignored |
| `03-form-response.csv` | CSV | 3 | Player rows grouped by registration ID; aliases normalized |
| `04-block-layout.xlsx` | XLSX | 5 | Horizontal division blocks |
| `05-position-groups.csv` | CSV | 4 | Repeated headers and blank-line position groups become Division A/B |
| `06-paper-roster.pdf` | PDF | 4 | Printed section labels provide divisions |
| `07-flyer-signups.pdf` | PDF | 4 | Unlabeled page groups become Division A/B |
| `08-semicolon-unlabeled.csv` | semicolon CSV | 4 | Unlabeled section groups become Division A/B |

The XLSX files can be regenerated with `node scripts/generate-import-team-fixtures.mjs`. The PDF fixtures are generated with `python scripts/generate-import-team-pdfs.py` and are kept under `output/pdf/` so the repository's PDF artifact workflow has a stable output location.
