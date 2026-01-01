.PHONY: setup backend frontend run clean test haiku-tester

VENV = backend/venv
PYTHON = $(VENV)/bin/python
PIP = $(VENV)/bin/pip

setup:
	python3 -m venv $(VENV)
	$(PIP) install -r backend/requirements.txt
	$(PIP) install -r tests/requirements.txt
	cd frontend && npm install

backend:
	$(PYTHON) backend/main.py

frontend:
	cd frontend && npm run dev

run:
	@echo "Starting backend and frontend..."
	@$(MAKE) -j2 backend frontend

clean:
	rm -rf $(VENV)
	rm -rf frontend/node_modules

test:
	@echo "No unit tests yet"

haiku-tester:
	$(PYTHON) -m pytest tests/haiku-tester/ -v
