.PHONY: install build dev lint test typecheck clean package

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

test:
	npm run test

typecheck:
	npm run typecheck

dev:
	npm run dev
