1. Functional Requirements
A. Draft Contextual Awareness
Pick Calculation: Must calculate the current absolute pick number and the user's "next turn" pick number based on a 12-team snake draft algorithm.

Slot Selection: Provide a manual input for "Draft Slot" (1–12) that re-calculates all return probabilities across the board.

B. The "Decision Table" (Player Board)
Inventory Integration: Display all players from the masterPlayers list not currently in the currentPicks state.

Return Probability (Survival): A logic-gate that compares a player's ADP against the user's Next Pick Number.

Green (Likely): ADP > Next Pick + Buffer.

Red (Danger): ADP < Next Pick.

Combinatorial Overlap Check: For every available player, the engine must scan the rosterData to count how many existing rosters already contain the exact combination of the currentPicks + targetPlayer.

Stack Identification: Visually flag players who belong to the same NFL team as any player already in the currentPicks list.

C. Live Strategy Projection (Stage-Aware)
Viability Analysis: Use the PROTOCOL_TREE to determine if specific archetypes (e.g., Zero RB, Hero RB) are still mathematically achievable based on current picks.

Hover Simulation ("What-If"): On player hover, the component must temporarily "inject" that player into the roster and update the Strategy Impact bars to show how the pick would affect portfolio exposure percentages.