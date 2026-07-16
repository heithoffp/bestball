// underdogOcrFixture.js — verbatim iOS Vision "Extract Text" output collected
// from a live Underdog slow draft on 2026-07-13 (docs/task-318 artifacts/).
// Four screens: Players tab, Board (page 1), Board (scrolled), Queue tab.
// The user was BIRDENTHUSIAST, slot 9, current pick 31, "UP IN 2 PICKS".
// Used by scripts/test-draft-parser.mjs (in-app demo replay retired in ADR-026).

export const PLAYERS_TAB = `Debug
10:40
•|| 5G
UP IN 2 PICKS
SEANJDUNN
1hr
QB
RB WR TE
2
Players
CADDIEKEV
3.8 | 32
QB RB WR TE
0
BIRDENTHUSIAST
3.9 | 33
QB
RB WR TE
O
Queue
RB
R
QB
*
*
QB
Chris Olave
WR13
NO, Bye 8
Kyren Williams
RB15
J LAR, Bye 11
Tee Higgins
WR15
] CIN, Bye 6
Josh Allen
QB1
]BUF, Bye 7
Emeka Egbuka
WR16
TB, Bye 10
Ladd McConkey
WR17
] LAC, Bye 7
Javonte Williams
RB17
DAL, Bye 14
Malik Nabers
WR18
NYG, Bye 8
Tetairoa McMillan
WR19
CAR, Bye 5
WR
ADP=
29.5
31.2
HOLTWILL33
3.10 | 34
QB
RB WR TE
Board
TE
Proj=
189.8
196.0
2 picks away
32.8
34.6
34.9
35.0
36.3
38.6
38.7
177.9
363.5
182.5
171.8
190.8
179.3
176.9
く
く
V`;

export const BOARD_TAB_1 = `10:40
SEANJDUNN
1hr
QB
RB WR TE
2
Players
JORLAND50
1
2
3
4
1
Jahmyr
Gibbs
RB - DET (1.1)
Jaxon
Smith-Njigba
WR - SEA (1.2)
Bijan
Robinson
RB - ATL (1.3)
Ja'Marr
Chase
WR - CIN (1.4)
PL
Na
WR
24
23
22
21
20
2
Rashee
Rice
WR- KC (2.12)
Nico
Collins
WR - HOU (2.11)
Drake
London
WR - ATL (2.10)
A.J.
Brown
WR - NE (2.9)
Br
Bc
TE
25
26
27
28
29
3
Trey
McBride
TE - ARI (3.1)
George Pickens
WR - DAL (3.2)
Zay
Flowers
WR - BAL (3.3)
Breece
Hall
RB - NYJ (3.4)
Tr
Et
RB
48
47
46
45
4
5
49
50
51
52
53
72
71
70
69
68
6
73
74
75
76
77
7
96
95
94
93
92
UP IN 2 PICKS
CADDIEKEV
3.8 | 32
QB RB WR TE
JRAE99
BIRDENTHUSIAST
3.9 | 33
QB
RB WR TE
2
Queue
NEWAGEOUTLAWS
HOLTWILL33
3.10 | 34
QB
RB WR TE
Board
BWELLS
R
QB`;

export const BOARD_TAB_2 = `10:40
<
QB
1
2
SEANJDUNN
1hr
RB WR TE
2
Players
CADDIEKEV
Amon-Ra st. Brown
VR - DET (1.8)
Je Von
Achane
:B - MIA (2.5)
12
4
5
6
7
i6
15
10
19
UP IN 2 PICKS
CADDIEKEV
3.8 | 32
QB RB WR TE
BIRDENTHUSIAST
9
Jonathan
Taylor
RB - IND (1.9)
16
Chase
Brown
RB - CIN (2.4)
33
BIRDENTHUSIAST
3.9 | 33
QB
RB WR TE
2
Queue
HOLTWILL33
10
Justin
Jefferson
WR - MIN (1.10)
15
Omarion
Hampton
RB - LAC (2.3)
34
40
39
57
64
81
88
58
63
82
87
HOLTWILL33
310 | 34
QB
RB WR TE
Board
RUMGOOD
11
CeeDee
Lamb
WR - DAL (1.11)
14
Ashton
Jeanty
RB - LV (2.2)
35
38
59
62
83
86
R
QB
12 Jan
Coo
RB - B
13
Ken
Wal
RB - k
36
37
60
61
84
85`;

export const QUEUE_TAB = `10:40
5G
<
UP IN 2 PICKS
QB
SEANJDUNN
59:50
RB WR TE
CADDIEKEV
3.8 | 32
BIRDENTHUSIAST
3.9|33
HOLTWILL33
3.10 | 34
QB RB WR TE
0
QB
RB WR TE
QB
RB WR TE
Players
Queue
Board
ADP =
Proj=
Chris Olave
WR13
NO, Bye 8
29.5
ADP
189.8
Proj
R
QB`;

export const ALL_SCREENS = [PLAYERS_TAB, BOARD_TAB_1, BOARD_TAB_2, QUEUE_TAB];
