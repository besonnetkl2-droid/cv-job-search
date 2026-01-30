import json
import os
import time
from base64 import urlsafe_b64encode, urlsafe_b64decode
from pathlib import Path
from urllib.parse import urlparse, urljoin
import urllib.robotparser as robotparser
from datetime import datetime

import requests
from bs4 import BeautifulSoup
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from flask import Flask, jsonify, render_template, request, session

from job_hunter import SwissJobHunter

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY", "dev-key-change-in-production")

USER_AGENT = "CVScoutBot/1.0 (+https://example.com/contact)"
DEFAULT_TIMEOUT = 6
MAX_RESULTS = 30
VAULT_DIR = Path(__file__).parent / ".secure"
VAULT_DIR.mkdir(parents=True, exist_ok=True)
MAX_PAYLOAD_BYTES = 1_000_000  # safety limit


class CVFileManager:
    """Manages multiple encrypted CV documents per user"""
    
    def __init__(self, vault_dir):
        self.vault_dir = vault_dir
    
    def get_user_dir(self, pin_hash):
        """Get directory for a specific user (based on hashed PIN)"""
        user_dir = self.vault_dir / pin_hash[:12]
        return user_dir
    
    def list_files(self, pin_hash):
        """List all CV files for a user"""
        user_dir = self.get_user_dir(pin_hash)
        if not user_dir.exists():
            return []
        files = []
        for f in user_dir.glob("*.json"):
            try:
                with open(f) as fp:
                    meta = json.load(fp).get("_meta", {})
                files.append({
                    "id": f.stem,
                    "name": meta.get("name", f.stem),
                    "created": meta.get("created"),
                    "modified": meta.get("modified"),
                })
            except:
                pass
        return sorted(files, key=lambda x: x.get("modified", ""), reverse=True)
    
    def get_file_path(self, pin_hash, file_id):
        """Get full path to a CV file"""
        user_dir = self.get_user_dir(pin_hash)
        return user_dir / f"{file_id}.json"
    
    def file_exists(self, pin_hash, file_id):
        """Check if file exists"""
        return self.get_file_path(pin_hash, file_id).exists()
    
    def delete_file(self, pin_hash, file_id):
        """Delete a CV file"""
        path = self.get_file_path(pin_hash, file_id)
        if path.exists():
            path.unlink()
            return True
        return False


fm = CVFileManager(VAULT_DIR)


def parse_base_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("URL must start with http or https")
    if not parsed.netloc:
        raise ValueError("URL must include a hostname")
    return f"{parsed.scheme}://{parsed.netloc}"


def is_allowed(base_url: str, path: str = "/") -> bool:
    rp = robotparser.RobotFileParser()
    robots_url = urljoin(base_url, "/robots.txt")
    try:
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch(USER_AGENT, path)
    except Exception:
        return False


def scrape_jobs(base_url: str, keyword: str, max_results: int):
    results = []
    warnings = []

    if not is_allowed(base_url, "/"):
        warnings.append("Robots.txt disallows or could not be read. No requests sent.")
        return results, warnings

    headers = {"User-Agent": USER_AGENT}
    try:
        resp = requests.get(base_url, headers=headers, timeout=DEFAULT_TIMEOUT)
        resp.raise_for_status()
    except Exception as exc:
        warnings.append(f"Request failed: {exc}")
        return results, warnings

    time.sleep(1.0)
    soup = BeautifulSoup(resp.text, "lxml")
    anchors = soup.find_all("a")
    keyword_lower = keyword.lower()
    domain = urlparse(base_url).netloc

    for a in anchors:
        text = (a.get_text() or "").strip()
        href = a.get("href") or ""
        if not text or not href:
            continue
        if keyword_lower not in text.lower():
            continue
        absolute_link = urljoin(base_url, href)
        results.append({
            "company": domain,
            "title": text,
            "link": absolute_link,
        })
        if len(results) >= max_results:
            break

    if not results:
        warnings.append("No links matched the keyword on the first page. Try a more specific keyword or a careers page URL.")

    return results, warnings


def derive_key(pin: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=200_000,
    )
    return urlsafe_b64encode(kdf.derive(pin.encode()))


def encrypt_payload(data: dict, pin: str) -> dict:
    if not pin or len(pin) < 4:
        raise ValueError("PIN must be at least 4 characters")
    payload = json.dumps(data).encode()
    if len(payload) > MAX_PAYLOAD_BYTES:
        raise ValueError("Payload too large")
    salt = os.urandom(16)
    key = derive_key(pin, salt)
    token = Fernet(key).encrypt(payload)
    return {"salt": urlsafe_b64encode(salt).decode(), "ciphertext": token.decode()}


