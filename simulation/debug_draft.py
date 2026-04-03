"""Export 1-2 full draft boards as CSV for manual inspection."""

import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from models import load_players, DraftState
from engine import compute_utilities, simulate_draft

def export_draft_boards(num_drafts=2):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    adp_dir = os.path.normpath(os.path.join(script_dir, "..", "best-ball-manager", "src", "assets", "adp"))
    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)

    players, adp_date = load_players(adp_dir)
    print(f"Loaded {len(players)} players from {adp_date}")

    rng = np.random.default_rng(42)
    sigma_slope = 0.1
    sigma_intercept = 1.5

    for draft_num in range(num_drafts):
        state = DraftState(num_teams=12, num_rounds=6)
        available_set = set(range(len(players)))
        rows = []

        for pick_num, team_idx in state.pick_order():
            if not available_set:
                break

            avail_indices = sorted(available_set)
            avail_players = [players[i] for i in avail_indices]
            utilities = compute_utilities(avail_players, pick_num, sigma_slope, sigma_intercept)

            # Normalize directly — utilities are already exp(-0.5 * z²)
            total = utilities.sum()
            probs = utilities / total if total > 0 else np.ones(len(avail_players)) / len(avail_players)

            # Top 5 candidates by probability for context
            top5_idx = np.argsort(probs)[-5:][::-1]
            top5 = [(avail_players[i].display_name, f"{probs[i]:.4f}", f"{avail_players[i].adp:.1f}") for i in top5_idx]

            local_idx = rng.choice(len(avail_players), p=probs)
            chosen = avail_players[local_idx]
            global_idx = avail_indices[local_idx]
            available_set.remove(global_idx)

            current_round = (pick_num - 1) // 12 + 1
            sigma = sigma_slope * chosen.adp + sigma_intercept

            rows.append({
                "overall_pick": pick_num,
                "round": current_round,
                "team": team_idx + 1,
                "player": chosen.display_name,
                "position": chosen.position,
                "nfl_team": chosen.team,
                "adp": chosen.adp,
                "sigma": f"{sigma:.2f}",
                "pick_prob": f"{probs[local_idx]:.4f}",
                "top1": f"{top5[0][0]} ({top5[0][1]}, ADP {top5[0][2]})",
                "top2": f"{top5[1][0]} ({top5[1][1]}, ADP {top5[1][2]})",
                "top3": f"{top5[2][0]} ({top5[2][1]}, ADP {top5[2][2]})",
            })

        out_path = os.path.join(output_dir, f"debug_draft_{draft_num + 1}.csv")
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        print(f"Exported draft {draft_num + 1} to {out_path}")


if __name__ == "__main__":
    export_draft_boards(2)
