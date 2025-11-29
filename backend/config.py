"""
Central configuration for the wiki backend.
"""
from pathlib import Path

# Wiki repository path - single source of truth
WIKI_REPO_PATH = str(Path(__file__).parent.parent / "etoneto-wiki")

# OpenRouter API
import os
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")
