import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { AppSelect } from './AppSelect';

interface AppDateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  includeDate?: boolean;
  includeTime?: boolean;
  compact?: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');

const parseValue = (value: string) => {
  if (!value) return null;

  if (/^\d{2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(':').map(Number);
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toDateTimeValue = (date: Date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
);

const toTimeValue = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const monthLabel = (date: Date) => (
  new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date)
);

const displayLabel = (value: string, includeDate: boolean, includeTime: boolean, placeholder: string) => {
  const date = parseValue(value);
  if (!date) return placeholder;

  if (!includeDate && includeTime) {
    return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  if (includeDate && !includeTime) {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

export const AppDateTimePicker: React.FC<AppDateTimePickerProps> = ({
  value,
  onChange,
  placeholder,
  includeDate = true,
  includeTime = true,
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const resolvedPlaceholder = placeholder || (includeDate ? 'Select date' : 'Select time');
  const parsed = parseValue(value);
  const initialDate = parsed || new Date();
  const [draft, setDraft] = useState<Date>(initialDate);
  const [viewDate, setViewDate] = useState<Date>(initialDate);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties | undefined>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    if (window.innerWidth <= 768) {
      setPopoverStyle(undefined);
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const margin = 16;
    const gap = 8;
    const preferredWidth = includeDate ? 304 : Math.max(triggerRect.width, 220);
    const width = Math.min(preferredWidth, window.innerWidth - margin * 2);
    const popoverHeight = popoverRef.current?.offsetHeight || (includeDate ? 440 : 150);

    let left = triggerRect.left;
    if (left + width > window.innerWidth - margin) {
      left = triggerRect.right - width;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    let top = triggerRect.bottom + gap;
    if (top + popoverHeight > window.innerHeight - margin && triggerRect.top > popoverHeight + gap) {
      top = triggerRect.top - popoverHeight - gap;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - margin - Math.min(popoverHeight, window.innerHeight - margin * 2)));

    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      width,
      minWidth: Math.min(triggerRect.width, width)
    });
  }, [includeDate]);

  useEffect(() => {
    if (!isOpen) return;

    const latest = parseValue(value) || new Date();
    setDraft(latest);
    setViewDate(latest);
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;

    updatePopoverPosition();
    const frame = window.requestAnimationFrame(updatePopoverPosition);

    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

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

  const days = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [viewDate]);

  const hourOptions = Array.from({ length: 12 }, (_, index) => {
    const hour = index + 1;
    return {
      value: String(hour),
      label: String(hour)
    };
  });

  const periodOptions = [
    { value: 'AM', label: 'AM' },
    { value: 'PM', label: 'PM' }
  ];

  const displayHour = draft.getHours() % 12 || 12;
  const displayPeriod = draft.getHours() >= 12 ? 'PM' : 'AM';

  const to24Hour = (hour12: number, period: string) => {
    if (period === 'AM') return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  const updatePeriod = (period: string) => {
    const next = new Date(draft);
    next.setHours(to24Hour(displayHour, period));
    next.setSeconds(0, 0);
    setDraft(next);
    onChange(includeDate ? toDateTimeValue(next) : toTimeValue(next));
  };

  const updateHour = (hour: string) => {
    const next = new Date(draft);
    next.setHours(to24Hour(Number(hour), displayPeriod));
    next.setSeconds(0, 0);
    setDraft(next);
    onChange(includeDate ? toDateTimeValue(next) : toTimeValue(next));
  };

  const minuteOptions = Array.from({ length: 60 }, (_, minute) => ({
    value: pad(minute),
    label: pad(minute)
  }));

  const applyValue = (nextDraft = draft) => {
    onChange(includeDate ? toDateTimeValue(nextDraft) : toTimeValue(nextDraft));
    setIsOpen(false);
  };

  const updateTime = (part: 'hour' | 'minute', nextValue: string) => {
    const next = new Date(draft);
    if (part === 'hour') next.setHours(Number(nextValue));
    else next.setMinutes(Number(nextValue));
    next.setSeconds(0, 0);
    setDraft(next);
    onChange(includeDate ? toDateTimeValue(next) : toTimeValue(next));
  };

  const selectDay = (day: Date) => {
    const next = new Date(draft);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    next.setSeconds(0, 0);
    setDraft(next);
    onChange(toDateTimeValue(next));
    if (!includeTime) setIsOpen(false);
  };

  const moveMonth = (amount: number) => {
    setViewDate(current => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  const clearValue = () => {
    onChange('');
    setIsOpen(false);
  };

  const label = displayLabel(value, includeDate, includeTime, resolvedPlaceholder);

  return (
    <div
      ref={rootRef}
      className={`app-date-picker ${compact ? 'app-date-picker-compact' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`app-date-trigger ${value ? '' : 'is-placeholder'}`}
        onClick={() => setIsOpen(open => !open)}
      >
        {includeDate ? <Calendar size={14} /> : <Clock size={14} />}
        <span>{label}</span>
        {value && (
          <span
            className="app-date-clear"
            onClick={(event) => {
              event.stopPropagation();
              clearValue();
            }}
          >
            <X size={13} />
          </span>
        )}
      </button>

      {isOpen && (
        <div ref={popoverRef} className="app-date-popover" style={popoverStyle}>
          {includeDate && (
            <>
              <div className="app-date-header">
                <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">
                  <ChevronLeft size={16} />
                </button>
                <span>{monthLabel(viewDate)}</span>
                <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="app-date-weekdays">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>

              <div className="app-date-grid">
                {days.map(day => {
                  const isCurrentMonth = day.getMonth() === viewDate.getMonth();
                  const isSelected = (
                    day.getFullYear() === draft.getFullYear() &&
                    day.getMonth() === draft.getMonth() &&
                    day.getDate() === draft.getDate()
                  );

                  return (
                    <button
                      type="button"
                      key={day.toISOString()}
                      className={`${isCurrentMonth ? '' : 'is-muted'} ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => selectDay(day)}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {includeTime && (
            <div className="app-time-row">
              <Clock size={14} />
              <AppSelect
                value={String(displayHour)}
                onChange={updateHour}
                options={hourOptions}
                compact
              />
              <span className="app-time-divider">:</span>
              <AppSelect
                value={pad(draft.getMinutes())}
                onChange={nextValue => updateTime('minute', nextValue)}
                options={minuteOptions}
                compact
              />
              <AppSelect
                value={displayPeriod}
                onChange={updatePeriod}
                options={periodOptions}
                compact
              />
            </div>
          )}

          <div className="app-date-actions">
            <button type="button" onClick={clearValue}>Clear</button>
            <button type="button" onClick={() => applyValue()}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
};
