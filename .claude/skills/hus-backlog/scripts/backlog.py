#!/usr/bin/env python3
"""backlog.py — CLI helper for BACKLOG.md mutations.

Agents call this (via backlog.sh wrapper) instead of doing raw table edits.
Handles encoding, sort order, column alignment, section structure, and validation.

Usage: python backlog.py <subcommand> [args...]
"""

import os
import re
import sys
from datetime import date, datetime
from pathlib import Path

BACKLOG_PATH = Path(os.environ.get("BACKLOG_FILE", "BACKLOG.md"))


# ── Parsing helpers ─────────────────────────────────────────────────────────

def read_backlog():
    return BACKLOG_PATH.read_text(encoding="utf-8")


def write_backlog(text):
    # Normalize to LF
    text = text.replace("\r\n", "\n")
    BACKLOG_PATH.write_text(text, encoding="utf-8", newline="\n")


def parse_sections(text):
    """Split BACKLOG.md into (before_active, active_header, active_rows,
    between, completed_header, completed_rows, after)."""
    lines = text.split("\n")

    now_start = now_end = None
    active_start = active_end = None
    active_header_end = None
    completed_start = completed_end = None
    completed_header_end = None

    for i, line in enumerate(lines):
        if line.strip() == "## Now":
            now_start = i
        elif line.strip() == "## Active Tasks":
            active_start = i
            if now_end is None and now_start is not None:
                now_end = i
        elif line.strip() == "## Completed Tasks":
            completed_start = i
            active_end = i
            if now_end is None and now_start is not None:
                now_end = i
        # Find header separator lines (|---|...)
        if active_start is not None and active_header_end is None:
            if line.startswith("|-"):
                active_header_end = i
        if completed_start is not None and completed_header_end is None:
            if line.startswith("|-"):
                completed_header_end = i

    return {
        "lines": lines,
        "now_start": now_start,
        "now_end": now_end or active_start,
        "active_start": active_start,
        "active_header_end": active_header_end,
        "active_end": active_end,
        "completed_start": completed_start,
        "completed_header_end": completed_header_end,
    }


def parse_row(line):
    """Parse a markdown table row into a dict."""
    cols = [c.strip() for c in line.split("|")]
    # Split on | gives ['', col1, col2, ..., '']
    cols = [c for c in cols if c != "" or line.count("|") > 2]
    # Filter out empty strings from leading/trailing pipes
    parts = line.split("|")
    parts = [p.strip() for p in parts[1:-1]]  # skip first and last empty
    return parts


def is_data_row(line):
    """Check if a line is a task data row (starts with | TASK-)."""
    return bool(re.match(r"^\|\s*TASK-\d+\s*\|", line))


def extract_task_id(line):
    m = re.search(r"TASK-\d+", line)
    return m.group(0) if m else None


def extract_priority(line):
    m = re.search(r"P[1-4]", line)
    return m.group(0) if m else None


def priority_num(p):
    return int(p[1]) if p else 99


def get_all_task_ids(text):
    return set(re.findall(r"TASK-\d+", text))


def get_max_task_num(text):
    nums = [int(m) for m in re.findall(r"TASK-(\d+)", text)]
    return max(nums) if nums else 0


def get_active_rows(text):
    """Return list of data row lines from the Active Tasks section."""
    sections = parse_sections(text)
    lines = sections["lines"]
    start = sections["active_header_end"]
    end = sections["active_end"]
    if start is None or end is None:
        return []
    return [l for l in lines[start + 1:end] if is_data_row(l)]


def get_now_bullets(text):
    """Return list of Now section bullet lines."""
    sections = parse_sections(text)
    lines = sections["lines"]
    start = sections["now_start"]
    end = sections["now_end"]
    if start is None or end is None:
        return []
    return [l for l in lines[start:end] if l.startswith("- TASK-")]


# ── Subcommands ─────────────────────────────────────────────────────────────

