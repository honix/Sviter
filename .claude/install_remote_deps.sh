#!/bin/bash
# Only run in remote environments
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi
apt-get update && apt-get install -y gh
exit 0
