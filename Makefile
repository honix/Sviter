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

# ==== LOCAL E2E TESTING (for Claude Code web validation) ====
# Requires: backend running with mock LLM, frontend running

# Quick smoke test - one-liner validation
e2e-quick:
	cd frontend && npx playwright test e2e/app.spec.ts --reporter=list

# Full local E2E test suite
e2e-local:
	cd frontend && npx playwright test --reporter=list

# E2E with UI mode (interactive debugging)
e2e-ui:
	cd frontend && npx playwright test --ui

# E2E with headed browser (see what's happening)
e2e-headed:
	cd frontend && npx playwright test --headed --reporter=list

# Take screenshot of current app state (debugging)
e2e-screenshot:
	cd frontend && npx playwright test e2e/screenshot.spec.ts --reporter=list

# Start backend with mock LLM for local testing
backend-mock:
	cd backend && LLM_PROVIDER=mock uv run uvicorn main:app --port 8000 --reload

# One-liner to start both servers for local e2e (run in separate terminals)
# Terminal 1: make backend-mock
# Terminal 2: make frontend
# Terminal 3: make e2e-quick