def decrypt_payload(vault: dict, pin: str) -> dict:
    salt_b64 = vault.get("salt")
    cipher = vault.get("ciphertext")
    if not salt_b64 or not cipher:
        raise ValueError("Corrupt vault data")
    salt = urlsafe_b64decode(salt_b64.encode())
    key = derive_key(pin, salt)
    data = Fernet(key).decrypt(cipher.encode())
    return json.loads(data.decode())


def get_pin_hash(pin):
    """Create a simple hash of the PIN for directory purposes"""
    import hashlib
    return hashlib.sha256(pin.encode()).hexdigest()


# ============ Routes ============

@app.route("/")
def index():
    """Main page - starts at login"""
    return render_template("index.html")


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    """Verify PIN and list user's CV files"""
    payload = request.get_json(force=True, silent=True) or {}
    pin = (payload.get("pin") or "").strip()
    
    if not pin or len(pin) < 4:
        return jsonify({"error": "PIN must be at least 4 characters"}), 400
    
    pin_hash = get_pin_hash(pin)
    session["pin_hash"] = pin_hash
    session["pin"] = pin  # Store for decryption
    
    files = fm.list_files(pin_hash)
    return jsonify({"status": "authenticated", "files": files})


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    """Logout and clear session"""
    session.clear()
    return jsonify({"status": "logged_out"})


@app.route("/api/files", methods=["GET"])
def api_list_files():
    """List all CV files for authenticated user"""
    pin_hash = session.get("pin_hash")
    if not pin_hash:
        return jsonify({"error": "Not authenticated"}), 401
    
    files = fm.list_files(pin_hash)
    return jsonify({"files": files})


@app.route("/api/files/create", methods=["POST"])
def api_create_file():
    """Create a new CV file"""
    pin_hash = session.get("pin_hash")
    if not pin_hash:
        return jsonify({"error": "Not authenticated"}), 401
    
    payload = request.get_json(force=True, silent=True) or {}
    file_name = (payload.get("name") or "Untitled").strip()
    
    # Create unique ID
    file_id = f"cv_{int(datetime.now().timestamp() * 1000)}"
    
    cv_data = {
        "_meta": {
            "name": file_name,
            "created": datetime.now().isoformat(),
            "modified": datetime.now().isoformat(),
        },
        "name": "",
        "title": "",
        "summary": "",
        "email": "",
        "phone": "",
        "location": "",
        "website": "",
        "experience": [],
        "education": [],
        "skills": [],
        "photo": None,
    }
    
    try:
        encrypted = encrypt_payload(cv_data, session.get("pin"))
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    
    try:
        user_dir = fm.get_user_dir(pin_hash)
        user_dir.mkdir(parents=True, exist_ok=True)
        file_path = fm.get_file_path(pin_hash, file_id)
        with open(file_path, "w") as f:
            json.dump(encrypted, f)
        os.chmod(file_path, 0o600)
    except Exception as e:
        return jsonify({"error": f"Failed to create file: {e}"}), 500
    
    return jsonify({"status": "created", "fileId": file_id, "name": file_name})


@app.route("/api/files/<file_id>/open", methods=["GET"])
def api_open_file(file_id):
    """Open and decrypt a CV file"""
    pin_hash = session.get("pin_hash")
    pin = session.get("pin")
    
    if not pin_hash or not pin:
        return jsonify({"error": "Not authenticated"}), 401
    
    file_path = fm.get_file_path(pin_hash, file_id)
    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404
    
    try:
        with open(file_path) as f:
            vault = json.load(f)
        data = decrypt_payload(vault, pin)
        return jsonify({"data": data})
    except Exception as e:
        return jsonify({"error": f"Failed to open file: {e}"}), 400


@app.route("/api/files/<file_id>/save", methods=["POST"])
def api_save_file(file_id):
    """Save changes to a CV file"""
    pin_hash = session.get("pin_hash")
    pin = session.get("pin")
    
    if not pin_hash or not pin:
        return jsonify({"error": "Not authenticated"}), 401
    
    payload = request.get_json(force=True, silent=True) or {}
    profile = payload.get("profile") or {}
    
    # Update metadata
    profile["_meta"]["modified"] = datetime.now().isoformat()
    
    file_path = fm.get_file_path(pin_hash, file_id)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        encrypted = encrypt_payload(profile, pin)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    
    try:
        with open(file_path, "w") as f:
            json.dump(encrypted, f)
        os.chmod(file_path, 0o600)
    except Exception as e:
        return jsonify({"error": f"Failed to save: {e}"}), 500
    
    return jsonify({"status": "saved"})


