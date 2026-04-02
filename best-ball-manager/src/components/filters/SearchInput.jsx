import { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Debounced search input with icon and clear button.
 *
 * The parent passes `onChange` which receives the debounced value.
 * To reset from outside, change `resetKey` (or just change `value`).
 *
 * Props:
 *  - value        (string)            — initial value / external reset trigger
 *  - onChange      (string => void)   — called with debounced text
 *  - placeholder   (string)
 *  - delay         (number)           — debounce ms, default 250
 *  - className     (string)           — extra class on wrapper
 */
export default function SearchInput({ value, onChange, placeholder = 'Search...', delay = 250, className }) {
  const [raw, setRaw] = useState(value ?? '');

  // When parent explicitly resets value (e.g., switching tabs), sync raw
  const externalValue = value ?? '';
  useEffect(() => {
    setRaw(externalValue);
  }, [externalValue]);

  // Debounced emit to parent
  useEffect(() => {
    const timer = setTimeout(() => onChange(raw), delay);
    return () => clearTimeout(timer);
  }, [raw, delay]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    setRaw('');
    onChange('');
  }, [onChange]);

  return (
    <div className={`filter-search ${className || ''}`}>
      <Search size={14} className="filter-search__icon" />
      <input
        className="filter-search__input"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        placeholder={placeholder}
      />
      {raw && (
        <button className="filter-search__clear" onClick={clear} type="button">
          <X size={12} />
        </button>
      )}
    </div>
  );
}
