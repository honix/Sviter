.PHONY: setup backend frontend run clean test haiku-tester

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
