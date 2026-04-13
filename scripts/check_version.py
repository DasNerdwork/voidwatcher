#!/usr/bin/env python3
"""
check_version.py — VoidWatcher Versions-Check (stündlich via Cron)

Prüft drei Quellen auf Änderungen:

  1. WF Build Label  → api.warframe.com/cdn/worldState.php → "BuildLabel"
  2. WF Update Label → api.warframe.com/cdn/worldState.php → "Events" (neuestes Patch-Notes-Event)
  3. WF Update URL   → Patch-Notes-URL zum Update-Label (klickbar im Frontend)
  4. WFPE Version    → github.com/calamity-inc/warframe-public-export-plus/package.json
  5. WFM Items-Hash  → api.warframe.market/v2/versions → collections.items

metadata-Keys:
  wf_build_label             → "2026.04.09.13.53"
  wf_build_updated_at        → ISO-Timestamp
  wf_build_checked_at        → ISO-Timestamp letzter Check
  wf_update_label            → "Voruna Prime: Hotfix 42.0.7"
  wf_update_label_updated_at → ISO-Timestamp
  wf_update_url              → "https://www.warframe.com/en/patch-notes/pc/42-0-7"
  wfpe_version               → "0.5.105"
  wfpe_version_updated_at    → ISO-Timestamp
  wfm_items_hash             → Base64-Hash
  wfm_items_updated_at       → ISO-Timestamp
"""

import os
import re
import sys
import subprocess
import logging
from pathlib import Path
from datetime import datetime, timezone

import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / "../api/.env")

DB_CONFIG = {
    "dbname":   os.getenv("VW_NAME"),
    "user":     os.getenv("VW_USER"),
    "password": os.getenv("VW_PASSWORD"),
    "host":     os.getenv("VW_HOST", "localhost"),
    "port":     int(os.getenv("VW_PORT", 5432)),
}

WF_MANIFEST_URL = "https://api.warframe.com/cdn/worldState.php"
WFPE_PKG_URL    = "https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/senpai/package.json"
WFM_VER_URL     = "https://api.warframe.market/v2/versions"

SYNC_SCRIPT       = BASE_DIR / "sync_api.py"
LOCK_FILE         = BASE_DIR.parent / "sync.lock"
MIN_SYNC_INTERVAL = 60 * 30  # Sekunden

PATCH_NOTES_URL_PATTERN = re.compile(
    r'warframe\.com/(?:en/)?patch-notes/pc/(\d+)-(\d+)-(\d+)(?:-(\d+))?'
)

# ── Logging ───────────────────────────────────────────────────────────────────

