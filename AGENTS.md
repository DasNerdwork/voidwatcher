# Voidwatch — Systemübersicht

## Stack
- **Frontend**: React + Vite → `web/src/`, Build: `web/dist/` (Symlink auf `/var/www/voidwatch`)
- **Backend**: FastAPI (`api/main.py`), Port 8090, Systemd: `voidwatch.service`
- **DB**: PostgreSQL 127.0.0.1:5432, DB: `voidwatch`, User: `voidwatcher`, PW aus `api/.env`
- **Sync**: `scripts/sync_api.py` (Cron, jede Minute)

## Dateistruktur
```
/hdd1/warframe/voidwatch/
├── api/
│   ├── main.py       # FastAPI app
│   ├── db.py         # Query-Hilfen (diese nutzen, kein raw SQL)
│   └── .env          # VW_HOST, VW_PORT, VW_NAME, VW_USER, VW_PASSWORD
├── scripts/
│   └── sync_api.py   # Warframe.Market + WFPE Sync
└── web/
    ├── src/          # React-Quellcode
    └── dist/         # Build-Output → Symlink auf /var/www/voidwatch
```

## API-Endpoints
- `GET /api/top?hours=N&limit=M` — Top Items nach Preis/Volumen
- `GET /context?q=...` — Warframe Context API
- `GET /health` — Health Check

## DB-Tabellen
| Tabelle | Inhalt |
|---|---|
| `market_items` | Warframe.Market Items (JSONB raw) |
| `market_stats_48h` | Stündliche Preisstatistiken (48h) |
| `market_stats_90d` | Tägliche Preisstatistiken (90d) |
| `wfpe_items` | Game-Objekte (JOIN via `game_ref`) |
| `metadata` | Sync-Timestamps |

## Deployment
```bash
# Frontend-Änderungen
cd web && npm run build   # kein manuelles Kopieren nötig (Symlink)

# Backend-Neustart
systemctl restart voidwatch
```

## Regeln
- DB-Queries immer via `api/db.py`, kein raw SQL
- PW immer aus `.env`, niemals hardcoden
- Sync testen mit `--dry-run`
- `.agents/`, `export_database_summary.json`, `test.json` nicht committen

## Skills / Zusatz-Dokumentation
- **DB-Zugriff & Schema**: `.cline/skills/voidwatch-db.md`  
  → Immer laden bei: Queries, Schema-Fragen, wfpe_*, market_*, psql