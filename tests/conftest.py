"""
Pytest fixtures for e2e testing with Docker containers.
"""
import pytest
import time
import urllib.request
import urllib.error
from pathlib import Path

# Get project root and tests directory
PROJECT_ROOT = Path(__file__).parent.parent
TESTS_DIR = Path(__file__).parent


def wait_for_url(url: str, timeout: int = 60) -> bool:
    """
    Wait for a URL to become available using exponential backoff.

    Starts with 0.5s delay, doubles each retry up to 4s max.
    Any HTTP response (including errors) means server is up.
    """
    start = time.time()
    last_error = None
    delay = 0.5  # Start with 500ms
    max_delay = 4.0

    while time.time() - start < timeout:
        try:
            response = urllib.request.urlopen(url, timeout=10)
            response.read()
            return True
        except urllib.error.HTTPError:
            # Any HTTP response (including 404) means server is up
            return True
        except Exception as e:
            last_error = e
            time.sleep(delay)
            delay = min(delay * 2, max_delay)  # Exponential backoff

    print(f"wait_for_url failed after {timeout}s: {last_error}")
    return False


@pytest.fixture(scope="session")
def docker_compose_file():
    """Path to docker-compose file."""
    return TESTS_DIR / "docker-compose.yml"


@pytest.fixture(scope="session")
def wiki_app(docker_compose_file):
    """
    Start Docker containers for testing.

    Uses testcontainers to manage the Docker Compose stack.
    Yields the base URL when services are ready.
    Automatically tears down on completion.
    """
    from testcontainers.compose import DockerCompose

    compose = DockerCompose(
        str(TESTS_DIR),
        compose_file_name="docker-compose.yml"
    )

    try:
        # Start containers (waits for Docker healthchecks)
        compose.start()

        frontend_url = "http://localhost:5173"
        backend_url = "http://localhost:8000/health"

        # Verify services are reachable from host (Docker healthchecks run inside container,
        # but we need to confirm port forwarding works and services respond to host requests)
        if not wait_for_url(backend_url, timeout=30):
            raise RuntimeError(f"Backend not ready at {backend_url}")

        if not wait_for_url(frontend_url, timeout=30):
            raise RuntimeError(f"Frontend not ready at {frontend_url}")

        yield frontend_url

    finally:
        # Tear down containers
        compose.stop()


@pytest.fixture
def base_url(wiki_app):
    """Alias for wiki_app fixture - returns the base URL."""
    return wiki_app
