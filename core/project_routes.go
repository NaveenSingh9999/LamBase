package core

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func (s *dashboardService) listSchemas(c *fiber.Ctx) error {
	return c.JSON([]string{"public", "auth", "storage"})
}

func (s *dashboardService) listTables(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	rows, err := pool.Query(c.Context(), `
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = $1
		ORDER BY table_name
	`, schema)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load tables"})
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

func (s *dashboardService) createTable(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	if schema == "" {
		schema = "public"
	}

	var req struct {
		Name    string   `json:"name"`
		Columns []Column `json:"columns"`
	}
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Name) == "" || len(req.Columns) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Table name and columns required"})
	}

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	var colDefs []string
	for _, col := range req.Columns {
		dataType, ok := typeMap[col.Type]
		if !ok {
			dataType = "TEXT"
		}
		def := fmt.Sprintf("\"%s\" %s", col.Name, dataType)
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

	query := fmt.Sprintf("CREATE TABLE IF NOT EXISTS \"%s\".\"%s\" (%s)", schema, req.Name, strings.Join(colDefs, ", "))
	if _, err := pool.Exec(c.Context(), query); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Table created", "table": req.Name})
}

func (s *dashboardService) dropTable(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	query := fmt.Sprintf(`DROP TABLE IF EXISTS "%s"."%s"`, schema, table)
	if _, err := pool.Exec(c.Context(), query); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Table dropped", "table": table})
}

func (s *dashboardService) listColumns(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	rows, err := pool.Query(c.Context(), `
		SELECT column_name, data_type, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = $2
		ORDER BY ordinal_position
	`, schema, table)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load columns"})
	}
	defer rows.Close()

	columns := []fiber.Map{}
	for rows.Next() {
		var name, dataType, nullable string
		var defaultVal *string
		if err := rows.Scan(&name, &dataType, &nullable, &defaultVal); err != nil {
			continue
		}
		columns = append(columns, fiber.Map{
			"name": name,
			"type": dataType,
			"nullable": nullable == "YES",
			"default": defaultVal,
		})
	}

	return c.JSON(columns)
}

