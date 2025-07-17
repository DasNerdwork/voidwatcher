package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	_ "github.com/lib/pq"
)

type DisplayItem struct {
	Name     string
	DateTime time.Time
	AvgPrice float64
	MinPrice float64
	MaxPrice float64
	Volume   int
}

// Globale Datenbankverbindung
var db *sql.DB

// Datenbankverbindung initialisieren
func InitDB() {
	err := godotenv.Load()
	if err != nil {
		log.Printf("⚠️  Konnte .env Datei nicht laden (optional): %v", err)
	}
	host := os.Getenv("VW_HOST")
	port := os.Getenv("VW_PORT")
	user := os.Getenv("VW_USER")
	password := os.Getenv("VW_PASSWORD")
	dbname := os.Getenv("VW_NAME")
	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname,
	)
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Fehler beim Öffnen der Datenbankverbindung: %v", err)
	}

	if err = db.Ping(); err != nil {
		log.Fatalf("Fehler beim Verbinden mit der Datenbank: %v", err)
	}
	fmt.Println("✅ Datenbankverbindung erfolgreich hergestellt.")
}

// GetLastUpdated liest das letzte Update-Datum aus der metadata-Tabelle
func GetLastUpdated() (string, error) {
	var raw string
	err := db.QueryRow(`SELECT value FROM metadata WHERE key = 'last_updated'`).Scan(&raw)
	if err != nil {
		return "", err
	}

	parsed, err := time.Parse("2006-01-02T15:04:05.999999", raw)
	if err != nil {
		log.Printf("⚠️ Fehler beim Parsen von Datum: %v\nraw = %s", err, raw)
		return raw, nil // fallback: raw string
	}

	// Format to: "17.07.2025 14:05"
	return parsed.Format("02.01.2006 15:04"), nil
}

// Top Performer nach avg_price (24h oder 48h)
func GetTopPerformers(hours int, limit int) ([]DisplayItem, error) {
	var table string
	switch {
	case hours == 24 || hours == 48:
		table = "item_stats_48h"
	case hours == 168 || hours == 336 || hours == 720 || hours == 2160:
		table = "item_stats_90d"
	default:
		return nil, fmt.Errorf("ungültiger Zeitraum: nur 24, 48, 168, 336, 720 oder 2160 Stunden erlaubt")
	}

	query := fmt.Sprintf(`
		SELECT
			url_name,
			MAX(datetime) as datetime,
			AVG(avg_price) as avg_price,
			MIN(min_price) as min_price,
			MAX(max_price) as max_price,
			SUM(volume) as volume
		FROM %s
		WHERE datetime >= NOW() - INTERVAL '%d hour'
		GROUP BY url_name
		ORDER BY avg_price DESC
		LIMIT $1
	`, table, hours)

	rows, err := db.Query(query, limit*2)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rawResults []DisplayItem
	for rows.Next() {
		var item DisplayItem
		err := rows.Scan(&item.Name, &item.DateTime, &item.AvgPrice, &item.MinPrice, &item.MaxPrice, &item.Volume)
		if err != nil {
			return nil, err
		}
		rawResults = append(rawResults, item)
	}

	if len(rawResults) == 0 {
		return rawResults, nil
	}

	// Alle mit AvgPrice > 20000 rausfiltern
	var filtered []DisplayItem
	for _, item := range rawResults {
		if item.AvgPrice <= 20000 {
			filtered = append(filtered, item)
		}
	}

	// Auf Limit kürzen
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}

	return filtered, nil
}

// Top Verkäufer nach Verkaufsvolumen (24h oder 48h)
func GetTopSellers(hours int, limit int) ([]DisplayItem, error) {
	var table string
	switch {
	case hours == 24 || hours == 48:
		table = "item_stats_48h"
	case hours == 168 || hours == 336 || hours == 720 || hours == 2160:
		table = "item_stats_90d"
	default:
		return nil, fmt.Errorf("ungültiger Zeitraum: nur 24, 48, 168, 336, 720 oder 2160 Stunden erlaubt")
	}

	query := fmt.Sprintf(`
		SELECT
			url_name,
			MAX(datetime) as datetime,
			AVG(avg_price) as avg_price,
			MIN(min_price) as min_price,
			MAX(max_price) as max_price,
			SUM(volume) as volume
		FROM %s
		WHERE datetime >= NOW() - INTERVAL '%d hour'
		GROUP BY url_name
		ORDER BY volume DESC
		LIMIT $1
	`, table, hours)

	rows, err := db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []DisplayItem
	for rows.Next() {
		var item DisplayItem
		err := rows.Scan(&item.Name, &item.DateTime, &item.AvgPrice, &item.MinPrice, &item.MaxPrice, &item.Volume)
		if err != nil {
			return nil, err
		}
		results = append(results, item)
	}

	return results, nil
}

// Meistgehandelte Items nach Volumen (24h oder 48h)
func GetMostTraded(hours int, limit int) ([]DisplayItem, error) {
	var table string
	switch {
	case hours == 24 || hours == 48:
		table = "item_stats_48h"
	case hours == 168 || hours == 336 || hours == 720 || hours == 2160:
		table = "item_stats_90d"
	default:
		return nil, fmt.Errorf("ungültiger Zeitraum: nur 24, 48, 168, 336, 720 oder 2160 Stunden erlaubt")
	}

	query := fmt.Sprintf(`
		SELECT
			url_name,
			MAX(datetime) as datetime,
			AVG(avg_price) as avg_price,
			MIN(min_price) as min_price,
			MAX(max_price) as max_price,
			SUM(volume) as volume
		FROM %s
		WHERE datetime >= NOW() - INTERVAL '%d hour'
		GROUP BY url_name
		ORDER BY volume DESC
		LIMIT $1
	`, table, hours)

	rows, err := db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []DisplayItem
	for rows.Next() {
		var item DisplayItem
		err := rows.Scan(&item.Name, &item.DateTime, &item.AvgPrice, &item.MinPrice, &item.MaxPrice, &item.Volume)
		if err != nil {
			return nil, err
		}
		results = append(results, item)
	}

	return results, nil
}

func Close() {
	if db != nil {
		db.Close()
	}
}
