import { useState, useRef } from 'react';

/**
 * Autocomplete multi-select input with chip tags and dropdown.
 *
 * Props:
 *  - selected       (string[])         — currently selected items
 *  - onAdd          (string => void)   — add an item
 *  - onRemove       (string => void)   — remove an item
 *  - onClear        (() => void)       — clear all selected + search text
 *  - suggestions    (string[])         — filtered suggestion list from parent
 *  - searchValue    (string)           — controlled search text
 *  - onSearchChange (string => void)   — search text changed
 *  - placeholder    (string)
 *  - chipColor      (string)           — e.g. '#00e5a0' or 'var(--pos-te)'
 *  - label          (string)           — optional label above the input
 *  - className      (string)
 */
export default function MultiSelectInput({
  selected = [],
  onAdd,
  onRemove,
  onClear,
  suggestions = [],
  searchValue,
  onSearchChange,
  placeholder = 'Search...',
  chipColor = 'var(--accent)',
  label,
  className,
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef(null);
  const blurTimeout = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      onAdd(suggestions[highlightIdx]);
      onSearchChange('');
      setHighlightIdx(0);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    } else if (e.key === 'Backspace' && !searchValue && selected.length > 0) {
      onRemove(selected[selected.length - 1]);
    }
  };

  const handleSelect = (item) => {
    clearTimeout(blurTimeout.current);
    onAdd(item);
    onSearchChange('');
    setHighlightIdx(0);
    inputRef.current?.focus();
  };

  const chipBg = chipColor + '15';
  const chipBorder = chipColor + '35';

  return (
    <div className={`filter-multiselect ${className || ''}`}>
      {label && <span className="filter-select-label">{label}</span>}
      <div className="filter-multiselect__box" onClick={() => inputRef.current?.focus()}>
        {selected.map(item => (
          <span
            key={item}
            className="filter-multiselect__chip"
            style={{ background: chipBg, color: chipColor, border: `1px solid ${chipBorder}` }}
          >
            {item}
            <button
              onClick={e => { e.stopPropagation(); onRemove(item); }}
              className="filter-multiselect__chip-remove"
              style={{ color: chipColor }}
              type="button"
            >
              ✕
            </button>
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
          placeholder={selected.length === 0 ? placeholder : `Add ${placeholder.toLowerCase()}...`}
        />
        {(selected.length > 0 || searchValue) && (
          <button className="filter-multiselect__clear" onClick={onClear} type="button">✕</button>
        )}
      </div>
      {showDropdown && suggestions.length > 0 && (
        <div className="filter-multiselect__dropdown">
          {suggestions.map((item, i) => (
            <div
              key={item}
              onMouseDown={e => { e.preventDefault(); handleSelect(item); }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`filter-multiselect__option ${i === highlightIdx ? 'filter-multiselect__option--highlighted' : ''}`}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
