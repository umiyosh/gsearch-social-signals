.PHONY: install build dev lint fmt fmt-check typecheck lint-quality quality-baseline quality-test quality-ts test test-coverage check clean package

install:
	npm install

build:
	npm run build

package: build
	@echo "Extension bundle available under dist/"

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
