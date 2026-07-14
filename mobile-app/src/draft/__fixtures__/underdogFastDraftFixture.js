// underdogFastDraftFixture.js — hand-transcribed screens from the fast-draft
// recording docs/live_draft_recording/ScreenRecording_07-13-2026 13-16-13_1.mp4
// (12-team, 30s clock; user BIRDENTHUSIAST at slot 7 drafted J. Taylor #7,
// D. London #18, T. Higgins #31). Transcription follows the line-fragment
// style of the real Vision dump in underdogOcrFixture.js (task-318 artifacts):
// one OCR fragment per line, usernames ALL-CAPS, tallies with the "O"-for-0
// garble, labels occasionally missing spaces.
// Used by scripts/test-draft-parser.mjs (TASK-328 check groups).

// Pre-fill lobby: only the user's card is named; other seats read "Filled".
// The user's card has no pick label yet — username is the only signal.
export const FAST_LOBBY_EARLY = `1:17
Drafting starts soon
BIRDENTHUSIAST
QB RB WR TE
Filled
Filled
Filled
Players
Queue
Board
QB
RB
WR
TE
ADP =
Proj =
Jahmyr Gibbs
RB1
DET, Bye 6
1.1
277.9
Bijan Robinson
RB2
ATL, Bye 11
2.0
294.9`;

// Filled lobby, carousel scrolled to the user's neighborhood: every card has
// a "r.p | overall" label — the user's card pins slot 7 before pick one.
export const FAST_LOBBY_FULL = `1:17
Draft starts in 0:25
ABLEVINS
1.5 | 5
QB RB WR TE
0 0 0 0
FREDZ238
1.6 | 6
QB RB WR TE
0 0 0 0
BIRDENTHUSIAST
1.7 | 7
QB RB WR TE
0 0 0 0
NORFHEAD
1.8 | 8
QB RB WR TE
O 0 0 0
Players
Queue
Board
Jahmyr Gibbs
RB1
DET, Bye 6
1.1
277.9
Bijan Robinson
RB2
ATL, Bye 11
2.0
294.9
Ja'Marr Chase
WR1
CIN, Bye 6
3.1
256.6
Puka Nacua
WR2
LAR, Bye 11
4.0
259.0
Jaxon Smith-Njigba
WR3
SEA, Bye 11
5.3
235.1
Christian McCaffrey
RB3
SF, Bye 8
6.4
260.0
6 picks away
Amon-Ra St. Brown
WR4
DET, Bye 6
7.5
227.5`;

// One pick before the user's turn: header "UP NEXT", FREDZ238 on the clock.
export const FAST_UP_NEXT = `1:18
UP NEXT
FREDZ238
0:04
QB RB WR TE
0 0 0 0
BIRDENTHUSIAST
1.7 | 7
QB RB WR TE
0 0 0 0
NORFHEAD
1.8 | 8
QB RB WR TE
0 0 0 0
Players
Queue
Board
Christian McCaffrey
RB3
SF, Bye 8
6.4
260.0
1 pick away
Amon-Ra St. Brown
WR4
DET, Bye 6
7.5
227.5
Jonathan Taylor
RB4
IND, Bye 13
7.5
256.3`;

// User on the clock (pick 1.7 / overall 7): header carries the pick clock,
// the user's own card shows a countdown instead of its label.
export const FAST_YOUR_PICK = `1:18
Your pick: 0:15
BIRDENTHUSIAST
0:15
QB RB WR TE
0 0 0 0
NORFHEAD
1.8 | 8
QB RB WR TE
0 0 0 0
MACHINE0901
1.9 | 9
QB RB WR TE
0 0 0 0
Players
Queue
Board
Amon-Ra St. Brown
WR4
DET, Bye 6
7.5
227.5
Jonathan Taylor
RB4
IND, Bye 13
7.5
256.3`;

