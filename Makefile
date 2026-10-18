# ============================================================================
# Makefile — Language-agnostic task runner
# ============================================================================
# This Makefile provides a standard set of targets for common development tasks.
# It works as a thin wrapper so every contributor uses the same commands
# regardless of the underlying language or toolchain.
#
# Usage:
#   make          # prints available targets
#   make setup    # install dependencies
#   make test     # run tests
#
# TODO: Replace the echo stubs below with real commands for your project.
# ============================================================================

.DEFAULT_GOAL := help

# Self-documenting help: any target with a ## comment gets listed.
.PHONY: help
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

.PHONY: setup
setup: ## Install project dependencies
	@echo "TODO: Add dependency install command (e.g., npm install, pip install -r requirements.txt)"

.PHONY: dev
dev: ## Start the development server
	@echo "TODO: Add dev server command (e.g., npm run dev, python manage.py runserver)"

.PHONY: lint
lint: ## Run linter
	@echo "TODO: Add lint command (e.g., npm run lint, ruff check .)"

.PHONY: format
format: ## Run code formatter
	@echo "TODO: Add format command (e.g., npx prettier --write ., ruff format .)"

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------

.PHONY: test
test: ## Run tests
	@echo "TODO: Add test command (e.g., npm test, pytest)"

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	@echo "TODO: Add test-watch command (e.g., npm test -- --watch, ptw)"

# ---------------------------------------------------------------------------
# Build & Release
# ---------------------------------------------------------------------------

.PHONY: build
build: ## Build for production
	@echo "TODO: Add build command (e.g., npm run build, python -m build)"

.PHONY: clean
clean: ## Remove build artifacts
	@echo "TODO: Add clean command (e.g., rm -rf dist/ build/ coverage/)"

# ---------------------------------------------------------------------------
# Docker (uncomment when ready)
# ---------------------------------------------------------------------------

# .PHONY: docker-build
# docker-build: ## Build Docker image
# 	docker build -t my-app .

# .PHONY: docker-run
# docker-run: ## Run Docker container
# 	docker run --rm -p 3000:3000 my-app
