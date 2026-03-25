package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Simple E2E test script to verify the backend loop
func main() {
	baseURL := "http://localhost:3000/api/v1"
	
	// Wait for server to be up
	fmt.Println("Waiting for server...")
	time.Sleep(2 * time.Second)

	// 1. Create Table
	fmt.Println("\nScanning tables...")
	// Check if 'test_products' exists, drop if so
	// Not implemented in script, assume clean or handle error.

	fmt.Println("\n[1] Creating table 'test_products'...")
	tableReq := map[string]interface{}{
		"name": "test_products",
		"columns": []map[string]interface{}{
			{"name": "id", "type": "uuid", "primaryKey": true, "default": "gen_random_uuid()"},
			{"name": "name", "type": "text"},
			{"name": "price", "type": "integer"},
		},
	}
	
	post(baseURL+"/schema/tables", tableReq)

	// 2. Insert Row
	fmt.Println("\n[2] Inserting row...")
	rowReq := map[string]interface{}{
		"name": "Gaming Laptop",
		"price": 1500,
	}
	post(baseURL+"/db/test_products", rowReq)

	// 3. List Rows
	fmt.Println("\n[3] Fetching rows...")
	get(baseURL+"/db/test_products")

	fmt.Println("\nDone.")
}

func post(url string, data interface{}) {
	b, _ := json.Marshal(data)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(b))
	if err != nil {
		fmt.Printf("POST failed: %v\n", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Status: %s\nBody: %s\n", resp.Status, string(body))
}

func get(url string) {
	resp, err := http.Get(url)
	if err != nil {
		fmt.Printf("GET failed: %v\n", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Status: %s\nBody: %s\n", resp.Status, string(body))
}
