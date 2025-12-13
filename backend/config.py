"""
Central configuration for the wiki backend.

All settings loaded from .env file or environment variables.
See .env.example for available options.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend directory
load_dotenv(Path(__file__).parent / ".env")

# Wiki repository path (required)
WIKI_REPO_PATH = os.getenv("WIKI_REPO_PATH")
if not WIKI_REPO_PATH:
    raise ValueError("WIKI_REPO_PATH environment variable is required. See .env.example")

# OpenRouter API key (required if using OpenRouter adapter)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# LLM Configuration
# Model to use (e.g., "claude-sonnet-4-5", "anthropic/claude-sonnet-4")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-5")

# Provider: "claude" (Claude SDK) or "openrouter"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "claude")
