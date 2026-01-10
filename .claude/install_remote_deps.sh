#!/bin/bash
# Only run in remote environments
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi
if ! apt-get update || ! apt-get install -y gh; then
  echo "Error: Failed to install gh CLI" >&2
  exit 1
fi