func (s *dashboardService) listRows(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	limit := c.QueryInt("limit", 100)
	offset := c.QueryInt("offset", 0)

	query := fmt.Sprintf(`SELECT to_jsonb(t) FROM (SELECT * FROM "%s"."%s" LIMIT $1 OFFSET $2) t`, schema, table)
	rows, err := pool.Query(c.Context(), query, limit, offset)
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

func (s *dashboardService) getRow(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")
	id := c.Params("id")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	query := fmt.Sprintf(`SELECT to_jsonb(t) FROM (SELECT * FROM "%s"."%s" WHERE id = $1) t`, schema, table)
	var jsonRow interface{}
	err = pool.QueryRow(c.Context(), query, id).Scan(&jsonRow)
	if err == pgx.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Row not found"})
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(jsonRow)
}

func (s *dashboardService) insertRow(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
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
	idx := 1
	for k, v := range body {
		cols = append(cols, fmt.Sprintf("\"%s\"", k))
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		vals = append(vals, v)
		idx++
	}

	query := fmt.Sprintf(`INSERT INTO "%s"."%s" (%s) VALUES (%s) RETURNING to_jsonb("%s".*)`, schema, table, strings.Join(cols, ", "), strings.Join(placeholders, ", "), table)
	var jsonRow interface{}
	if err := pool.QueryRow(c.Context(), query, vals...).Scan(&jsonRow); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(201).JSON(jsonRow)
}

func (s *dashboardService) updateRow(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")
	id := c.Params("id")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
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
	idx := 1
	for k, v := range body {
		if k == "id" {
			continue
		}
		setParts = append(setParts, fmt.Sprintf("\"%s\" = $%d", k, idx))
		vals = append(vals, v)
		idx++
	}
	vals = append(vals, id)

	query := fmt.Sprintf(`UPDATE "%s"."%s" SET %s WHERE id = $%d RETURNING to_jsonb("%s".*)`, schema, table, strings.Join(setParts, ", "), idx, table)
	var jsonRow interface{}
	if err := pool.QueryRow(c.Context(), query, vals...).Scan(&jsonRow); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(jsonRow)
}

func (s *dashboardService) deleteRow(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")
	id := c.Params("id")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	query := fmt.Sprintf(`DELETE FROM "%s"."%s" WHERE id = $1 RETURNING id`, schema, table)
	var deletedID interface{}
	if err := pool.QueryRow(c.Context(), query, id).Scan(&deletedID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Row deleted", "id": deletedID})
}

func (s *dashboardService) listRelationships(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	rows, err := pool.Query(c.Context(), `
		SELECT
			kcu.column_name,
			ccu.table_schema AS foreign_table_schema,
			ccu.table_name AS foreign_table_name,
			ccu.column_name AS foreign_column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_name = kcu.constraint_name
		JOIN information_schema.constraint_column_usage ccu
		  ON ccu.constraint_name = tc.constraint_name
		WHERE tc.constraint_type = 'FOREIGN KEY'
		  AND tc.table_schema = $1
		  AND tc.table_name = $2
	`, schema, table)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load relationships"})
	}
	defer rows.Close()

	relationships := []fiber.Map{}
	for rows.Next() {
		var column, foreignSchema, foreignTable, foreignColumn string
		if err := rows.Scan(&column, &foreignSchema, &foreignTable, &foreignColumn); err != nil {
			continue
		}
		relationships = append(relationships, fiber.Map{
			"column": column,
			"foreignSchema": foreignSchema,
			"foreignTable": foreignTable,
			"foreignColumn": foreignColumn,
		})
	}

	return c.JSON(relationships)
}

func (s *dashboardService) createRelationship(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	schema := c.Params("schema")
	table := c.Params("table")

	var req struct {
		Column        string `json:"column"`
		ForeignSchema string `json:"foreignSchema"`
		ForeignTable  string `json:"foreignTable"`
		ForeignColumn string `json:"foreignColumn"`
	}
	if err := c.BodyParser(&req); err != nil || req.Column == "" || req.ForeignTable == "" || req.ForeignColumn == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Relationship definition incomplete"})
	}
	if req.ForeignSchema == "" {
		req.ForeignSchema = "public"
	}

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	constraintName := fmt.Sprintf("fk_%s_%s_%s", table, req.Column, req.ForeignTable)
	query := fmt.Sprintf(`ALTER TABLE "%s"."%s" ADD CONSTRAINT "%s" FOREIGN KEY ("%s") REFERENCES "%s"."%s"("%s")`, schema, table, constraintName, req.Column, req.ForeignSchema, req.ForeignTable, req.ForeignColumn)
	if _, err := pool.Exec(c.Context(), query); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Relationship created"})
}

func (s *dashboardService) runSQL(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	var req struct {
		Query string `json:"query"`
	}
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Query) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "SQL query required"})
	}

	pool, err := s.projectPoolForProject(projectID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	rows, err := pool.Query(c.Context(), req.Query)
	if err != nil {
		cmdTag, execErr := pool.Exec(c.Context(), req.Query)
		if execErr != nil {
			return c.Status(500).JSON(fiber.Map{"error": execErr.Error()})
		}
		return c.JSON(fiber.Map{"message": "Query executed", "rowsAffected": cmdTag.RowsAffected()})
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	results := []map[string]interface{}{}
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			continue
		}
		rowMap := map[string]interface{}{}
		for i, field := range fields {
			rowMap[string(field.Name)] = values[i]
		}
		results = append(results, rowMap)
	}
	return c.JSON(fiber.Map{"rows": results})
}

func (s *dashboardService) projectPoolForProject(projectID string) (*pgxpool.Pool, error) {
	var dbName string
	if err := s.db.QueryRow(`SELECT db_name FROM projects WHERE id = ?`, projectID).Scan(&dbName); err != nil {
		return nil, fmt.Errorf("project not found")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := s.projectDB.PoolFor(ctx, dbName)
	if err != nil {
		return nil, fmt.Errorf("failed to connect project database")
	}
	return pool, nil
}
