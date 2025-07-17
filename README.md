# VoidWatcher

**VoidWatcher** is a lightweight web-based dashboard for visualizing Warframe market data. It displays the best performing and most traded items over various timeframes using live PostgreSQL data.

---

## 📦 Features

- Fast and minimal Go backend using [Gin](https://github.com/gin-gonic/gin)
- Market analytics with:
  - Top performers by price
  - Top sellers by volume
- Time-based filters (24h, 48h, 7d, 14d, 30d, 90d)
- Data sourced from `item_stats_48h` and `item_stats_90d` tables
- Postgres-powered backend

---

## 🛠 Tech Stack

- **Backend:** Go (`gin-gonic`)
- **Database:** PostgreSQL
- **Frontend:** HTML + Tailwind CSS
- **Templating:** Go HTML templates (`text/template`)