@app.route("/api/files/<file_id>/delete", methods=["POST"])
def api_delete_file(file_id):
    """Delete a CV file"""
    pin_hash = session.get("pin_hash")
    
    if not pin_hash:
        return jsonify({"error": "Not authenticated"}), 401
    
    if fm.delete_file(pin_hash, file_id):
        return jsonify({"status": "deleted"})
    else:
        return jsonify({"error": "File not found"}), 404


@app.route("/api/files/<file_id>/rename", methods=["POST"])
def api_rename_file(file_id):
    """Rename a CV file"""
    pin_hash = session.get("pin_hash")
    pin = session.get("pin")
    
    if not pin_hash or not pin:
        return jsonify({"error": "Not authenticated"}), 401
    
    payload = request.get_json(force=True, silent=True) or {}
    new_name = (payload.get("name") or "Untitled").strip()
    
    file_path = fm.get_file_path(pin_hash, file_id)
    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404
    
    try:
        with open(file_path) as f:
            vault = json.load(f)
        data = decrypt_payload(vault, pin)
        data["_meta"]["name"] = new_name
        data["_meta"]["modified"] = datetime.now().isoformat()
        
        encrypted = encrypt_payload(data, pin)
        with open(file_path, "w") as f:
            json.dump(encrypted, f)
        return jsonify({"status": "renamed"})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


# ============ JOB HUNTER: Legal Job Search ============

job_hunter = SwissJobHunter()


@app.route("/api/jobs/search", methods=["POST"])
def search_jobs():
    """
    Search for jobs in Switzerland matching user skills
    
    Request body:
    {
        "skills": ["Python", "React", "DevOps"],
        "location": "Zurich",  # or "Geneva", "Basel", "Switzerland"
        "limit": 100
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    skills = payload.get("skills", [])
    location = payload.get("location", "Switzerland")
    limit = min(int(payload.get("limit", 100)), 200)
    
    if not skills:
        return jsonify({"error": "No skills provided"}), 400
    
    try:
        jobs = job_hunter.search_jobs(skills, location, limit)
        return jsonify({
            "status": "success",
            "total_jobs": len(jobs),
            "high_match": len([j for j in jobs if j.get("match_score", 0) >= 70]),
            "jobs": jobs,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/jobs/<int:job_index>/motivation", methods=["POST"])
def generate_motivation_letter(job_index):
    """
    Generate personalized motivation letter for a specific job
    
    Request body:
    {
        "job": { job object },
        "profile": { user profile }
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    job = payload.get("job")
    profile = payload.get("profile")
    
    if not job or not profile:
        return jsonify({"error": "Missing job or profile"}), 400
    
    try:
        letter = job_hunter.generate_motivation_letter(profile, job)
        return jsonify({
            "status": "success",
            "company": job.get("company", "Unknown"),
            "position": job.get("title", "Unknown"),
            "letter": letter,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/jobs/export-pack", methods=["POST"])
def export_job_pack():
    """
    Create complete application package (CSV + motivation letters + job list)
    
    Request body:
    {
        "jobs": [ job objects ],
        "profile": { user profile }
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    jobs = payload.get("jobs", [])
    profile = payload.get("profile", {})
    
    if not jobs or not profile:
        return jsonify({"error": "Missing jobs or profile"}), 400
    
    try:
        pack = job_hunter.create_application_pack(profile, jobs)
        
        # Return CSV and motivation letters
        return jsonify({
            "status": "success",
            "total_jobs": pack["total_jobs"],
            "high_match_jobs": pack["high_match_jobs"],
            "csv": pack["csv"],
            "motivation_letters": pack["motivation_letters"],
            "tips": [
                "✓ Found " + str(pack["total_jobs"]) + " matching job opportunities",
                "✓ " + str(pack["high_match_jobs"]) + " jobs have 70%+ skill match",
                "✓ Personalized motivation letters generated for each position",
                "✓ Download CSV to track your applications",
                "⏱ Estimated time saved: " + str(pack["total_jobs"] * 10) + " minutes",
            ]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/jobs", methods=["POST"])
def api_jobs():
    """Job scraper (bonus feature)"""
    payload = request.get_json(force=True, silent=True) or {}
    base_url_raw = payload.get("baseUrl", "").strip()
    keyword = (payload.get("keyword") or "job").strip()
    max_results = int(payload.get("maxResults") or 10)
    max_results = max(1, min(max_results, MAX_RESULTS))

    if not base_url_raw:
        return jsonify({"error": "baseUrl is required"}), 400

    try:
        base_url = parse_base_url(base_url_raw)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    results, warnings = scrape_jobs(base_url, keyword, max_results)
    return jsonify({
        "results": results,
        "warnings": warnings,
        "note": "Respect robots.txt, rate limits, and site terms.",
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5018, debug=True)
