package api

import (
	"context"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/lambase/lambase/db"
)

func RegisterDBRoutes(router fiber.Router) {
	api := router.Group("/db")
	
	// Dynamic routes for any table
	api.Get("/:table", listRows)
	api.Get("/:table/:id", getRow)
	api.Post("/:table", insertRow)
	api.Patch("/:table/:id", updateRow)
	api.Delete("/:table/:id", deleteRow)
}

func validateTable(tableName string) error {
	// Security check: ensure table exists and is not internal
	if strings.HasPrefix(tableName, "_") {
		return fmt.Errorf("access denied to system tables")
	}
	
	// Check if table exists in information_schema
	var exists bool
	err := db.Pool.QueryRow(context.Background(), 
		"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)", 
		tableName).Scan(&exists)
	
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("table not found")
	}
	return nil
}

func listRows(c *fiber.Ctx) error {
	table := c.Params("table")
	if err := validateTable(table); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	// Basic pagination
	limit := c.QueryInt("limit", 100)
	offset := c.QueryInt("offset", 0)

	// Safe query construction
	query := fmt.Sprintf(`SELECT to_jsonb(t) FROM (SELECT * FROM "%s" LIMIT $1 OFFSET $2) t`, table)
	
	rows, err := db.Pool.Query(c.Context(), query, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	results := []interface{}{}
	for rows.Next() {
		var jsonRow interface{}
		if err := rows.Scan(&jsonRow); err != nil {
			continue
		}
		results = append(results, jsonRow)
	}

	return c.JSON(results)
}

func getRow(c *fiber.Ctx) error {
	table := c.Params("table")
	id := c.Params("id")
	if err := validateTable(table); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	query := fmt.Sprintf(`SELECT to_jsonb(t) FROM (SELECT * FROM "%s" WHERE id = $1) t`, table)
	
	var jsonRow interface{}
	err := db.Pool.QueryRow(c.Context(), query, id).Scan(&jsonRow)
	if err == pgx.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Row not found"})
	}
	if err != nil {
		// Try casting ID if it's an integer? No, the prompt says "id: uuid" or similar.
		// If user defined ID as integer, passing string might fail unless Postgres auto-casts.
		// Postgres usually needs strict types.
		// For simplicity in Phase 1, we assume IDs are text/uuid compatible or rely on driver.
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(jsonRow)
}

func insertRow(c *fiber.Ctx) error {
	table := c.Params("table")
	if err := validateTable(table); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	var body map[string]interface{}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	if len(body) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Empty body"})
	}

	cols := []string{}
	placeholders := []string{}
	vals := []interface{}{}
	i := 1

	for k, v := range body {
		cols = append(cols, fmt.Sprintf(`"%s"`, k))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		vals = append(vals, v)
		i++
	}

	query := fmt.Sprintf(
		`INSERT INTO "%s" (%s) VALUES (%s) RETURNING to_jsonb("%s".*)`, 
		table, 
		strings.Join(cols, ", "), 
		strings.Join(placeholders, ", "),
		table,
	)

	var jsonRow interface{}
	err := db.Pool.QueryRow(c.Context(), query, vals...).Scan(&jsonRow)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(201).JSON(jsonRow)
}

func updateRow(c *fiber.Ctx) error {
	table := c.Params("table")
	id := c.Params("id")
	if err := validateTable(table); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	var body map[string]interface{}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	if len(body) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Empty body"})
	}

	setParts := []string{}
	vals := []interface{}{}
	i := 1

	for k, v := range body {
		if k == "id" { continue } // Don't allow updating ID easily
		setParts = append(setParts, fmt.Sprintf(`"%s" = $%d`, k, i))
		vals = append(vals, v)
		i++
	}
	
	vals = append(vals, id) // Add ID as last param

	query := fmt.Sprintf(
		`UPDATE "%s" SET %s WHERE id = $%d RETURNING to_jsonb("%s".*)`,
		table,
		strings.Join(setParts, ", "),
		i,
		table,
	)

	var jsonRow interface{}
	err := db.Pool.QueryRow(c.Context(), query, vals...).Scan(&jsonRow)
	if err == pgx.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Row not found"})
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(jsonRow)
}

func deleteRow(c *fiber.Ctx) error {
	table := c.Params("table")
	id := c.Params("id")
	if err := validateTable(table); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	query := fmt.Sprintf(`DELETE FROM "%s" WHERE id = $1 RETURNING id`, table)
	
	var deletedID interface{}
	err := db.Pool.QueryRow(c.Context(), query, id).Scan(&deletedID)
	if err == pgx.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Row not found"})
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Row deleted", "id": deletedID})
}
