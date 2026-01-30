# CV Studio - Builder & Job Scout

Web interface to craft CVs in three layouts, fill blocks, add photos/skills, and export to PDF. Includes a robots-aware single-page job scout that fetches links by keyword without hammering hosts.

## Quick start

```bash
cd projects/active/cv_web
source ../../.buildenv/bin/activate  # if using the shared venv
pip install -r ../../requirements.txt  # core deps
pip install cryptography               # required for encrypted vault
python app.py
# open http://localhost:5018
```

## Features
- 3 CV layouts (modern, sidebar, minimal)
- Inline editing of experience, education, skills, photo
- Sample data button to start faster
- PDF export via html2canvas + jsPDF (client-side)
- Job scout: sends ONE request to provided URL if robots.txt allows; shows links containing a keyword
- Encrypted autosave: enter a PIN (min 4 chars), data is stored server-side encrypted; PIN required to load

## Job-scout safeguards
- Checks robots.txt; if disallowed or unreadable, no request is sent
- Single-page fetch only (no crawling) with custom User-Agent
- Max results clamped to 30; 1-second pause after fetch
- Returns warnings to user; requires explicit URL input

## Notes
- PDF export uses browser rendering; for pixel-perfect output, use Chrome print to PDF as fallback.
- Steer users to provide a specific careers-page URL for better matches.

## Legal
- Respect target site terms, robots.txt, and rate limits.
- Do not bypass CAPTCHAs or access authenticated areas without permission.
- Tool is for personal research; you are responsible for compliant use.
- CV data is encrypted at rest; choose a strong PIN and keep it private.
