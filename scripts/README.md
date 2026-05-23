# Export list to CSV + photos

## Setup (one-time)

```bash
cd scripts
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

## Run

```bash
# Full export: API fetch + LinkedIn enrichment
python scripts/export_list.py cmpiwh0to0002h2gv60vzjks6

# API only (fast, no LinkedIn login needed)
python scripts/export_list.py cmpiwh0to0002h2gv60vzjks6 --no-linkedin

# Re-run LinkedIn enrichment on existing CSV (resumable)
python scripts/export_list.py cmpiwh0to0002h2gv60vzjks6 --linkedin-only

# Quick test on first 10 contacts
python scripts/export_list.py cmpiwh0to0002h2gv60vzjks6 --limit 10
```

No cookie or API token needed — the script uses a persistent browser profile
(`output/.li_profile/`) that stores your 6Degrees and LinkedIn sessions.

## First run (login)

On first run the script opens a browser window.  Log in to 6Degrees when prompted
(`--no-linkedin` only needs 6Degrees; a full run will also prompt for LinkedIn),
then press Enter in the terminal.  Subsequent runs reuse the saved session.

Use `--headless` only after confirming the session is saved from a headed run.

## Output

```
output/
  cmpiwh0to0002h2gv60vzjks6/
    contacts.csv          ← all 662 contacts
    photos/
      001_Jane_Doe.jpg
      002_John_Smith.jpg
      ...
  .li_profile/            ← Playwright persists 6Degrees + LinkedIn sessions here
```

## CSV columns

| Column | Source | Notes |
|---|---|---|
| `name` | API | `firstName + lastName` |
| `city` | LinkedIn | Phase 2 only |
| `country` | LinkedIn | Phase 2 only |
| `shared_contacts` | LinkedIn | ~1/662 via API; rest from LinkedIn |
| `title` | API | `position` field |
| `company` | API | |
| `linkedin_url` | API | 662/662 available |
| `photo_filename` | API + LinkedIn | `photos/NNN_Name.jpg` |
| `enriched_at` | Phase 2 | UTC timestamp of LinkedIn visit; the resumability marker |

## LinkedIn enrichment (Phase 2)

- A **persistent Chromium profile** is saved in `output/.li_profile/`
- On first run, a browser window opens — log in to LinkedIn manually, then press Enter in the terminal
- Subsequent runs reuse the saved session (no re-login needed)
- Delay: 3.5–6s between profiles; 30s break every 50 profiles
- Use `--headless` only after confirming the session is saved
- **Resumable**: rows with `enriched_at` set are skipped (visited = done, even if no location was found)
- Photos downloaded via `page.request.get()` (outside page JS context, inherits browser cookies — bypasses LinkedIn's fetch wrapper)
- `"X et périphérie"` → city extracted, country left blank (not assumed France — appears for Geneva, Liverpool, Munich, Vancouver…)

## Data coverage (662-contact list)

| Field | API | LinkedIn |
|---|---|---|
| LinkedIn URL | 662/662 ✓ | — |
| Photo | 62/662 (base64) | ~600 more via Phase 2 |
| City/Country | 0/662 | Phase 2 |
| Shared contacts | ~1/662 | Phase 2 |
