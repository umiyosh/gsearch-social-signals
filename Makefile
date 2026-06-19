.PHONY: install build dev lint fmt fmt-check typecheck lint-quality quality-baseline quality-test quality-ts test test-coverage check clean package store-assets release-check release-tag

VERSION ?=
TAG := $(if $(VERSION),$(if $(filter v%,$(VERSION)),$(VERSION),v$(VERSION)),)

install:
	npm install

build:
	npm run build

package:
	npm run package:store

store-assets:
	npm run store:assets

release-check:
	@test -n "$(VERSION)" || (echo "Usage: make release-check VERSION=0.1.0"; exit 1)
	@case "$(TAG)" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "VERSION must be semantic version like 0.1.0 or v0.1.0"; exit 1;; esac
	node scripts/validate-release-version.mjs "$(TAG)"

release-tag:
	@test -n "$(VERSION)" || (echo "Usage: make release-tag VERSION=0.1.0"; exit 1)
	@case "$(TAG)" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "VERSION must be semantic version like 0.1.0 or v0.1.0"; exit 1;; esac
	node scripts/validate-release-version.mjs "$(TAG)"
	@git diff --quiet || (echo "Working tree has unstaged changes"; exit 1)
	@git diff --cached --quiet || (echo "Index has staged changes"; exit 1)
	@if git rev-parse -q --verify "refs/tags/$(TAG)" >/dev/null; then echo "Tag $(TAG) already exists"; exit 1; fi
	git tag "$(TAG)"
	git push origin "$(TAG)"

clean:
	npm run clean || true

lint:
	npm run lint

fmt:
	npm run fmt

fmt-check:
	npm run fmt-check

typecheck:
	npm run typecheck

lint-quality:
	npm run quality:check

quality-baseline:
	npm run quality:update-baseline

quality-test:
	npm run quality:test

quality-ts:
	npm run quality:ts

test:
	npm run test

test-coverage:
	npm run test:coverage

check: lint fmt-check typecheck quality-test lint-quality test-coverage

dev:
	npm run dev
