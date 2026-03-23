# Help Guide

## Purpose
In-app documentation covering each tab's purpose, features, and terminology. Serves as onboarding for new users and reference for experienced ones.

## Current Status
Active

## User-Facing Behavior
- 6 collapsible sections: Getting Started, Exposures, Rosters, ADP Tracker, Rankings, Draft Assistant
- Each section contains: purpose statement, feature list, tips
- Read-only scrollable content — no interactive controls
- Explains core concepts: archetype system, lift scores, CLV, uniqueness, spike week, strategy indicators
- Includes warnings about "falling knife" players

## Known Limitations
- Last tab in navigation — new users have no reason to find it first
- Not contextual (doesn't surface relevant help based on which tab the user is viewing)
- No search within help content

## Key Files
- `src/components/HelpGuide.jsx`