// Immediately after the user drafts Jonathan Taylor: header snaps to
// "UP IN 10 PICKS", the confirmation card slides in at the carousel's left
// (position badge fragment, then "TEAM / F. Lastname"), the user's card
// re-labels to their next pick (2.6 | 18) with the RB tally incremented.
export const FAST_POST_PICK = `1:18
UP IN 10 PICKS
RB
IND / J. Taylor
NORFHEAD
0:16
QB RB WR TE
0 0 0 0
MACHINE0901
1.9 | 9
QB RB WR TE
0 0 0 0
BIRDENTHUSIAST
2.6 | 18
QB RB WR TE
0 1 0 0
Players
Queue
Board
Amon-Ra St. Brown
WR4
DET, Bye 6
7.5
227.5
CeeDee Lamb
WR5
DAL, Bye 14
9.6
222.5`;

// Next opponent pick (MACHINE0901 now on the clock at overall 9): the
// confirmation card names NORFHEAD's completed pick at overall 8.
export const FAST_OPP_PICK = `1:19
UP IN 9 PICKS
WR
DET / A. St. Brown
MACHINE0901
0:18
QB RB WR TE
0 0 0 0
ELIJAHMARK
1.10 | 10
QB RB WR TE
0 0 0 0
Players
Queue
Board
CeeDee Lamb
WR5
DAL, Bye 14
9.6
222.5
Justin Jefferson
WR6
MIN, Bye 6
10.0
205.4`;

// Ticker dropout: no header, no divider, no cards — just list rows. With the
// slot anchored, picks-until must survive on snake math alone.
export const FAST_TICKERLESS = `1:19
Players
Queue
Board
CeeDee Lamb
WR5
DAL, Bye 14
9.6
222.5
Justin Jefferson
WR6
MIN, Bye 6
10.0
205.4
Ashton Jeanty
RB5
LV, Bye 13
11.1
238.5`;

// Expanded player-detail accordion (stats table + news + Queue/Draft bar):
// must classify as 'detail' and never feed availability inference.
export const FAST_DETAIL_PANEL = `1:19
UP IN 8 PICKS
ELIJAHMARK
0:15
QB RB WR TE
0 0 0 0
Players
Queue
Board
Josh Jacobs
RB18
LV, Bye 8
Team
ADP
Proj
Bye
Pos rank
Rushing
Receiving
2022
2023
2024
2025
Practicing with team Tuesday
41 days ago
Queue
Draft`;

// Edge-clipped user card: the truncated username fragment must NEVER anchor
// the slot (a fragment matching a different seat would corrupt everything).
export const FAST_TRUNCATED_CARD = `1:21
UP IN 3 PICKS
WAOO
0:18
QB RB WR TE
0 0 1 1
ABLEVINS
3.5 | 29
QB RB WR TE
0 1 1 0
BIRD
3.7 | 31
QB RB WR TE
0 1 1 0
Players
Queue
Board
Trey McBride
TE2
ARI, Bye 14
28.8
191.4
Zay Flowers
WR14
BAL, Bye 13
30.4
189.7`;

// Our own Live Activity expanded over the draft room (observed in the
// 2026-07-14 on-device test): the capture reads our glance — target names,
// FALLING flags, the roster bar — as if they were screen content. Must be
// classified 'self' and be fully inert, or drafted players get resurrected.
export const SELF_ACTIVITY_OVERLAY = `Up in 3 picks
P54
synced 8 sec
ago
Round 5
TE
Brock Bowers
FALLING
WR
George Pickens
FALLING
RB
Jeremiyah Love
FALLING
QB 0 · RB 2 · WR 0 · TE 0
4 hr
QB RB WR TE
0 2 2 0
5.7 | 55
QB RB WR TE
0 2 2 0
Players
Queue
Board
D'Andre Swift
RB21
CHI, Bye 10
50.6
184.0`;

export const FAST_DRAFT_SEQUENCE = [
  FAST_LOBBY_EARLY,
  FAST_LOBBY_FULL,
  FAST_UP_NEXT,
  FAST_YOUR_PICK,
  FAST_POST_PICK,
  FAST_OPP_PICK,
  FAST_TICKERLESS,
];
