package main

import (
	"log"
	"net/http"
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
}

func main() {
	// DB initialisieren
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

		pageData := PageData{
			Hours:  hours,
			SortBy: sortBy,
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
