import React, { useEffect, useRef, useState } from 'react';
import s from './TournamentMultiSelect.module.css';

/**
 * Multi-select checklist popover for tournament filtering.
 *
 * Props:
 *   slateGroups  — array of { slate: string, tournaments: string[] }
 *   selected     — string[] of selected tournament titles (empty = all)
 *   onChange     — fn(newSelected: string[])
 */
export default function TournamentMultiSelect({ slateGroups, selected, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const triggerLabel = selected.length === 0
    ? 'All Tournaments'
    : `${selected.length} selected`;

  function toggleTournament(title) {
    if (selected.includes(title)) {
      onChange(selected.filter(t => t !== title));
    } else {
      onChange([...selected, title]);
    }
  }

  function toggleSlate(tournaments) {
    const allChecked = tournaments.every(t => selected.includes(t));
    if (allChecked) {
      onChange(selected.filter(t => !tournaments.includes(t)));
    } else {
      const toAdd = tournaments.filter(t => !selected.includes(t));
      onChange([...selected, ...toAdd]);
    }
  }

  return (
    <div className={s.container} ref={containerRef}>
      <button
        type="button"
        className={`${s.trigger} ${selected.length > 0 ? s.triggerActive : ''}`}
        onClick={() => setIsOpen(o => !o)}
      >
        {triggerLabel}
        <span className={s.caret}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className={s.popover}>
          {selected.length > 0 && (
            <div className={s.popoverHeader}>
              <button type="button" className={s.clearAll} onClick={() => onChange([])}>
                Clear all
              </button>
            </div>
          )}

          {slateGroups.length === 0 && (
            <div className={s.empty}>No tournaments available</div>
          )}

          {slateGroups.map(({ slate, tournaments }) => (
            <SlateGroup
              key={slate}
              slate={slate}
              tournaments={tournaments}
              selected={selected}
              onToggleSlate={toggleSlate}
              onToggleTournament={toggleTournament}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SlateGroup({ slate, tournaments, selected, onToggleSlate, onToggleTournament }) {
  const slateCheckRef = useRef(null);
  const checkedCount = tournaments.filter(t => selected.includes(t)).length;
  const allChecked = checkedCount === tournaments.length;
  const someChecked = checkedCount > 0 && !allChecked;

  useEffect(() => {
    if (slateCheckRef.current) {
      slateCheckRef.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  return (
    <div className={s.slateGroup}>
      <label className={s.slateRow}>
        <input
          type="checkbox"
          ref={slateCheckRef}
          checked={allChecked}
          onChange={() => onToggleSlate(tournaments)}
          className={s.checkbox}
        />
        <span className={s.slateLabel}>{slate}</span>
      </label>
      {tournaments.map(t => (
        <label key={t} className={s.tournamentRow}>
          <input
            type="checkbox"
            checked={selected.includes(t)}
            onChange={() => onToggleTournament(t)}
            className={s.checkbox}
          />
          <span className={s.tournamentLabel}>{t}</span>
        </label>
      ))}
    </div>
  );
}
