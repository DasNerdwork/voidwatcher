# Voidwatch — Systemübersicht für KI-Assistenten

## Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                         VOIDWATCH SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   Frontend   │      │   Backend    │      │   Datenbank   │  │
│  │  (React)     │◄────►│  (FastAPI)   │◄────►│   (Postgres) │  │
│  │  /web/dist   │      │   /api       │      │              │  │
│  └──────┬───────┘      └──────────────┘      └──────────────┘  │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Nginx (Reverse Proxy)                   │   │
│  │         /var/www/voidwatch (symlink auf dist)           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Komponenten

### 1. Frontend (React)
- **Pfad**: `web/src/` (Quellcode), `/web/dist/` (Build)
- **Build-Tool**: Vite
- **Deployment**: `/web/dist` ist ein Symlink zu `/var/www/voidwatch`
- **Nginx**: Served von `/var/www/voidwatch`
- **Zustand**: React `useState`, API-Calls via `fetch`

### 2. Backend API (FastAPI + Python)
- **Pfad**: `api/`
- **Service**: `api/main.py` (FastAPI app)
- **Datenbank**: `api/db.py` (Query-Hilfen)
- **Runtime**: Systemd-Service (`voidwatch.service`)
- **Port**: 8000 (intern), Nginx als Reverse Proxy

**Endpoints**:
- `GET /api/top?hours=N&limit=M` — Top Items nach Preis/Volumen
- `GET /context?q=...` — Warframe Context API (Warframe-Daten)
- `GET /health` — Health Check

### 3. Datenbank (PostgreSQL)
- **Host**: `127.0.0.1:5432`
- **DB**: `voidwatch`, User: `voidwatcher`
- **Auth**: Passwort aus `api/.env` (VW_PASSWORD)

**Tabellen**:
| Tabelle | Beschreibung |
|---------|-------------|
| `market_items` | Warframe.Market Items (JSONB raw) |
| `market_stats_48h` | Stündliche Preisstatistiken (48h Fenster) |
| `market_stats_90d` | Tägliche Preisstatistiken (90d Fenster) |
| `wfpe_items` | Warframe Public Export Plus (Game-Objekte) |
| `metadata` | Sync-Timestamps |

### 4. Sync Script
- **Pfad**: `scripts/sync_api.py`
- **Zweck**: Pullt Daten von Warframe.Market API + WFPE
- **Trigger**: Cron-Job (siehe `log/cron.log`)
- **Features**:
  - WFPE-Export-Plus mit Feld-Allowlisten
  - Smarte Upserts via `content_hash` Vergleich
  - Automatische Bereinigung alter Stats

## Datenfluss

```
Warframe.Market API
       │
       ▼
┌─────────────────┐
│ sync_api.py     │ — Fetch + Insert/Update
└────────┬────────┘
         │
         ▼
┌─────────────────┐      JOIN      ┌─────────────────┐
│ market_items    │◄──────────────►│ market_stats_*  │
└─────────────────┘                └─────────────────┘
         │
         ▼
┌─────────────────┐
│ wfpe_items      │ — Game-Objekte (JOIN via game_ref)
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Backend API    │ — Query helper functions
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Frontend     │ — Display in Tables
└─────────────────┘
```

## Dateistruktur

```
/hdd1/warframe/voidwatch/
├── api/                    # Backend
│   ├── main.py            # FastAPI app
│   └── db.py              # Database queries
├── scripts/
│   └── sync_api.py        # Daten-Sync
├── web/
│   ├── src/               # React sources
│   └── dist/ → /var/www/voidwatch (symlink)
├── export_database_summary.json  # DB-Dokumentation
├── .env                    # (nicht im Repo)
├── log/                    # Logs
└── AGENTS.md              # Diese Datei
```

## Deployment

### Nginx
- Reverse Proxy: `http://127.0.0.1:8000` → `/`
- Static Files: `/var/www/voidwatch` (React build)

### Systemd Service
```ini
[Unit] Description=Voidwatch API
[Service] Type=simple User=www-data WorkingDirectory=/hdd1/warframe/voidwatch/api ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --log-level info Restart=always
[Install] WantedBy=multi-user.target
```

### Cron Sync
```bash
* * * * * www-data /hdd1/warframe/voidwatch/scripts/sync_api.py >> /hdd1/warframe/voidwatch/log/cron.log 2>&1
```

## Konfiguration

### .env (api/)
```
VW_HOST=127.0.0.1
VW_PORT=5432
VW_NAME=voidwatch
VW_USER=voidwatcher
VW_PASSWORD=<passwort>
```

### Nginx Config
```nginx
server {
    listen 80;
    server_name voidwatch.dasnerdwork.net;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
    
    location /static {
        alias /var/www/voidwatch/dist/;
    }
}
```

## Troubleshooting

### API nicht erreichbar
```bash
systemctl status voidwatch
systemctl restart voidwatch
```

### Database Errors
```bash
psql -h 127.0.0.1 -U voidwatcher -d voidwatch -c "\dt"
```

### Sync Logs
```bash
tail -f /hdd1/warframe/voidwatch/log/cron.log
```

### Frontend Build
```bash
cd web && npm run build
```

## Best Practices

1. **Queries**: Nutze `api/db.py` Query-Hilfen, nicht raw SQL
2. **Datenbank**: Tabellennamen sind `market_*` (nicht `item_*`)
3. **Environment**: PW aus `.env` laden, niemals hardcode
4. **Sync**: Dry-run mit `--dry-run` testen vor production
5. **Git**: `.agents/`, `export_database_summary.json`, `test.json` ignorieren