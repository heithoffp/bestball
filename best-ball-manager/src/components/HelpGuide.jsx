import React from 'react';

const sections = [
  {
    title: 'Getting Started',
    icon: null,
    purpose: 'Best Ball Exposures analyzes your best-ball draft portfolio using data synced from the Chrome extension. Install the extension, sync your Underdog entries, and your full portfolio analysis loads automatically.',
    features: [
      'Install the Chrome extension and visit your Underdog completed entries page to sync your portfolio',
      'ADP snapshots track how player draft cost changes over time and are bundled automatically',
      'All tabs share the same underlying data — one sync powers the entire app',
    ],
    tips: [
      'Re-syncing is as simple as refreshing the page after you run a new sync from the extension',
      'ADP snapshots are date-stamped files that build the historical timeline in ADP Tracker',
    ],
  },
  {
    title: 'Exposures',
    icon: null,
    purpose: 'See how much of your portfolio is invested in each player. Exposure % tells you what fraction of your rosters include a given player.',
    features: [
      'Sortable columns. Click any header to sort by that metric',
      'Search and filter by player name, team, or position',
      'Strategy filters let you view exposure within specific RB/QB/TE archetypes',
      'Toggle "Show 0%" to include players you haven\'t drafted',
    ],
    tips: [
      'High exposure to a single player means your portfolio is heavily correlated to their outcome. Diversify if that\'s unintentional',
      'Use the ADP column to spot players whose cost has shifted since you drafted them',
    ],
  },
  {
    title: 'Rosters',
    icon: null,
    purpose: 'Browse and evaluate each individual roster in your portfolio with composite grades, stack detection, and detailed breakdowns.',
    features: [
      'Search for rosters containing a specific player or filter by team stacks',
      'Archetype filters (RB/QB/TE) show strategy distribution across your portfolio',
      'Sortable table with composite grade, draft date, projected points, and more',
      'Expand any roster to see the full grade breakdown, draft capital map, stack summary, and player-by-player detail',
    ],
    tips: [
      'CLV% shows how much value you captured relative to where a player ended up being drafted. Positive means you got a bargain',
      'Uniqueness score shows how often your exact first-4-pick combination appeared across 1.2M simulated drafts — lower is rarer',
      '"< 1 / 1.2M" means your combo was never observed in simulation — genuinely rare construction',
    ],
  },
  {
    title: 'Uniqueness Score',
    icon: null,
    purpose: 'Your first 4 picks define your roster identity. Rounds 1–4 are where drafter intent crystallises — RB-heavy vs WR-heavy, early QB, team stacks. Rounds 5–6 add little additional signal.',
    features: [
      'Score format "X / 1.2M" — this exact combination of first 4 picks appeared X times across 1.2M simulated drafts',
      '"< 1 / 1.2M" — this combination was never directly observed in simulation. Genuinely rare construction',
      'Sort by Uniqueness to rank your rosters from rarest (lowest count) to most chalk (highest count)',
    ],
    tips: [
      'The simulation models 100,000 drafts across 9 ADP time periods (Feb–Apr 2026) to represent the full season\'s draft landscape',
      'A combo appearing in simulation isn\'t bad — it means smart drafters built that core too. Context is everything',
      'Picks are sorted by ADP to identify your first 4 regardless of which round they were taken',
    ],
  },
  {
    title: 'ADP Tracker',
    icon: null,
    purpose: 'Visualize how player ADP has moved over time across multiple snapshots. Identify risers, fallers, and value windows.',
    features: [
      'Select players from the left panel to add their ADP line to the chart',
      'Top 5 exposure players are auto-selected on load',
      'Enable quartile boxes to see the range of picks where you\'ve drafted each player',
      'Each player row shows exposure %, current ADP, and value (ADP minus your average pick)',
    ],
    tips: [
      'A player whose ADP is rising (getting drafted earlier) that you already have at a cheaper price means you captured good value',
      'Use the chart to time future drafts. If a player\'s ADP is falling, you may be able to wait longer to draft them',
    ],
  },
  {
    title: 'Rankings',
    icon: null,
    purpose: 'Create and manage your own tier-based player rankings with drag-and-drop reordering.',
    features: [
      'Tier system from S down to F with granular +/- sub-tiers',
      'Position-specific views (Overall, QB, RB, WR, TE)',
      'Drag and drop players to reorder within or across tiers',
      'Click between players to insert or move tier breaks',
      'Export your rankings to CSV',
    ],
    tips: [
      'Use keyboard shortcuts for rapid tier adjustments while ranking',
      'Tier break labels are editable inline so you can customize them to match your strategy notes',
      'Upload a custom rankings CSV to start from your own baseline rather than the default',
    ],
  },
  {
    title: 'Draft Assistant',
    icon: null,
    purpose: 'An interactive draft simulator that recommends picks based on your portfolio context, balancing value, diversification, and strategy fit.',
    features: [
      'Select your draft slot and see available players within the current ADP window',
      'Each candidate shows a lift score, path exposure, and correlation to your current picks',
      'Strategy viability indicators show which RB/QB/TE archetypes are still achievable',
      'Hover over any candidate to see a detailed correlation breakdown',
      'Search to find any player regardless of ADP window',
    ],
    tips: [
      'Lift score measures how often a player shows up in rosters that match your current draft path compared to the general pool. A lift of 1.0 means they show up at the same rate everywhere (neutral). Below 1.0 means they\'re less common in your path, so drafting them adds diversification. Above 1.0 means they\'re more correlated with your existing picks. Above 2.0 is highly correlated, meaning this player tends to end up on the same rosters as the guys you\'ve already drafted',
      'Watch for "falling knife" warnings. Players falling far below ADP may signal news you should check',
      'Strategy indicators lock or grey out as picks eliminate certain build paths. Use this to stay on track',
      'The correlation column shows which of your existing picks align with a candidate, helping you build intentional stacks',
    ],
  },
];

export default function HelpGuide() {
  return (
    <div className="help-guide" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.5rem 0' }}>
      {sections.map((section, i) => (
        <div key={i} className="help-section">
          <h2 className="help-section-title">{section.title}</h2>
          <p className="help-purpose">{section.purpose}</p>

          <div className="help-group">
            <h3 className="help-group-title">Key Features</h3>
            <ul className="help-list">
              {section.features.map((f, j) => (
                <li key={j}>{f}</li>
              ))}
            </ul>
          </div>

          <div className="help-group">
            <h3 className="help-group-title">Tips</h3>
            <ul className="help-list help-tips">
              {section.tips.map((t, j) => (
                <li key={j}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