log_dir = BASE_DIR.parent / "log"
log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%d.%m.%Y %H:%M:%S",
    handlers=[
        logging.FileHandler(log_dir / "version_check.log"),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger("check_version")

# ── DB ────────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=psycopg2.extras.RealDictCursor)


def get_meta(conn, key: str) -> str | None:
    with conn.cursor() as cur:
        cur.execute("SELECT value FROM metadata WHERE key = %s", (key,))
        row = cur.fetchone()
        return row["value"] if row else None


def set_meta(conn, key: str, value: str):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO metadata (key, value) VALUES (%s, %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """, (key, value))
    conn.commit()


def was_synced_recently(conn) -> bool:
    last = get_meta(conn, "last_updated")
    if not last:
        return False
    try:
        ts  = datetime.fromisoformat(last.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - ts).total_seconds()
        return age < MIN_SYNC_INTERVAL
    except Exception:
        return False


# ── Update Label Parsing ──────────────────────────────────────────────────────

def _parse_update_label(message: str, prop_url: str) -> tuple[str, str] | None:
    msg = message.strip()

    # "NAME: Hotfix/Update X.Y.Z [+ ...]"
    for keyword in ("Hotfix", "Update"):
        pattern = f": {keyword} "
        if pattern in msg:
            name, version_part = msg.split(": ", 1)

            if " + " in version_part:
                last_ver = version_part.split(" + ")[-1].strip()
                version_part = f"{keyword} {last_ver}"

            return name.strip(), version_part.strip()

    # "NAME Patch Notes"
    if "Patch Notes" in msg:
        name = msg.replace(" Patch Notes", "").strip()
        m = PATCH_NOTES_URL_PATTERN.search(prop_url)

        if m:
            major, minor, patch_v, build = m.groups()

            if minor == "0" and patch_v == "0":
                return name, f"Update {major}"
            elif build:
                return name, f"Hotfix {major}.{minor}.{patch_v}.{build}"
            else:
                return name, f"Hotfix {major}.{minor}.{patch_v}"

        return name, ""

    return None


# ── WorldState Fetch (einmal, alle WF-Werte) ─────────────────────────────────

def fetch_worldstate(timeout: int = 15) -> tuple[str | None, str | None, str | None, str | None]:
    """
    Holt worldState.php einmal und extrahiert:
      - build_label:  Datumsteil des BuildLabel-Strings (z.B. "2026.04.09.13.53")
      - update_label: Menschenlesbares Update-Label (z.B. "Voruna Prime: Hotfix 42.0.7")
      - update_url:   Patch-Notes-URL (z.B. "https://www.warframe.com/en/patch-notes/pc/42-0-7")

    Gibt (build_label, update_label, update_url) zurück.
    """
    try:
        r = requests.get(WF_MANIFEST_URL, timeout=timeout)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        log.error(f"worldState.php fetch fehlgeschlagen: {e}")
        return None, None, None

    # ── Build Label ──
    build_label = None
    raw_label = data.get("BuildLabel")
    if raw_label:
        build_label = str(raw_label).split("/")[0].strip()
    else:
        log.warning("worldState.php hat kein 'BuildLabel'-Feld")

    # ── Update Label + URL ──
    update_label = None
    update_url   = None
    candidates   = []

    for ev in data.get("Events", []):
        prop = ev.get("Prop", "")
        if not PATCH_NOTES_URL_PATTERN.search(prop):
            continue

        messages = ev.get("Messages", [])
        en_msg = next(
            (m["Message"] for m in messages if m.get("LanguageCode") == "en"),
            None
        )
        if not en_msg:
            continue

        label = _parse_update_label(en_msg, prop)
        if not label:
            continue

        date_val = (ev.get("Date") or {}).get("$date", {})
        if isinstance(date_val, dict):
            date_val = date_val.get("$numberLong", 0)
        candidates.append((int(date_val or 0), label, prop))

    if candidates:
        candidates.sort(reverse=True)
        _, update_label, update_url = candidates[0]
    else:
        log.warning("Kein Patch-Notes-Event in worldState gefunden")

    return build_label, update_label, update_url


# ── Weitere Version Fetcher ───────────────────────────────────────────────────

def fetch_wfpe_version(timeout: int = 15) -> str | None:
    try:
        r = requests.get(WFPE_PKG_URL, timeout=timeout)
        r.raise_for_status()
        v = r.json().get("version")
        return str(v).strip() if v else None
    except Exception as e:
        log.error(f"WFPE-Version fetch fehlgeschlagen: {e}")
        return None


def fetch_wfm_items_hash(timeout: int = 15) -> str | None:
    try:
        r = requests.get(WFM_VER_URL, timeout=timeout,
                         headers={"accept": "application/json"})
        r.raise_for_status()
        h = (r.json().get("data") or {}).get("collections", {}).get("items")
        return str(h).strip() if h else None
    except Exception as e:
        log.error(f"WFM-Hash fetch fehlgeschlagen: {e}")
        return None


# ── Lock ──────────────────────────────────────────────────────────────────────

def is_sync_running() -> bool:
    if not LOCK_FILE.exists():
        return False
    try:
        pid = int(LOCK_FILE.read_text().strip())
        os.kill(pid, 0)
        return True
    except (ValueError, ProcessLookupError, PermissionError):
        log.warning("Veraltetes Lock-File entfernt")
        LOCK_FILE.unlink(missing_ok=True)
        return False


# ── Sync trigger ──────────────────────────────────────────────────────────────

def trigger_sync(skip_wfpe: bool = False, reason: str = ""):
    cmd = [sys.executable, str(SYNC_SCRIPT)]
    if skip_wfpe:
        cmd.append("--skip-wfpe")
    log.info(f"Starte Sync — Grund: {reason}")
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, cwd=str(BASE_DIR))
        LOCK_FILE.write_text(str(proc.pid))
        log.info(f"Sync gestartet (PID {proc.pid})")
    except Exception as e:
        log.error(f"Sync-Start fehlgeschlagen: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("─── Versions-Check ───")

    if is_sync_running():
        log.info("Sync läuft bereits — überspringe.")
        return

    conn = get_conn()
    try:
        if was_synced_recently(conn):
            log.info(f"Letzter Sync < {MIN_SYNC_INTERVAL // 60} min her — überspringe.")
            return

        now = datetime.now(timezone.utc).isoformat()

        # ── Versionen fetchen (worldState einmal) ──
        wf_build, wf_update_label, wf_update_url = fetch_worldstate()
        wfpe_ver                                  = fetch_wfpe_version()
        wfm_hash                                  = fetch_wfm_items_hash()

        # ── Gespeicherte Versionen ──
        wf_build_stored        = get_meta(conn, "wf_build_label")
        wf_update_name_stored  = get_meta(conn, "wf_update_name")
        wf_update_ver_stored   = get_meta(conn, "wf_update_version")
        wf_update_label_stored = (
            f"{wf_update_name_stored}: {wf_update_ver_stored}"
            if wf_update_name_stored and wf_update_ver_stored
            else wf_update_name_stored
        )
        wf_update_url_stored   = get_meta(conn, "wf_update_url")
        wfpe_ver_stored        = get_meta(conn, "wfpe_version")
        wfm_hash_stored        = get_meta(conn, "wfm_items_hash")

        # ── Logging ──
        log.info(f"WF Build:        {wf_build_stored!r:40} → {wf_build!r}")
        log.info(f"WF Update Label: {wf_update_label_stored!r:40} → {wf_update_label!r}")
        log.info(f"WF Update URL:   ...{(wf_update_url_stored or '')[-30:]:37} → ...{(wf_update_url or '')[-30:]}")
        log.info(f"WFPE Version:    {wfpe_ver_stored!r:40} → {wfpe_ver!r}")
        log.info(f"WFM Hash:        {(wfm_hash_stored or '')[:16]:40} → {(wfm_hash or '')[:16]}")

        # ── Änderungen erkennen ──
        first_run     = wf_build_stored is None
        wf_changed    = bool(wf_build        and not first_run and wf_build        != wf_build_stored)
        wfpe_changed  = bool(wfpe_ver        and wfpe_ver_stored        is not None and wfpe_ver        != wfpe_ver_stored)
        wfm_changed   = bool(wfm_hash        and wfm_hash_stored        is not None and wfm_hash        != wfm_hash_stored)
        wf_update_label_str = f"{wf_update_label[0]}: {wf_update_label[1]}" if wf_update_label else None
        label_changed = bool(wf_update_label_str and wf_update_label_stored is not None and wf_update_label_str != wf_update_label_stored)

        # ── Versionen in DB aktualisieren ──
        if wf_build:
            set_meta(conn, "wf_build_label", wf_build)
            set_meta(conn, "wf_build_checked_at", now)
            if wf_changed:
                set_meta(conn, "wf_build_updated_at", now)
                log.info(f"⚡ WF-Build-Update: {wf_build_stored} → {wf_build}")

        if wf_update_label:
            name, version = wf_update_label   # ist bereits ein Tuple aus _parse_update_label
            set_meta(conn, "wf_update_name", name)
            set_meta(conn, "wf_update_version", version)
            if label_changed:
                set_meta(conn, "wf_update_label_updated_at", now)
                log.info(f"⚡ WF-Label-Update: {wf_update_label_stored} → {name}: {version}")

        if wf_update_url:
            set_meta(conn, "wf_update_url", wf_update_url)

        if wfpe_ver:
            set_meta(conn, "wfpe_version", wfpe_ver)
            if wfpe_changed:
                set_meta(conn, "wfpe_version_updated_at", now)
                log.info(f"⚡ WFPE-Update: {wfpe_ver_stored} → {wfpe_ver}")

        if wfm_hash:
            set_meta(conn, "wfm_items_hash", wfm_hash)
            if wfm_changed:
                set_meta(conn, "wfm_items_updated_at", now)
                log.info(f"⚡ WFM-Update erkannt")

        # ── Sync-Entscheidung ──
        if first_run:
            log.info("Erster Lauf — Versionen gespeichert, kein Sync getriggert.")
        elif wf_changed or wfpe_changed:
            trigger_sync(
                skip_wfpe=False,
                reason=f"WF/WFPE Update: build={wf_build}, label={wf_update_label}, wfpe={wfpe_ver}"
            )
        elif wfm_changed:
            trigger_sync(
                skip_wfpe=True,
                reason="WFM-Datenbank aktualisiert"
            )
        else:
            log.info("Keine Änderungen — kein Sync nötig.")

    finally:
        conn.close()

    log.info("─── Fertig ───")


if __name__ == "__main__":
    main()