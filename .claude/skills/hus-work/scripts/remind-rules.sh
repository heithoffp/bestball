#!/usr/bin/env bash
# hus-work behavioral reminder — injected via UserPromptSubmit hook.
# Keeps critical behavioral gates in context even after compaction or protocol bypass.

cat <<'REMINDER'
[hus-work] Behavioral gates active for this session:
1. REFLECTION BEFORE DONE — Present a **Reflection: TASK-NNN** block before marking any task Done. This is the most commonly skipped step.
2. ADR CHECK — At design decision points ask: "Is this hard to reverse, non-obvious, or affects multiple subsystems?" If yes, propose an ADR.
3. SCOPE DRIFT — Before adding work not in the approved plan, flag it. Either expand the plan or defer as a new task.
4. TASK DISCOVERY — If implementation reveals work that doesn't exist as a task yet, add it to BACKLOG.md via hus-backlog immediately.
5. CONTINUOUS INTROSPECTION — After significant actions (task creation, roadmap changes, structural edits), surface adjacent work and patterns to the developer.
REMINDER
