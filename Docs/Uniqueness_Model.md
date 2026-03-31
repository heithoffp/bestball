This architecture defines a **Market-Aware Best Ball Uniqueness Model**. Unlike a simple frequency count, this system simulates the draft as a sequential, state-dependent decision process that mirrors human drafting psychology, including the tendency to "reach" for stacks and adhere to structural archetypes.

---

# Feature Specification: Best Ball Roster Uniqueness Engine

## 1. Overview
The **Roster Uniqueness Engine** quantifies the rarity of any 6 or 7-player combination within a large-field tournament. By running $X$ million Monte Carlo simulations that account for shifting ADP and drafting biases (stacking, structures, Week 17), the tool provides a "Lineup Scarcity Score"—predicting how many times a specific combination will appear per 1 million entries.

## 2. The Core Algorithm: Sequential Utility Sampling
The simulation utilizes a **Conditional Logit (Plackett-Luce)** model. Instead of picking players based on a static percentage, the engine evaluates the "Utility" of every available player at every pick.

### The Utility Function
For any player $i$ at time $t$ and current pick $P$, the total utility $U_i$ is calculated as:

$$U_i(t, P) = \text{Base}(ADP_{it}, \sigma_{it}, P) \cdot \omega_{\text{stack}} \cdot \omega_{\text{struct}} \cdot \omega_{\text{corr}}$$

#### Components:
* **Base Utility:** A probability density function (Gaussian) centered on the player's current ADP. As the current pick $P$ moves past a player's ADP, their utility drops exponentially.
* **$\omega_{\text{stack}}$ (Correlation Multiplier):** If the drafting team has already selected a teammate (e.g., Team has QB, Player $i$ is WR1), the utility is multiplied by a "Reach Factor" (typically $1.2x$ to $2.0x$).
* **$\omega_{\text{struct}}$ (Roster Archetype Multiplier):** Dynamically adjusts based on current roster needs.
    * *Example:* If a team has 3 RBs in the first 4 rounds, $\omega_{\text{struct}}$ for remaining RBs drops to $0.1x$ to prevent "impossible" builds.
* **$\omega_{\text{corr}}$ (Week 17 Multiplier):** A secondary boost applied to players whose teams face the drafting team's already-selected "anchors" in the final week of the season.

---

## 3. Temporal Simulation & Weighting
Since rosters are drafted evenly across the drafting season (February–September), the model uses a **Segmented Monte Carlo** approach.

1.  **Epoch Segmentation:** Divide the drafting season into $N$ time buckets (e.g., Weekly or Monthly).
2.  **Batch Processing:** Run $M$ simulations per epoch using the specific ADP data from that date.
3.  **Equal Weighting:** The final distribution is an aggregate of all epochs. If you want a 1 million roster distribution and have 10 time epochs, you simulate 100,000 rosters per epoch.
    * *Why:* This ensures that a roster that was "chalk" in February (but impossible in August) is correctly represented as a rare combination in the final total pool.

---

## 4. Implementation Steps

### Step A: The Simulation (Offline)
* **Language:** Python (for vectorization/speed).
* **Process:**
    1.  Initialize 12 "Team" objects.
    2.  For rounds 1 through 7, iterate through teams in snake-draft order.
    3.  Calculate $U_i$ for all available players for the current team.
    4.  Convert $U_i \rightarrow P_i$ (Probability) via Softmax.
    5.  Randomly sample the pick and update the board.
    6.  **Normalize:** Sort the final 7-player roster by Player ID.
    7.  **Store:** Hash the sorted roster and increment a counter in a global frequency table.

### Step B: The Uniqueness Analysis (Online)
Once the simulation is pre-computed, the comparison is a simple $O(1)$ lookup.

1.  **Input:** User provides 6 or 7 players.
2.  **Lookup:** Query the Frequency Table for the hashed combination.
3.  **Disruption Analysis (The "Unique Player" Finder):**
    * Generate all $n-1$ subsets of the input roster.
    * The subset with the highest frequency represents the "Chalk Core."
    * The player omitted from that core is the **Lineup Disruptor**.

---

## 5. Proposed Data Structure
To handle millions of rosters efficiently, use a **Key-Value Store (Redis)** or a **Compressed Hashmap**:

| Key (Sorted Player ID Hash) | Count (Instances Found) | Frequency (per 1M) |
| :--- | :--- | :--- |
| `p102_p405_p801_p12...` | 42 | 3.5 |
| `p101_p202_p303_p40...` | 890 | 74.2 |

---

## 6. Expected Output Example
> **Input:** [McCaffrey, Olave, London, Andrews, Montgomery, Goff]
>
> **Uniqueness Score:** 14.2 Copies per 1 Million.
> **Analysis:** This combination is **Highly Unique**. While the [McCaffrey, Olave, London] core is found in 450/1M rosters, the addition of **David Montgomery** in Round 5 (given this specific start) drops the frequency by 85%, identifying him as your **Lineup Disruptor**.

How do you plan to handle the "ADP Variance" data—do you have standard deviation figures for each player, or are you planning to derive that from the min/max drafting range in your historical data?