def cmd_next_id():
    text = read_backlog()
    max_num = get_max_task_num(text)
    print(f"TASK-{max_num + 1:03d}")


def cmd_add(title, priority, objective=None):
    if not re.match(r"^P[1-4]$", priority):
        die("Priority must be P1, P2, P3, or P4.")

    text = read_backlog()
    max_num = get_max_task_num(text)
    task_id = f"TASK-{max_num + 1:03d}"
    plan_path = f"docs/plans/{task_id}.md"
    new_row = f"| {task_id} | {title} | Todo | {priority} | [Plan]({plan_path}) -- Draft | No |"

    sections = parse_sections(text)
    lines = sections["lines"]
    header_end = sections["active_header_end"]
    active_end = sections["active_end"]

    if header_end is None or active_end is None:
        die("Cannot find Active Tasks table structure.")

    # Find correct insertion point based on priority sort
    new_pnum = priority_num(priority)
    insert_at = None

    for i in range(header_end + 1, active_end):
        if is_data_row(lines[i]):
            row_priority = extract_priority(lines[i])
            if priority_num(row_priority) > new_pnum:
                insert_at = i
                break

    if insert_at is None:
        # Insert after last data row in active section
        last_data = header_end
        for i in range(header_end + 1, active_end):
            if is_data_row(lines[i]):
                last_data = i
        insert_at = last_data + 1

    lines.insert(insert_at, new_row)
    write_backlog("\n".join(lines))

    # Create draft plan file
    obj_text = objective if objective else "<!-- TODO: Add objective -->"
    plan_content = (
        f"# {task_id}: {title}\n"
        f"\n"
        f"**Status:** Draft\n"
        f"**Priority:** {priority}\n"
        f"\n"
        f"---\n"
        f"\n"
        f"## Objective\n"
        f"{obj_text}\n"
        f"\n"
        f"## Dependencies\n"
        f"None\n"
        f"\n"
        f"## Open Questions\n"
        f"<!-- Unknowns or decisions to resolve before planning. Delete if none. -->\n"
    )
    plan_file = Path(plan_path)
    plan_file.parent.mkdir(parents=True, exist_ok=True)
    plan_file.write_text(plan_content, encoding="utf-8", newline="\n")

    print(f"Added {task_id}: {title} ({priority})")
    print(f"Created {plan_path}")
    validate_quiet()


def cmd_status(task_id, new_status):
    valid = {"Todo", "In Progress", "Done", "Won't Do"}
    if new_status not in valid:
        die(f"Status must be one of: {', '.join(sorted(valid))}")

    text = read_backlog()
    lines = text.split("\n")
    found = False

    for i, line in enumerate(lines):
        if re.match(rf"^\|\s*{re.escape(task_id)}\s*\|", line):
            parts = line.split("|")
            # parts: ['', ' ID ', ' Title ', ' Status ', ' Priority ', ' Plan ', ' Verified ', '']
            if len(parts) >= 7:
                parts[3] = f" {new_status} "
                lines[i] = "|".join(parts)
                found = True
                break

    if not found:
        die(f"{task_id} not found in {BACKLOG_PATH}.")

    write_backlog("\n".join(lines))
    print(f"Updated {task_id} status to: {new_status}")
    validate_quiet()


