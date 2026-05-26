# Scraper Test Fixtures

Each `.json` file here is one LinkedIn profile snapshot used for regression testing.

## How to add a fixture

1. Install the v1.4.13+ extension and navigate to a LinkedIn `/in/` profile.
2. Open the **6Degrees popup** → the debug panel shows the scraped data.
3. Click **"📋 Copy test fixture"** — this captures the full `<main>` HTML + scrape result.
4. Paste the JSON into a new file: `tests/scraper/fixtures/<person-name>.json`
5. **Verify the `expected` values** — if the current scrape is wrong, fix them to reflect the ground truth (e.g. change `"company": "TSYS"` to `"company": "FIS"`).
6. Commit the fixture file.

## Fixture format

```json
{
  "name": "Keith Morrison",
  "slug": "keith-morrison-b97abb12",
  "title": "Keith Morrison - Fintech Solutions Specialist | LinkedIn",
  "url": "https://www.linkedin.com/in/keith-morrison-b97abb12/",
  "expected": {
    "firstName": "Keith",
    "lastName": "Morrison",
    "company": "FIS",
    "hasPhoto": true,
    "photoIdContains": "C5103AQE0Gtgd2cg-ZQ"
  },
  "mainHtml": "... (innerHTML of <main>, captured by the extension) ..."
}
```

### `expected` fields

| Field | Type | Description |
|---|---|---|
| `firstName` | string | Case-insensitive match |
| `lastName` | string | Case-insensitive match |
| `company` | string | Case-insensitive exact match. Omit if company scraping is known to be unreliable for this profile. |
| `hasPhoto` | bool | If true, `photoUrl` must be non-null |
| `photoIdContains` | string | If set, `photoUrl` must contain this substring (stable LinkedIn CDN image ID) |

## Running tests

```bash
node --test tests/scraper/run.mjs
```

Or via npm:
```bash
npm run test:scraper
```
