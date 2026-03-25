package core

type Column struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	PrimaryKey bool   `json:"primaryKey"`
	Unique     bool   `json:"unique"`
	Nullable   bool   `json:"nullable"`
	Default    string `json:"default"`
}

var typeMap = map[string]string{
	"text":     "TEXT",
	"integer":  "INTEGER",
	"real":     "REAL",
	"boolean":  "BOOLEAN",
	"json":     "JSONB",
	"datetime": "TIMESTAMPTZ",
	"uuid":     "UUID",
}