def cmd_complete(task_id):
    today = date.today().isoformat()
    text = read_backlog()
    lines = text.split("\n")

    # Find and remove the active row
    active_row = None
    active_row_idx = None
    sections = parse_sections(text)

    for i in range(sections["active_header_end"] + 1, sections["active_end"]):
        if is_data_row(lines[i]) and extract_task_id(lines[i]) == task_id:
            active_row = lines[i]
            active_row_idx = i
            break

    if active_row is None:
        die(f"{task_id} not found in Active Tasks table.")

    # Parse the active row columns
    parts = active_row.split("|")
    # Active: ['', ' ID ', ' Title ', ' Status ', ' Priority ', ' Plan ', ' Verified ', '']
    if len(parts) < 7:
        die(f"Cannot parse row for {task_id}.")

    tid = parts[1].strip()
    title = parts[2].strip()
    priority = parts[4].strip()
    plan = parts[5].strip()
    verified = parts[6].strip()

    # Update plan link: docs/plans/ -> docs/archive/plans/, remove -- Draft/Pending
    plan = re.sub(r"docs/plans/", "docs/archive/plans/", plan)
    plan = re.sub(r"\s*--\s*(Draft|Pending Approval)", "", plan)

    completed_row = f"| {tid} | {title} | Done | {priority} | {plan} | {verified} | {today} |"

    # Remove the active row
    lines.pop(active_row_idx)

    # Remove from Now section
    lines = [l for l in lines if not re.match(rf"^- {re.escape(task_id)}:", l)]

    # Find the completed table header separator and insert after it
    # Re-parse since line numbers shifted
    new_text = "\n".join(lines)
    sections = parse_sections(new_text)
    lines = new_text.split("\n")
    comp_header = sections["completed_header_end"]

    if comp_header is None:
        die("Cannot find Completed Tasks table header.")

    lines.insert(comp_header + 1, completed_row)
    write_backlog("\n".join(lines))
    print(f"Completed {task_id} ({today})")
    validate_quiet()
    auto_archive_check()


def get_completed_rows(text):
    """Return list of data row lines from the Completed Tasks section."""
    sections = parse_sections(text)
    lines = sections["lines"]
    start = sections["completed_header_end"]
    if start is None:
        return []
    return [l for l in lines[start + 1:] if is_data_row(l)]


def extract_completed_date(line):
    """Extract the Completed date (last column) from a completed row."""
    parts = line.split("|")
    if len(parts) >= 8:
        return parts[7].strip()
    return ""


def cmd_archive(threshold=20, keep=10):
    text = read_backlog()
    completed_rows = get_completed_rows(text)

    if len(completed_rows) <= threshold:
        print(f"Completed section has {len(completed_rows)} rows (threshold: {threshold}). No archival needed.")
        return

    # Sort by completion date, oldest first
    completed_rows.sort(key=lambda r: extract_completed_date(r) or "0000-00-00")

    rows_to_archive = completed_rows[:len(completed_rows) - keep]
    rows_to_keep = completed_rows[len(completed_rows) - keep:]

    # Determine archive file
    today = date.today()
    month_name = today.strftime("%B")
    archive_path = Path(f"docs/archive/backlog-{today.strftime('%Y-%m')}.md")

    # Find the max task ID being archived for the header note
    archived_ids = [extract_task_id(r) for r in rows_to_archive]
    max_archived = max(archived_ids, key=lambda t: int(t.split("-")[1])) if archived_ids else ""

    if archive_path.exists():
        # Append to existing archive
        archive_text = archive_path.read_text(encoding="utf-8")
        archive_lines = archive_text.split("\n")
        # Find last data row and insert after it
        last_data_idx = len(archive_lines) - 1
        while last_data_idx >= 0 and not is_data_row(archive_lines[last_data_idx]):
            last_data_idx -= 1
        insert_at = last_data_idx + 1 if last_data_idx >= 0 else len(archive_lines)

        # Adjust plan links for archive context (docs/archive/plans/ -> ../plans/)
        adjusted_rows = []
        for row in rows_to_archive:
            adjusted_rows.append(row.replace("docs/archive/plans/", "../plans/"))
        for row in reversed(adjusted_rows):
            archive_lines.insert(insert_at, row)

        # Update the header note
        for i, line in enumerate(archive_lines):
            if line.startswith("Archived from"):
                archive_lines[i] = f"Archived from `BACKLOG.md`. Last updated {today.isoformat()}. Contains completed tasks through {max_archived}."
                break

        archive_path.write_text("\n".join(archive_lines), encoding="utf-8", newline="\n")
    else:
        # Create new archive file
        archive_header = f"# Backlog Archive -- {month_name} {today.year}\n"
        archive_header += f"\nArchived from `BACKLOG.md`. Last updated {today.isoformat()}. Contains completed tasks through {max_archived}.\n"
        archive_header += "\n## Completed Tasks\n"
        archive_header += "\n| ID | Title | Status | Priority | Plan | Verified | Completed |"
        archive_header += "\n|----|-------|--------|----------|------|----------|-----------|"

        adjusted_rows = []
        for row in rows_to_archive:
            adjusted_rows.append(row.replace("docs/archive/plans/", "../plans/"))
        archive_header += "\n" + "\n".join(adjusted_rows) + "\n"

        archive_path.parent.mkdir(parents=True, exist_ok=True)
        archive_path.write_text(archive_header, encoding="utf-8", newline="\n")

    # Remove archived rows from BACKLOG.md, keeping only rows_to_keep
    sections = parse_sections(text)
    lines = sections["lines"]
    comp_header = sections["completed_header_end"]

    # Remove all completed data rows, then re-insert the kept rows
    new_lines = []
    in_completed = False
    for i, line in enumerate(lines):
        if i == comp_header:
            in_completed = True
            new_lines.append(line)
            for kept in rows_to_keep:
                new_lines.append(kept)
            continue
        if in_completed and is_data_row(line):
            continue  # skip all existing completed data rows (replaced above)
        if in_completed and not is_data_row(line) and line.strip() != "":
            in_completed = False
        new_lines.append(line)

    write_backlog("\n".join(new_lines))
    print(f"Archived {len(rows_to_archive)} completed tasks to {archive_path}")
    validate_quiet()


