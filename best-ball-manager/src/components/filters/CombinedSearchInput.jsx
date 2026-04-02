import { useState, useRef } from 'react';

/**
 * Combined player + team autocomplete multi-select input.
 * Player chips use var(--positive) with a "PL ·" prefix.
 * Team chips use var(--info) with a "TM ·" prefix.
 * Non-color disambiguation satisfies the UI/UX Guide §11 accessibility requirement.
 *
 * Props:
 *  selectedPlayers   (string[])
 *  selectedTeams     (string[])
 *  onAddPlayer       (string => void)
 *  onAddTeam         (string => void)
 *  onRemovePlayer    (string => void)
 *  onRemoveTeam      (string => void)
 *  onClear           (() => void)
 *  playerSuggestions (string[])
 *  teamSuggestions   (string[])
 *  teamNames         (object)   — { abbrev: fullName } for dropdown display
 *  searchValue       (string)
 *  onSearchChange    (string => void)
 *  placeholder       (string)
 *  label             (string)
 */
export default function CombinedSearchInput({
  selectedPlayers = [],
  selectedTeams = [],
  onAddPlayer,
  onAddTeam,
  onRemovePlayer,
  onRemoveTeam,
  onClear,
  playerSuggestions = [],
  teamSuggestions = [],
  teamNames = {},
  searchValue,
  onSearchChange,
  placeholder = 'Search players & teams...',
  label,
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef(null);
  const blurTimeout = useRef(null);

  // Flat combined list for keyboard navigation: players first, then teams
  const combined = [
    ...playerSuggestions.map(v => ({ value: v, type: 'player' })),
    ...teamSuggestions.map(v => ({ value: v, type: 'team' })),
  ];

  const handleSelect = (item) => {
    clearTimeout(blurTimeout.current);
    if (item.type === 'player') onAddPlayer(item.value);
    else onAddTeam(item.value);
    onSearchChange('');
    setHighlightIdx(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, combined.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && combined.length > 0) {
      e.preventDefault();
      handleSelect(combined[highlightIdx]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    } else if (e.key === 'Backspace' && !searchValue) {
      if (selectedTeams.length > 0) onRemoveTeam(selectedTeams[selectedTeams.length - 1]);
      else if (selectedPlayers.length > 0) onRemovePlayer(selectedPlayers[selectedPlayers.length - 1]);
    }
  };

  const playerColor = 'var(--positive)';
  const teamColor = 'var(--info)';

  const chipStyle = (color) => ({
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color,
    border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
  });

  const hasContent = selectedPlayers.length > 0 || selectedTeams.length > 0 || searchValue;
  const showDivider = playerSuggestions.length > 0 && teamSuggestions.length > 0;

  return (
    <div className="filter-multiselect">
      {label && <span className="filter-select-label">{label}</span>}
      <div className="filter-multiselect__box" onClick={() => inputRef.current?.focus()}>
        {selectedPlayers.map(name => (
          <span key={`p:${name}`} className="filter-multiselect__chip" style={chipStyle(playerColor)}>
            <span style={{ color: 'var(--text-muted)', marginRight: 3, fontSize: '0.8em' }}>PL ·</span>
            {name}
            <button
              onClick={e => { e.stopPropagation(); onRemovePlayer(name); }}
              className="filter-multiselect__chip-remove"
              style={{ color: playerColor }}
              type="button"
            >✕</button>
          </span>
        ))}
        {selectedTeams.map(team => (
          <span key={`t:${team}`} className="filter-multiselect__chip" style={chipStyle(teamColor)}>
            <span style={{ color: 'var(--text-muted)', marginRight: 3, fontSize: '0.8em' }}>TM ·</span>
            {team}
            <button
              onClick={e => { e.stopPropagation(); onRemoveTeam(team); }}
              className="filter-multiselect__chip-remove"
              style={{ color: teamColor }}
              type="button"
            >✕</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="filter-multiselect__input"
          value={searchValue}
          onChange={e => { onSearchChange(e.target.value); setShowDropdown(true); setHighlightIdx(0); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => { blurTimeout.current = setTimeout(() => setShowDropdown(false), 150); }}
          onKeyDown={handleKeyDown}
          placeholder={selectedPlayers.length === 0 && selectedTeams.length === 0 ? placeholder : 'Add more...'}
        />
        {hasContent && (
          <button className="filter-multiselect__clear" onClick={onClear} type="button">✕</button>
        )}
      </div>
      {showDropdown && combined.length > 0 && (
        <div className="filter-multiselect__dropdown">
          {playerSuggestions.map((name, i) => (
            <div
              key={`p:${name}`}
              onMouseDown={e => { e.preventDefault(); handleSelect({ value: name, type: 'player' }); }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`filter-multiselect__option ${i === highlightIdx ? 'filter-multiselect__option--highlighted' : ''}`}
            >
              <span style={{ color: 'var(--text-muted)', marginRight: 6, fontSize: '0.8em' }}>PL</span>
              {name}
            </div>
          ))}
          {showDivider && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
          )}
          {teamSuggestions.map((team, i) => {
            const flatIdx = playerSuggestions.length + i;
            return (
              <div
                key={`t:${team}`}
                onMouseDown={e => { e.preventDefault(); handleSelect({ value: team, type: 'team' }); }}
                onMouseEnter={() => setHighlightIdx(flatIdx)}
                className={`filter-multiselect__option ${flatIdx === highlightIdx ? 'filter-multiselect__option--highlighted' : ''}`}
              >
                <span style={{ color: 'var(--text-muted)', marginRight: 6, fontSize: '0.8em' }}>TM</span>
                {team}
                {teamNames[team] && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.8em' }}>· {teamNames[team]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
