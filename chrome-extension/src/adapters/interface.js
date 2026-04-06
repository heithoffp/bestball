/**
 * Platform Adapter Interface
 *
 * Every draft platform (Underdog, DraftKings, etc.) implements this interface.
 * Platform-specific DOM scraping and injection logic lives inside each adapter.
 * All other extension code interacts with adapters only through this contract.
 *
 * See: docs/systems-model/subsystems/chrome-extension-model.md (block A4)
 */

/**
 * @typedef {Object} PlayerEntry
 * @property {string} name       - Player display name
 * @property {string} position   - "QB", "RB", "WR", "TE"
 * @property {string} team       - NFL team abbreviation
 * @property {number} pick       - Overall pick number (1-based)
 * @property {number} round      - Draft round (1-based)
 */

/**
 * @typedef {Object} Entry
 * @property {string} entryId          - Platform-specific entry/contest ID
 * @property {PlayerEntry[]} players   - Players drafted in this entry
 * @property {string} tournamentTitle  - Contest/tournament name
 * @property {string} draftDate        - ISO date string of the draft
 */

/**
 * @typedef {Object} AvailablePlayer
 * @property {string} name       - Player display name
 * @property {string} position   - "QB", "RB", "WR", "TE"
 * @property {string} team       - NFL team abbreviation
 * @property {number|null} adp   - Current ADP if available
 */

/**
 * @typedef {Object} DraftState
 * @property {number} currentPick          - Current overall pick number
 * @property {number} currentRound         - Current round (1-based)
 * @property {number} draftSlot            - User's draft slot position (1-based)
 * @property {AvailablePlayer[]} availablePlayers - Players still on the board
 * @property {PlayerEntry[]} myPicks       - User's picks so far in this draft
 */

/**
 * @typedef {Object} PlatformStyles
 * @property {string} fontFamily   - Platform's primary font
 * @property {string} fontSize     - Base font size
 * @property {string} textColor    - Primary text color
 * @property {string} bgColor      - Background color for injected elements
 * @property {string} borderColor  - Border color matching platform UI
 */

/**
 * @typedef {Object} PlatformAdapter
 *
 * @property {(url: string) => boolean} isMatch
 *   Returns true if this adapter handles the given URL.
 *
 * @property {() => Promise<Entry[]>} getEntries
 *   Scrapes roster/entry data from the platform's entries page.
 *   Rejects if not on an entries page or if scraping fails.
 *
 * @property {() => DraftState} getDraftState
 *   Reads current live draft state from the DOM.
 *   Throws if not on an active draft page.
 *
 * @property {() => Element|null} getInjectionTarget
 *   Returns the DOM element where the overlay should be injected.
 *   Must return a stable parent that survives framework re-renders.
 *   Returns null if no suitable target is found.
 *
 * @property {() => PlatformStyles} getStyles
 *   Returns platform-specific CSS properties so injected UI blends
 *   in with the native site. The overlay should look built-in, not
 *   bolted-on (see systems model finding F-001).
 *
 * @property {() => Element[]} getPlayerRows
 *   Returns DOM elements representing individual player rows on the
 *   draft board. Used for inline annotation injection.
 *   Returns empty array if not on a draft page.
 *
 * @property {Object} selectors
 *   Platform-specific CSS selectors for DOM injection.
 * @property {string} selectors.gridSelector            - Virtualized grid container
 * @property {string} selectors.rowSelector             - Individual player row element
 * @property {string} selectors.rightSideSelector       - Right-side stat area within a row
 * @property {string} selectors.statCellSelector        - Native stat cell (ADP/Proj) within rightSide
 * @property {string} selectors.sortButtonsSelector     - Sort button bar above the draft board
 * @property {string} selectors.myPicksSelector         - "My team" picked player cells
 * @property {string} selectors.playerNameInRowSelector - Player name element within a row
 * @property {string} selectors.positionSectionSelector - Position grouping section in "my team"
 * @property {string} selectors.positionHeaderSelector  - Position label within a positionSection
 * @property {string} selectors.stackPillTargetSelector - Element within a row where stack pills are appended
 *
 * @property {() => boolean} isMyRankSort
 *   Returns true when the draft board is currently sorted by the user's custom rank.
 *   Return false if the platform has no such sort mode.
 *
 * @property {string} syncPageErrorMessage
 *   Error message shown in the panel when the user triggers sync but is not on
 *   the platform's completed entries page.
 */

// This file is types-only — no runtime exports.
// Adapters import nothing from here; they implement the shape above.
// The JSDoc types are available to any file via:
//   /** @type {import('./interface.js').PlatformAdapter} */
