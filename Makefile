.DEFAULT_GOAL := help

.PHONY: help install build dev lint fmt fmt-check typecheck lint-quality quality-baseline quality-test quality-ts test test-coverage check ci clean package store-assets release-check release-tag

VERSION ?=
TAG := $(if $(VERSION),$(if $(filter v%,$(VERSION)),$(VERSION),v$(VERSION)),)

help: ## Show available targets
	@perl -ne 'if (/^##@[[:space:]]*(.*)/) { print "\n$$1\n" } elsif (/^([A-Za-z0-9_.\/-]+):.*##[[:space:]]*(.*)/) { printf "  %-24s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

##@ Development

install: ## Install dependencies
	npm install

build: ## Build the extension bundle
	npm run build

dev: ## Start development watchers
	npm run dev

clean: ## Remove generated build files
	npm run clean || true

##@ Quality

lint: ## Run ESLint
	npm run lint

fmt: ## Format files with Prettier
	npm run fmt

fmt-check: ## Check formatting without changes
	npm run fmt-check

typecheck: ## Run the TypeScript type checker
	npm run typecheck

lint-quality: ## Check the quality baseline ratchet
	npm run quality:check

quality-baseline: ## Update the quality baseline after improvements
	npm run quality:update-baseline

quality-test: ## Test the quality gate scripts
	npm run quality:test

quality-ts: ## Report unused TypeScript code with Knip
	npm run quality:ts

test: ## Run unit tests
	npm run test

test-coverage: ## Run tests with coverage thresholds
	npm run test:coverage

check: lint fmt-check typecheck quality-test lint-quality test-coverage ## Run all quality gates

ci: check build ## Run all CI checks and build the extension

##@ Release

package: ## Build the Chrome Web Store package
	npm run package:store

store-assets: ## Generate Chrome Web Store assets
	npm run store:assets

release-check: ## Validate a release version (VERSION=x.y.z)
	@test -n "$(VERSION)" || (echo "Usage: make release-check VERSION=0.1.0"; exit 1)
	@case "$(TAG)" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "VERSION must be semantic version like 0.1.0 or v0.1.0"; exit 1;; esac
	node scripts/validate-release-version.mjs "$(TAG)"

release-tag: ## Validate and push a release tag (VERSION=x.y.z)
	@test -n "$(VERSION)" || (echo "Usage: make release-tag VERSION=0.1.0"; exit 1)
	@case "$(TAG)" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "VERSION must be semantic version like 0.1.0 or v0.1.0"; exit 1;; esac
	node scripts/validate-release-version.mjs "$(TAG)"
	@git diff --quiet || (echo "Working tree has unstaged changes"; exit 1)
	@git diff --cached --quiet || (echo "Index has staged changes"; exit 1)
	@if git rev-parse -q --verify "refs/tags/$(TAG)" >/dev/null; then echo "Tag $(TAG) already exists"; exit 1; fi
	git tag "$(TAG)"
	git push origin "$(TAG)"
