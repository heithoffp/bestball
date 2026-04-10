#!/bin/bash
# backlog.sh — Thin wrapper that delegates to backlog.py.
# Agents call this; it just forwards all args to the Python implementation.
# Compatible with Git Bash on Windows.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python "$SCRIPT_DIR/backlog.py" "$@"
