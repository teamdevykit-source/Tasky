import type { RecurrenceType, Task } from './supabase';

const parseTime = (time?: string | null) => {
  const [hour = 9, minute = 0] = (time || '09:00').split(':').map(Number);
  return {
    hour: Number.isFinite(hour) ? hour : 9,
    minute: Number.isFinite(minute) ? minute : 0
  };
};

const daysInMonth = (year: number, month: number) => (
  new Date(year, month + 1, 0).getDate()
);

const clampMonthlyDay = (year: number, month: number, day?: number | null) => (
  Math.min(Math.max(day || 1, 1), daysInMonth(year, month))
);

export const computeNextRecurrenceAfter = (
  type: RecurrenceType,
  time?: string | null,
  day?: number | null,
  after: Date = new Date()
) => {
  const { hour, minute } = parseTime(time);
  const base = new Date(after);
  let next = new Date(base);

  if (type === 'daily') {
    next.setHours(hour, minute, 0, 0);
    if (next <= base) next.setDate(next.getDate() + 1);
    return next;
  }

  if (type === 'weekly') {
    const targetDay = day ?? 1;
    next.setHours(hour, minute, 0, 0);
    let diff = targetDay - base.getDay();
    if (diff < 0 || (diff === 0 && next <= base)) diff += 7;
    next.setDate(next.getDate() + diff);
    return next;
  }

  const targetDay = day ?? 1;
  const clampedDay = clampMonthlyDay(base.getFullYear(), base.getMonth(), targetDay);
  next = new Date(base.getFullYear(), base.getMonth(), clampedDay, hour, minute, 0, 0);

  if (next <= base) {
    const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    next = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      clampMonthlyDay(nextMonth.getFullYear(), nextMonth.getMonth(), targetDay),
      hour,
      minute,
      0,
      0
    );
  }

  return next;
};

export const computeNextRecurrence = (
  type: RecurrenceType,
  time?: string | null,
  day?: number | null
) => computeNextRecurrenceAfter(type, time, day).toISOString();

export const buildRecurringTaskOccurrence = (template: Task, occurrenceAt: Date, defaultStatus: string) => {
  const originalStart = template.start_date ? new Date(template.start_date) : null;
  const originalEnd = template.end_date ? new Date(template.end_date) : null;
  const occurrenceStart = new Date(occurrenceAt);
  let startDate: string | undefined;
  let endDate: string | undefined;
  let reminderAt: string | undefined;

  if (originalStart && !Number.isNaN(originalStart.getTime())) {
    startDate = occurrenceStart.toISOString();
  }

  if (originalEnd && !Number.isNaN(originalEnd.getTime())) {
    if (originalStart && !Number.isNaN(originalStart.getTime())) {
      const durationMs = Math.max(originalEnd.getTime() - originalStart.getTime(), 0);
      endDate = new Date(occurrenceStart.getTime() + durationMs).toISOString();
    } else {
      endDate = occurrenceStart.toISOString();
    }
  }

  const originalReminder = template.reminder_at ? new Date(template.reminder_at) : null;
  if (
    originalReminder &&
    originalEnd &&
    endDate &&
    !Number.isNaN(originalReminder.getTime()) &&
    !Number.isNaN(originalEnd.getTime())
  ) {
    const reminderLeadTime = Math.max(originalEnd.getTime() - originalReminder.getTime(), 0);
    reminderAt = new Date(new Date(endDate).getTime() - reminderLeadTime).toISOString();
  }

  return {
    title: template.title,
    description: template.description,
    assignee_id: template.assignee_id,
    assignee_ids: template.assignee_ids || (template.assignee_id ? [template.assignee_id] : []),
    creator_id: template.creator_id,
    status: defaultStatus,
    priority: template.priority || 'Medium',
    category: template.category,
    observers: template.observers || [],
    is_self_task: template.is_self_task || false,
    start_date: startDate,
    end_date: endDate,
    reminder_at: reminderAt,
    reminder_sent_at: undefined,
    is_recurring: false,
    recurrence_type: undefined,
    recurrence_time: undefined,
    recurrence_day: undefined,
    next_recurrence_at: undefined,
    parent_task_id: template.id
  };
};
