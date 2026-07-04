import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface AppSelectOption {
  value: string;
  label: string;
  color?: string;
  disabled?: boolean;
}

interface AppSelectProps {
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  accentColor?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const AppSelect: React.FC<AppSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  icon,
  disabled = false,
  compact = false,
  fullWidth = false,
  accentColor,
  searchable = false,
  searchPlaceholder = 'Search...',
  className,
  style
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selected = options.find(option => option.value === value);
  const displayColor = selected?.color || accentColor;
  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return options;

    return options.filter(option => (
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query)
    ));
  }, [options, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }

    if (searchable) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen, searchable]);

  const handleSelect = (option: AppSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div
      ref={rootRef}
      className={`app-select ${fullWidth ? 'app-select-full' : ''} ${compact ? 'app-select-compact' : ''} ${className || ''}`}
      style={style}
    >
      <button
        type="button"
        className="app-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen(open => !open)}
        style={displayColor ? ({ '--select-accent': displayColor } as React.CSSProperties) : undefined}
      >
        {icon && <span className="app-select-icon">{icon}</span>}
        {displayColor && <span className="app-select-dot" />}
        <span className={`app-select-label ${selected ? '' : 'is-placeholder'}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`app-select-chevron ${isOpen ? 'is-open' : ''}`} size={15} />
      </button>

      {isOpen && (
        <div className="app-select-menu">
          {searchable && (
            <div className="app-select-search">
              <Search size={13} />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={searchPlaceholder}
                onClick={event => event.stopPropagation()}
              />
            </div>
          )}
          {filteredOptions.map(option => (
            <button
              type="button"
              key={option.value}
              className={`app-select-option ${option.value === value ? 'is-selected' : ''}`}
              disabled={option.disabled}
              onClick={() => handleSelect(option)}
            >
              {option.color && (
                <span
                  className="app-select-option-dot"
                  style={{ background: option.color, boxShadow: `0 0 10px ${option.color}55` }}
                />
              )}
              <span className="app-select-option-label">{option.label}</span>
              {option.value === value && <Check size={14} className="app-select-check" />}
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <div className="app-select-empty">No matches</div>
          )}
        </div>
      )}
    </div>
  );
};