def auto_archive_check(threshold=20, keep=10):
    """Called after cmd_complete to auto-archive if threshold exceeded."""
    text = read_backlog()
    completed_rows = get_completed_rows(text)
    if len(completed_rows) > threshold:
        cmd_archive(threshold, keep)


def cmd_now(action, task_id):
    text = read_backlog()

    if action == "add":
        # Check if already present
        if re.search(rf"^- {re.escape(task_id)}:", text, re.MULTILINE):
            print(f"{task_id} is already in the Now section.")
            return

        # Get title from active table
        active_rows = get_active_rows(text)
        title = None
        for row in active_rows:
            if extract_task_id(row) == task_id:
                parts = row.split("|")
                title = parts[2].strip() if len(parts) > 2 else None
                break

        if title is None:
            die(f"{task_id} not found in Active table.")

        bullet = f"- {task_id}: {title}"
        lines = text.split("\n")
        sections = parse_sections(text)

        # Find the last bullet in Now section or the blank line after ## Now
        insert_at = sections["now_start"] + 1
        for i in range(sections["now_start"] + 1, sections["now_end"]):
            if lines[i].startswith("- TASK-"):
                insert_at = i + 1

        lines.insert(insert_at, bullet)
        write_backlog("\n".join(lines))
        print(f"Added {task_id} to Now section.")

    elif action == "remove":
        lines = text.split("\n")
        new_lines = [l for l in lines if not re.match(rf"^- {re.escape(task_id)}:", l)]
        if len(new_lines) == len(lines):
            print(f"{task_id} not found in Now section.")
            return
        write_backlog("\n".join(new_lines))
        print(f"Removed {task_id} from Now section.")

    else:
        die("Usage: backlog.sh now <add|remove> <task-id>")

    validate_quiet()


def cmd_plan(task_id, state):
    valid = {"draft", "pending", "approved"}
    if state not in valid:
        die(f"State must be one of: {', '.join(sorted(valid))}")

    plan_path = f"docs/plans/{task_id}.md"
    plan_map = {
        "draft": f"[Plan]({plan_path}) -- Draft",
        "pending": f"[Plan]({plan_path}) -- Pending Approval",
        "approved": f"[Plan]({plan_path})",
    }
    plan_value = plan_map[state]

    text = read_backlog()
    lines = text.split("\n")
    found = False

    for i, line in enumerate(lines):
        if re.match(rf"^\|\s*{re.escape(task_id)}\s*\|", line):
            parts = line.split("|")
            if len(parts) >= 7:
                parts[5] = f" {plan_value} "
                lines[i] = "|".join(parts)
                found = True
                break

    if not found:
        die(f"{task_id} not found in {BACKLOG_PATH}.")

    write_backlog("\n".join(lines))
    print(f"Updated {task_id} plan to: {state}")
    validate_quiet()


