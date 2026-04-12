#!/usr/bin/env python3
"""
check_version.py — VoidWatcher Versions-Check (stündlich via Cron)

Prüft drei Quellen auf Änderungen:

  1. WF Build Label  → api.warframe.com/cdn/worldState.php → "BuildLabel"
                       Enthält den echten Warframe-Build-String (z.B. "2026.02.13.16.03").
                       Ändert sich bei jedem WF-Update/Hotfix.

  2. WFPE Version    → github.com/calamity-inc/warframe-public-export-plus/package.json
                       npm-Paketversion des Repos (z.B. "0.5.103").
                       Ändert sich wenn calamity-inc neue WF-Daten verarbeitet hat.
                       Gut für WFPE-Sync-Trigger, NICHT die WF-Spielversion.

  3. WFM Items-Hash  → api.warframe.market/v2/versions → collections.items
                       Ändert sich wenn WFM neue Items in ihrer DB hat.
                       Gut für Market-Sync-Trigger ohne WFPE-Sync.

Sync-Logik:
  - WF Build geändert  → full sync (WFPE + Market + Stats + Images)
  - WFPE Version geändert (aber WF Build gleich) → full sync
  - WFM Hash geändert (nur WFM) → Market-only sync (--skip-wfpe)
  - Nichts geändert    → nichts tun
  - Sync läuft bereits → überspringen

metadata-Keys (in DB gespeichert, per /api/status abrufbar):
  wf_build_label         → "2025.12.10.19.57" (für Header-Display)
  wf_build_updated_at    → ISO-Timestamp wann sich der Build geändert hat
  wf_build_checked_at    → ISO-Timestamp letzter Check
  wfpe_version           → "0.5.103" (für Footer-Display)
  wfpe_version_updated_at→ ISO-Timestamp
  wfm_items_hash         → Base64-Hash (für Footer gekürzt anzeigen)
  wfm_items_updated_at   → ISO-Timestamp

Cron (stündlich):
  0 * * * * /usr/bin/python3 /hdd1/warframe/voidwatch/scripts/check_version.py

Täglicher Full-Sync (unabhängig, z.B. 3 Uhr):
  0 3 * * * /usr/bin/python3 /hdd1/warframe/voidwatch/scripts/sync_api.py
"""

import os
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


# ── Version fetchers ──────────────────────────────────────────────────────────

def fetch_wf_build_label(timeout: int = 15) -> str | None:
    """
    Holt den WF-Build-String aus worldState.php.
    BuildLabel Format: "2026.02.13.16.03/hash" — wir nehmen nur den Datumsteil.
    Ändert sich bei jedem Update und Hotfix.
    """
    try:
        r = requests.get(WF_MANIFEST_URL, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        label = data.get("BuildLabel")
        if label:
            # "2026.02.13.16.03/m9D2v+..." → nur Datumsteil
            return str(label).split("/")[0].strip()
        log.warning("worldState.php hat kein 'BuildLabel'-Feld")
        return None
    except Exception as e:
        log.error(f"WF BuildLabel fetch fehlgeschlagen: {e}")
        return None


def fetch_wfpe_version(timeout: int = 15) -> str | None:
    """
    Holt die WFPE npm-Paketversion (z.B. "0.5.103").
    NICHT die WF-Spielversion — aber gut als WFPE-Sync-Trigger.
    """
    try:
        r = requests.get(WFPE_PKG_URL, timeout=timeout)
        r.raise_for_status()
        v = r.json().get("version")
        return str(v).strip() if v else None
    except Exception as e:
        log.error(f"WFPE-Version fetch fehlgeschlagen: {e}")
        return None


def fetch_wfm_items_hash(timeout: int = 15) -> str | None:
    """
    Holt den WFM collections.items Hash.
    Ändert sich wenn WFM neue Items aufnimmt.
    """
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

        # ── Versionen fetchen ──
        wf_build   = fetch_wf_build_label()
        wfpe_ver   = fetch_wfpe_version()
        wfm_hash   = fetch_wfm_items_hash()

        # ── Gespeicherte Versionen ──
        wf_build_stored  = get_meta(conn, "wf_build_label")
        wfpe_ver_stored  = get_meta(conn, "wfpe_version")
        wfm_hash_stored  = get_meta(conn, "wfm_items_hash")

        # ── Logging ──
        log.info(f"WF Build:     {wf_build_stored!r:30} → {wf_build!r}")
        log.info(f"WFPE Version: {wfpe_ver_stored!r:30} → {wfpe_ver!r}")
        log.info(f"WFM Hash:     {(wfm_hash_stored or '')[:16]:30} → {(wfm_hash or '')[:16]}")

        # ── Änderungen erkennen ──
        # wf_build_stored is None = erster Lauf → nur speichern, kein Sync triggern
        wf_changed   = bool(wf_build  and wf_build_stored  is not None and wf_build  != wf_build_stored)
        wfpe_changed = bool(wfpe_ver  and wfpe_ver_stored  is not None and wfpe_ver  != wfpe_ver_stored)
        wfm_changed  = bool(wfm_hash  and wfm_hash_stored  is not None and wfm_hash  != wfm_hash_stored)
        first_run    = wf_build_stored is None

        # ── Versionen in DB aktualisieren ──
        if wf_build:
            set_meta(conn, "wf_build_label", wf_build)
            set_meta(conn, "wf_build_checked_at", now)
            if wf_changed:
                set_meta(conn, "wf_build_updated_at", now)
                log.info(f"⚡ WF-Update: {wf_build_stored} → {wf_build}")

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
                reason=f"WF/WFPE Update: build={wf_build}, wfpe={wfpe_ver}"
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