package core

import (
	"context"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/lambase/lambase/db"
)

type Column struct {
	Name       string `json:"name"`
	Type       string `json:"type"` // text, integer, boolean, etc.
	PrimaryKey bool   `json:"primaryKey"`
	Unique     bool   `json:"unique"`
	Nullable   bool   `json:"nullable"`
	Default    string `json:"default"`
}

type CreateTableRequest struct {
	Name    string   `json:"name"`
	Columns []Column `json:"columns"`
}

// Map frontend types to Postgres types
var typeMap = map[string]string{
	"text":     "TEXT",
	"integer":  "INTEGER",
	"real":     "REAL",
	"boolean":  "BOOLEAN",
	"json":     "JSONB",
	"datetime": "TIMESTAMPTZ",
	"uuid":     "UUID",
}

func RegisterSchemaRoutes(router fiber.Router) {
	api := router.Group("/schema")
	api.Get("/tables", listTables)
	api.Post("/tables", createTable)
	api.Delete("/tables/:name", dropTable)
}

func listTables(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(c.Context(), `
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' 
		AND table_name NOT LIKE '\_%' 
		ORDER BY table_name
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		tables = append(tables, name)
	}

	return c.JSON(tables)
}

func createTable(c *fiber.Ctx) error {
	var req CreateTableRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Name == "" || len(req.Columns) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Table name and columns required"})
	}

	// Sanitize table name (basic alphanumeric check)
	// In production, use stricter validation
	if strings.HasPrefix(req.Name, "_") {
		return c.Status(400).JSON(fiber.Map{"error": "User tables cannot start with underscore"})
	}

	var colDefs []string
	for _, col := range req.Columns {
		// Basic sanitization
		dataType, ok := typeMap[col.Type]
		if !ok {
			dataType = "TEXT" // Default
		}

		def := fmt.Sprintf(`"%s" %s`, col.Name, dataType)
		
		if col.PrimaryKey {
			def += " PRIMARY KEY"
		} else {
			if !col.Nullable {
				def += " NOT NULL"
			}
			if col.Unique {
				def += " UNIQUE"
			}
			if col.Default != "" {
				def += fmt.Sprintf(" DEFAULT %s", col.Default)
			}
		}
		colDefs = append(colDefs, def)
	}

	query := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS "%s" (%s);`, req.Name, strings.Join(colDefs, ", "))
	
	_, err := db.Pool.Exec(c.Context(), query)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Table created", "table": req.Name})
}

func dropTable(c *fiber.Ctx) error {
	name := c.Params("name")
	if list, err := getTableList(c.Context()); err == nil {
		// Validate table exists and is not internal
		found := false
		for _, t := range list {
			if t == name {
				found = true
				break
			}
		}
		if !found {
			return c.Status(404).JSON(fiber.Map{"error": "Table not found or access denied"})
		}
	}

	query := fmt.Sprintf(`DROP TABLE IF EXISTS "%s"`, name)
	_, err := db.Pool.Exec(c.Context(), query)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Table dropped", "table": name})
}

// Helper to check table existence/validity internally
func getTableList(ctx interface{}) ([]string, error) {
	// Reusing logic from listTables but simplified for internal check
	// Because ctx is fiber.Ctx or context.Context, need to handle carefully.
	// For now, let's just query db directly.
	rows, err := db.Pool.Query(context.Background(), `
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' 
		AND table_name NOT LIKE '\_%'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		rows.Scan(&name)
		tables = append(tables, name)
	}
	return tables, nil
}
