# VoidWatcher

**VoidWatcher** is a lightweight web-based dashboard for visualizing Warframe market data. It displays the best performing and most traded items over various timeframes using live PostgreSQL data.

## 🌐 Webaccess

The app is accessible via [Cloudflare pages](https://voidwatcher.pages.dev) or for immediate build access and testing purposes via [DasNerdwork.net](https://voidwatch.dasnerdwork.net):


## 📦 Features

- Fast and minimal Python backend using [FastAPI](https://fastapi.tiangolo.com/)
- Market analytics with:
  - Top performers by price
  - Top sellers by volume
- Time-based filters (24h, 48h, 7d, 14d, 30d, 90d)
- Data sourced from `item_stats_48h` and `item_stats_90d` tables
- Postgres-powered backend


## 🛠 Tech Stack

- **Backend:** Python + FastAPI
- **Database:** PostgreSQL
- **Frontend:** React + HTML + Tailwind CSS

