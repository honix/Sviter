"""
Claude CLI runner for e2e tests.

Executes Claude CLI with browser automation prompts and validates JSON output.
"""
import subprocess
import json
from typing import Optional
from dataclasses import dataclass


# JSON Schema for test results
TEST_RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "passed": {"type": "boolean"},
        "checks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "item": {"type": "string"},
                    "status": {"type": "string"}
                },
                "required": ["item", "status"]
            }
        },
        "details": {"type": "string"}
    },
    "required": ["passed"]
}


@dataclass
class TestResult:
    """Result from a Claude CLI test run."""
    passed: bool
    checks: list[dict]
    details: str
    raw_output: str


def run_claude_test(
    prompt: str,
    model: str = "haiku",
    timeout: int = 120,
    cwd: Optional[str] = None
) -> TestResult:
    """
    Run a test via Claude CLI with structured JSON output.

    Args:
        prompt: The test prompt to send to Claude
        model: Model to use (haiku, sonnet, opus)
        timeout: Timeout in seconds
        cwd: Working directory for the command

    Returns:
        TestResult with validated results
    """
    try:
        result = subprocess.run(
            [
                "claude", "-p", prompt,
                "--model", model,
                "--chrome",
                "--output-format", "json",
                "--json-schema", json.dumps(TEST_RESULT_SCHEMA)
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd
        )

        output = result.stdout.strip()

        # With --output-format json --json-schema, output is JSON with structured_output field
        try:
            parsed = json.loads(output)
            structured = parsed.get("structured_output", {})
            return TestResult(
                passed=structured.get("passed", False),
                checks=structured.get("checks", []),
                details=structured.get("details", parsed.get("result", "")),
                raw_output=output
            )
        except json.JSONDecodeError as e:
            return TestResult(
                passed=False,
                checks=[],
                details=f"Failed to parse JSON output: {e}",
                raw_output=output
            )

    except subprocess.TimeoutExpired:
        return TestResult(
            passed=False,
            checks=[],
            details=f"Test timed out after {timeout}s",
            raw_output=""
        )
    except FileNotFoundError:
        return TestResult(
            passed=False,
            checks=[],
            details="Claude CLI not found. Is it installed?",
            raw_output=""
        )
    except Exception as e:
        return TestResult(
            passed=False,
            checks=[],
            details=f"Error running test: {e}",
            raw_output=""
        )
