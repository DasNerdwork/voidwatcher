package main

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"voidwatch/db"

	"github.com/gin-gonic/gin"
)

type TableData struct {
	Title string
	Data  []db.DisplayItem
	Hours int
}

type PageData struct {
	Hours        int
	SortBy       string
	TopPerformer TableData
	TopSeller    TableData
	TopTraded    TableData
	LastUpdated  string
}

func main() {
	// Optional: write logs to file
	logFile, err := os.OpenFile("/hdd1/warframe/voidwatch/log/main.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Fatal("Logfile konnte nicht erstellt werden:", err)
	}
	log.SetOutput(logFile)

	// DB initialisieren
	log.Println("VoidWatcher gestartet")
	db.InitDB()
	defer db.Close()

	router := gin.Default()
	router.Static("/static", "./web/static")
	router.LoadHTMLGlob("web/templates/*")

	router.GET("/", func(c *gin.Context) {
		hours := 24
		sortBy := "price"

		if h := c.Query("hours"); h != "" {
			if parsed, err := strconv.Atoi(h); err == nil {
				hours = parsed
			}
		}

		if s := c.Query("sort"); s == "volume" {
			sortBy = "volume"
		}

		topPerformers, err := db.GetTopPerformers(hours, 10)
		if err != nil {
			log.Printf("DB Fehler: %v", err)
			c.String(http.StatusInternalServerError, "Datenbank Fehler")
			return
		}

		topSellers, err := db.GetTopSellers(hours, 10)
		if err != nil {
			log.Printf("DB Fehler: %v", err)
			c.String(http.StatusInternalServerError, "Datenbank Fehler")
			return
		}

		topTraded, err := db.GetMostTraded(hours, 10)
		if err != nil {
			log.Printf("DB Fehler: %v", err)
			c.String(http.StatusInternalServerError, "Datenbank Fehler")
			return
		}

		lastUpdated, err := db.GetLastUpdated()
		if err != nil {
			log.Printf("Fehler beim Abrufen von last_updated: %v", err)
			lastUpdated = ""
		}

		pageData := PageData{
			Hours:       hours,
			SortBy:      sortBy,
			LastUpdated: lastUpdated,
			TopPerformer: TableData{
				Title: "Best Performing",
				Data:  topPerformers,
				Hours: hours,
			},
			TopSeller: TableData{
				Title: "Top Seller",
				Data:  topSellers,
				Hours: hours,
			},
			TopTraded: TableData{
				Title: "Meistgehandelt",
				Data:  topTraded,
				Hours: hours,
			},
		}

		c.HTML(http.StatusOK, "index.tmpl", pageData)
	})

	router.Run(":8090")
}