# ── Pruning ────────────────────────────────────────────────────────────────

def cmd_prune():
    """List pruning candidates -- stale or low-priority tasks."""
    text = read_backlog()
    active_rows = get_active_rows(text)
    active_count = len(active_rows)

    # Get max task number as a rough proxy for recency
    max_num = get_max_task_num(text)

    candidates = []
    for row in active_rows:
        tid = extract_task_id(row)
        priority = extract_priority(row)
        parts = row.split("|")
        status = parts[3].strip() if len(parts) > 3 else ""
        title = parts[2].strip() if len(parts) > 2 else ""
        task_num = int(tid.split("-")[1]) if tid else 0

        reasons = []

        # Stale: Todo task with ID more than 30 tasks behind the current max
        if status == "Todo" and (max_num - task_num) > 30:
            reasons.append("stale (created 30+ tasks ago, still Todo)")

        # Low priority in a large backlog
        if priority in ("P3", "P4") and active_count > 15:
            reasons.append(f"low priority ({priority}) in large backlog ({active_count} active)")

        if reasons:
            candidates.append((tid, title, priority, reasons))

    if not candidates:
        print("No pruning candidates identified.")
        return

    print(f"=== Pruning Candidates ({len(candidates)}) ===")
    for tid, title, priority, reasons in candidates:
        print(f"\n  {tid} [{priority}] {title}")
        for r in reasons:
            print(f"    - {r}")
    print(f"\nTo close a task: backlog.sh wontdo <task-id> \"rationale\"")


def cmd_wontdo(task_id, rationale):
    """Close a task as Won't Do with a rationale."""
    today = date.today().isoformat()
    text = read_backlog()
    lines = text.split("\n")

    # Find the active row
    active_row = None
    active_row_idx = None
    sections = parse_sections(text)

    for i in range(sections["active_header_end"] + 1, sections["active_end"]):
        if is_data_row(lines[i]) and extract_task_id(lines[i]) == task_id:
            active_row = lines[i]
            active_row_idx = i
            break

    if active_row is None:
        die(f"{task_id} not found in Active Tasks table.")

    # Parse the active row columns
    parts = active_row.split("|")
    if len(parts) < 7:
        die(f"Cannot parse row for {task_id}.")

    tid = parts[1].strip()
    title = parts[2].strip()
    priority = parts[4].strip()
    plan = parts[5].strip()
    verified = parts[6].strip()

    # Update plan link for archive path
    plan = re.sub(r"docs/plans/", "docs/archive/plans/", plan)
    plan = re.sub(r"\s*--\s*(Draft|Pending Approval)", "", plan)

    # Append rationale to title
    title_with_rationale = f"{title} (Won't Do: {rationale})"

    completed_row = f"| {tid} | {title_with_rationale} | Won't Do | {priority} | {plan} | No | {today} |"

    # Remove the active row
    lines.pop(active_row_idx)

    # Remove from Now section
    lines = [l for l in lines if not re.match(rf"^- {re.escape(task_id)}:", l)]

    # Re-parse and insert into completed table
    new_text = "\n".join(lines)
    sections = parse_sections(new_text)
    lines = new_text.split("\n")
    comp_header = sections["completed_header_end"]

    if comp_header is None:
        die("Cannot find Completed Tasks table header.")

    lines.insert(comp_header + 1, completed_row)
    write_backlog("\n".join(lines))

    # Archive the plan file if it exists
    plan_src = Path(f"docs/plans/{task_id}.md")
    plan_dst = Path(f"docs/archive/plans/{task_id}.md")
    if plan_src.exists():
        plan_dst.parent.mkdir(parents=True, exist_ok=True)
        plan_src.rename(plan_dst)

    print(f"Closed {task_id} as Won't Do: {rationale}")
    validate_quiet()
    auto_archive_check()


