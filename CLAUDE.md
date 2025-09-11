# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a single-file Python project that implements a chat interface for testing various LLM models through OpenRouter API. The main script `openrouter_test.py` creates an interactive chat session with tool calling capabilities.

## Architecture

- **Single Module Design**: The entire application is contained in `openrouter_test.py`
- **Tool System**: Implements three custom tools:
  - `get_secret()`: Returns a test string "BOO"
  - `calculator()`: Safe mathematical expression evaluator using AST parsing
  - `generate_html()`: HTML validator using Python's HTMLParser
- **Chat Loop**: Interactive command-line chat interface with tool calling support
- **Model Configuration**: Multiple commented model options for testing different LLMs

## Running the Application

```bash
python openrouter_test.py
```

The script will start an interactive chat session. Type 'quit' to exit.

## Key Implementation Details

- Uses OpenAI client library with OpenRouter API endpoint
- UTF-8 encoding is configured for Windows console compatibility (`chcp 65001`)
- Tool calls are handled synchronously with follow-up responses
- Mathematical expressions are safely evaluated using AST instead of `eval()`
- HTML validation uses Python's built-in HTMLParser class

## Dependencies

- `openai` - OpenAI Python client library
- Standard library modules: `sys`, `os`, `json`, `ast`, `operator`, `html.parser`

## Security Notes

- The API key is hardcoded in the source (line 75) - should be moved to environment variables for production use
- Calculator function uses safe AST parsing to prevent code injection
- HTML parser validates input without executing it