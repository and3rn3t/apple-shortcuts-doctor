# Thin wrappers around pnpm scripts so every contributor uses the same commands.
# Usage: `make` lists targets.

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.PHONY: setup
setup: ## Install dependencies
	pnpm install

.PHONY: lint
lint: ## Run ESLint
	pnpm lint

.PHONY: format
format: ## Format with Prettier
	pnpm format

.PHONY: type-check
type-check: ## Type-check all packages
	pnpm type-check

.PHONY: test
test: ## Run tests
	pnpm test

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	pnpm test:watch

.PHONY: coverage
coverage: ## Run tests with coverage thresholds
	pnpm test:coverage

.PHONY: build
build: ## Regenerate the bundled skill script
	pnpm build

.PHONY: validate
validate: ## Run the full gate (lint, format, types, tests, bundle drift)
	pnpm validate

.PHONY: clean
clean: ## Remove generated artifacts
	rm -rf coverage dist