# ── Health check ───────────────────────────────────────────────────────────

def cmd_health():
    text = read_backlog()
    active_rows = get_active_rows(text)
    completed_rows = get_completed_rows(text)

    active_count = len(active_rows)

    # P3+ ratio
    low_priority = sum(1 for r in active_rows if extract_priority(r) in ("P3", "P4"))
    p3_ratio = (low_priority / active_count * 100) if active_count > 0 else 0

    # Completed section size
    completed_count = len(completed_rows)

    # Growth trend: tasks completed in last 14 days
    today = date.today()
    recent_completions = 0
    for row in completed_rows:
        d = extract_completed_date(row)
        if d:
            try:
                comp_date = date.fromisoformat(d)
                if (today - comp_date).days <= 14:
                    recent_completions += 1
            except ValueError:
                pass

    # Ratio: recent completions / active tasks (>1.0 = completing faster than growing)
    growth_ratio = (recent_completions / active_count) if active_count > 0 else 1.0

    # Output
    print("=== Backlog Health Check ===")
    print(f"Active tasks:      {active_count}")
    print(f"P3+ ratio:         {p3_ratio:.0f}% ({low_priority} of {active_count})")
    print(f"Completed section: {completed_count} rows")
    print(f"Growth trend:      {recent_completions} completed in 14 days vs {active_count} active (ratio: {growth_ratio:.2f})")

    # Recommendations
    recommendations = []
    if active_count > 15:
        recommendations.append("Active backlog is large -- consider pruning low-priority tasks or focusing on execution")
    if completed_count > 20:
        recommendations.append("Completed section is large -- run `backlog.sh archive`")
    if growth_ratio < 0.5 and active_count > 5:
        recommendations.append("Backlog is growing faster than execution -- prioritize completing existing tasks")
    if p3_ratio > 60:
        recommendations.append("Most active tasks are low-priority -- consider pruning or re-prioritizing")

    if recommendations:
        print("\nRecommendations:")
        for r in recommendations:
            print(f"  - {r}")
    else:
        print("\nBacklog is healthy.")


# ── Validation ──────────────────────────────────────────────────────────────

def cmd_validate():
    errors = _validate(quiet=False)
    sys.exit(0 if errors == 0 else 1)


def validate_quiet():
    errors = _validate(quiet=True)
    if errors > 0:
        print(f"WARNING: {errors} validation issue(s) detected after mutation (see above).")


def _validate(quiet=False):
    if not BACKLOG_PATH.exists():
        print(f"ERROR: {BACKLOG_PATH} not found.")
        return 1

    text = read_backlog()
    errors = 0

    if not quiet:
        print(f"Validating {BACKLOG_PATH}...")

    sections = parse_sections(text)
    lines = sections["lines"]

    # Extract IDs from each section
    active_ids = []
    if sections["active_header_end"] is not None and sections["active_end"] is not None:
        for i in range(sections["active_header_end"] + 1, sections["active_end"]):
            tid = extract_task_id(lines[i])
            if tid:
                active_ids.append(tid)

    completed_ids = []
    if sections["completed_header_end"] is not None:
        for i in range(sections["completed_header_end"] + 1, len(lines)):
            tid = extract_task_id(lines[i])
            if tid:
                completed_ids.append(tid)

    # Duplicate checks
    for label, ids in [("Active Tasks", active_ids), ("Completed Tasks", completed_ids)]:
        seen = set()
        for tid in ids:
            if tid in seen:
                print(f"ERROR: Duplicate ID in {label}: {tid}")
                errors += 1
            seen.add(tid)

    # Cross-table duplicates
    cross = set(active_ids) & set(completed_ids)
    if cross:
        print(f"ERROR: IDs in both Active and Completed: {', '.join(sorted(cross))}")
        errors += 1

    # Priority sort order in Active
    prev_pnum = 0
    for i in range(sections["active_header_end"] + 1, sections["active_end"]):
        if is_data_row(lines[i]):
            p = extract_priority(lines[i])
            pnum = priority_num(p)
            if pnum < prev_pnum:
                print(f"ERROR: Sort order violation -- {p} appears after P{prev_pnum}")
                errors += 1
            prev_pnum = pnum

    # Plan file link checks
    for line in lines:
        m = re.search(r"\[Plan\]\(([^)]+)\)", line)
        if m:
            plan_path = re.sub(r"\s*--.*$", "", m.group(1))
            if not Path(plan_path).exists():
                print(f"ERROR: Plan file not found: {plan_path}")
                errors += 1

    if errors == 0:
        if not quiet:
            print(f"{BACKLOG_PATH} is valid.")
    else:
        if not quiet:
            print(f"\nFound {errors} error(s). Fix before proceeding.")

    return errors


