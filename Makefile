.PHONY: prod-up prod-down api-docs health-check generate-client help

# Help command - displays all available targets
help:
	@echo "MSQ Relayer Service - Deployment Makefile"
	@echo ""
	@echo "Available commands:"
	@echo "  make prod-up              Start production environment"
	@echo "  make prod-down            Stop production environment"
	@echo "  make api-docs             Extract OpenAPI JSON"
	@echo "  make health-check         Check service health"
	@echo "  make generate-client      Generate TypeScript Client SDK (optional)"
	@echo ""

# Start production environment (2 relay-api replicas + OZ Relayers + Redis)
prod-up:
	@echo "Starting production environment..."
	cd docker && docker-compose -f docker-compose.prod.yml up -d
	@echo "Production environment started."
	@echo ""
	@echo "Services:"
	@echo "  Relay API 1: http://localhost:3001"
	@echo "  Relay API 2: http://localhost:3002"
	@echo ""
	@echo "Swagger UI:"
	@echo "  Relay 1: http://localhost:3001/api/docs"
	@echo "  Relay 2: http://localhost:3002/api/docs"
	@echo ""
	@echo "OpenAPI JSON:"
	@echo "  Relay 1: http://localhost:3001/api/docs-json"
	@echo "  Relay 2: http://localhost:3002/api/docs-json"
	@echo ""

# Stop production environment
prod-down:
	@echo "Stopping production environment..."
	cd docker && docker-compose -f docker-compose.prod.yml down
	@echo "Production environment stopped."

# Extract OpenAPI JSON from running relay-api-1
api-docs:
	@echo "Extracting OpenAPI JSON..."
	@curl -s -o openapi.json http://localhost:3001/api/docs-json
	@echo "OpenAPI JSON saved to openapi.json"
	@echo ""
	@echo "File size: $$(wc -c < openapi.json) bytes"

# Check health status of both replicas
health-check:
	@echo "Checking service health..."
	@echo ""
	@echo "Relay API 1:"
	@curl -s http://localhost:3001/api/v1/health | jq . || echo "Failed to connect"
	@echo ""
	@echo "Relay API 2:"
	@curl -s http://localhost:3002/api/v1/health | jq . || echo "Failed to connect"
	@echo ""

# Generate TypeScript Client SDK from OpenAPI JSON (optional)
generate-client:
	@echo "Generating TypeScript Client SDK..."
	@if [ ! -f "openapi.json" ]; then \
		echo "Error: openapi.json not found. Run 'make api-docs' first."; \
		exit 1; \
	fi
	@mkdir -p ./generated/client
	npx @openapitools/openapi-generator-cli generate \
		-i openapi.json \
		-g typescript-axios \
		-o ./generated/client
	@echo "Client SDK generated in ./generated/client"
	@echo ""
	@echo "Usage:"
	@echo "  import { DefaultApi } from './generated/client';"
	@echo "  const api = new DefaultApi({ basePath: 'http://localhost:3001' });"
