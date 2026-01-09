.PHONY: setup backend frontend run clean test haiku-tester e2e e2e-docker

setup:
	cd backend && uv sync
	cd frontend && npm install

backend:
	cd backend && uv run python main.py

frontend:
	cd frontend && npm run dev

run:
	@echo "Starting backend and frontend..."
	@$(MAKE) -j2 backend frontend

clean:
	rm -rf backend/.venv
	rm -rf frontend/node_modules

test:
	cd backend && uv run pytest

haiku-tester:
	cd backend && uv run pytest ../tests/haiku-tester/ -v

# E2E tests in Docker with controlled test fixtures
# This is the ONLY way to run E2E tests - ensures reproducible state
e2e:
	docker compose -f tests/docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from playwright

# E2E test cleanup
e2e-clean:
	docker compose -f tests/docker-compose.e2e.yml down --volumes --remove-orphans