# ── Utilities ───────────────────────────────────────────────────────────────

def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


HELP = """\
backlog.sh — CLI helper for BACKLOG.md mutations

Subcommands:
  add <title> <priority> [objective]  Add a new task (P1-P4) with draft plan file. Prints the assigned TASK ID.
  status <task-id> <status>       Update status (Todo, "In Progress", Done).
  complete <task-id>              Move task to Completed table with today's date.
  now add <task-id>               Add task to Now section.
  now remove <task-id>            Remove task from Now section.
  plan <task-id> <state>          Update plan column (draft, pending, approved).
  archive                         Archive old completed tasks (threshold=20, keep=10).
  health                          Show backlog health metrics and recommendations.
  prune                           List pruning candidates (stale, low-priority).
  wontdo <task-id> <rationale>    Close a task as Won't Do with rationale.
  validate                        Run structural validation checks.
  next-id                         Print the next available TASK ID.
  help                            Show this help.

Environment:
  BACKLOG_FILE=<path>             Override default BACKLOG.md path.
"""


# ── Main dispatch ───────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("help", "--help", "-h"):
        print(HELP)
        sys.exit(0)

    cmd = sys.argv[1]

    if cmd == "next-id":
        cmd_next_id()
    elif cmd == "add":
        if len(sys.argv) < 4:
            die("Usage: backlog.sh add <title> <priority> [objective]")
        objective = sys.argv[4] if len(sys.argv) > 4 else None
        cmd_add(sys.argv[2], sys.argv[3], objective)
    elif cmd == "status":
        if len(sys.argv) < 4:
            die("Usage: backlog.sh status <task-id> <status>")
        cmd_status(sys.argv[2], sys.argv[3])
    elif cmd == "complete":
        if len(sys.argv) < 3:
            die("Usage: backlog.sh complete <task-id>")
        cmd_complete(sys.argv[2])
    elif cmd == "now":
        if len(sys.argv) < 4:
            die("Usage: backlog.sh now <add|remove> <task-id>")
        cmd_now(sys.argv[2], sys.argv[3])
    elif cmd == "plan":
        if len(sys.argv) < 4:
            die("Usage: backlog.sh plan <task-id> <state>")
        cmd_plan(sys.argv[2], sys.argv[3])
    elif cmd == "archive":
        cmd_archive()
    elif cmd == "health":
        cmd_health()
    elif cmd == "prune":
        cmd_prune()
    elif cmd == "wontdo":
        if len(sys.argv) < 4:
            die("Usage: backlog.sh wontdo <task-id> <rationale>")
        cmd_wontdo(sys.argv[2], sys.argv[3])
    elif cmd == "validate":
        cmd_validate()
    else:
        die(f"Unknown subcommand: {cmd}. Run 'backlog.sh help' for usage.")


if __name__ == "__main__":
    main()
