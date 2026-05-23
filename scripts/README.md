# Export list to CSV + photos

## Setup (one-time)

```bash
cd scripts
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

## Get your session cookie

1. Open https://6degrees.aequus.money in Chrome
2. DevTools → Application → Cookies → `https://6degrees.aequus.money`
3. Copy the value of `next-auth.session-token`

```bash
export SIXDEGREES_COOKIE="next-auth.session-token=<value>"
```

## Run

```bash
# Full export: API fetch + LinkedIn enrichment
SIXDEGREES_COOKIE="..." python scripts/export_list.py cmpiwh0to0002h2gv60vzjks6

# API only (fast, no LinkedIn login needed)
SIXDEGREES_COOKIE="..." python scripts/export_list.py cmpiwh0to0002h2gv60vzjks6 --no-linkedin

# Re-run LinkedIn enrichment on existing CSV (resumable)
python scripts/export_list.py cmpiwh0to0002h2gv60vzjks6 --linkedin-only

# Quick test on first 10 contacts
SIXDEGREES_COOKIE="..." python scripts/export_list.py cmpiwh0to0002h2gv60vzjks6 --limit 10
```

## Output

```
output/
  cmpiwh0to0002h2gv60vzjks6/
    contacts.csv          ← all 662 contacts
    photos/
      001_Jane_Doe.jpg
      002_John_Smith.jpg
      ...
  .li_profile/            ← Playwright persists LinkedIn session here
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

## LinkedIn enrichment (Phase 2)

- A **persistent Chromium profile** is saved in `output/.li_profile/`
- On first run, a browser window opens — log in to LinkedIn manually, then press Enter in the terminal
- Subsequent runs reuse the saved session (no re-login needed)
- Delay: 3.5–6s between profiles; 30s break every 50 profiles
- Use `--headless` only after confirming the session is saved
- **Resumable**: rows that already have `city + country` are skipped

## Data coverage (662-contact list)

| Field | API | LinkedIn |
|---|---|---|
| LinkedIn URL | 662/662 ✓ | — |
| Photo | 62/662 (base64) | ~600 more via Phase 2 |
| City/Country | 0/662 | Phase 2 |
| Shared contacts | ~1/662 | Phase 2 |
