# CV Studio - Production (100% Client-Side, No Backend)

**Private, encrypted CV builder that runs fully in your browser. No server. No API calls. Zero data leaves your device.**

## Quick Start

1. **Local**: Open `index.html` in your browser.
2. **Port-forwarded VPN**: Host on your VPN endpoint; open in browser.
3. Set a PIN (min 4 chars) to enable autosave.
4. Autosaves to browser's localStorage, encrypted.
5. Export vault file to backup/move to another device.
6. Generate PDF anytime.

## Features

- **3 CV Layouts**: Modern, Sidebar, Minimal.
- **Encrypted localStorage autosave**: PIN-gated; no backend.
- **Export vault file**: Download encrypted `.vault` file (portable).
- **Import vault file**: Restore from saved `.vault` file on any device (same PIN).
- **PDF export**: Client-side via html2canvas + jsPDF.
- **No job scout** (job scout requires backend scraper; see full `app.py` for that).

## How It Works

1. **PIN Setup**: Enter a PIN (4+ chars) in the secure bar.
2. **Autosave**: As you edit, data autosaves to localStorage (encrypted with Web Crypto AES-GCM).
3. **Load**: Reload page → data auto-restores (with PIN prompt if needed).
4. **Export**: Click "Export vault file" → downloads ciphertext+salt+iv as `.vault`.
5. **Import**: Click "Import vault file" → select `.vault`, enter PIN → restore locally.
6. **PDF**: Click "Generate PDF" → instant download.

## Security Notes

- **Client-side encryption**: AES-GCM (NIST standard).
- **PIN derivation**: PBKDF2, 200k iterations, SHA-256.
- **No backend**: Everything runs in your browser; no network requests except CDN for PDF libs.
- **localStorage stays local**: Unless you export, data never leaves your device.
- **If PIN is lost**: That encrypted vault is gone; start fresh.

## Deployment

**Single file deployment:**
- Copy `prod/` folder to your server or VPN endpoint.
- No dependencies, no pip install, no Flask.
- Just serve the 3 static files (`index.html`, `static/style.css`, `static/app.js`).
- Works offline after first load (CDN libs are used, so needs internet for first PDF export).

**Example (simple Python server):**
```bash
cd prod
python3 -m http.server 8080
# open http://localhost:8080
```

**Or any static web server:**
```bash
# nginx, Apache, Caddy, etc.
# Just point to the prod/ folder as document root
```

## What's NOT Included

- Job scout (requires backend API).
- Database (all data in your browser).
- Cloud sync (intentional; exports give portability).

## Privacy

- No telemetry.
- No tracking.
- No phoning home.
- 100% your data, 100% your machine.

---

**Deploy this on a private VPN and share the link with team/family. Everyone gets their own encrypted vault.**
