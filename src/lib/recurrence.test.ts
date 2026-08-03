import { describe, expect, it } from 'vitest';
import { computeNextRecurrenceAfter } from './recurrence';
import { getCompletedStatus, getTaskAssigneeIds, isTaskComplete } from './supabase';
import type { Status, Task } from './supabase';

const statuses: Status[] = [
  { id: 'todo', name: 'To Do', color: '#999999', sort_order: 0, is_completed: false },
  { id: 'closed', name: 'Closed', color: '#00aa00', sort_order: 1, is_completed: true }
];

const task = (updates: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Test task',
  description: '',
  assignee_id: null,
  assignee_ids: [],
  creator_id: 'creator-1',
  status: 'To Do',
  category: null,
  observers: [],
  created_at: '2026-01-01T00:00:00.000Z',
  ...updates
});

describe('task assignment compatibility', () => {
  it('deduplicates the canonical assignment array', () => {
    expect(getTaskAssigneeIds(task({
      assignee_id: 'worker-1',
      assignee_ids: ['worker-1', 'worker-1', 'worker-2']
    }))).toEqual(['worker-1', 'worker-2']);
  });

  it('falls back to the legacy scalar assignee', () => {
    expect(getTaskAssigneeIds(task({ assignee_id: 'worker-1', assignee_ids: [] })))
      .toEqual(['worker-1']);
  });
});

describe('completed status semantics', () => {
  it('uses the explicit completion flag rather than status order or name', () => {
    expect(getCompletedStatus(statuses)?.name).toBe('Closed');
    expect(isTaskComplete(task({ status: 'Closed' }), statuses)).toBe(true);
    expect(isTaskComplete(task({ status: 'To Do' }), statuses)).toBe(false);
  });
});

describe('recurrence calculations', () => {
  it('advances a daily recurrence beyond the supplied instant', () => {
    const after = new Date(2026, 0, 10, 10, 30);
    const next = computeNextRecurrenceAfter('daily', '09:00', null, after);
    expect(next.getTime()).toBeGreaterThan(after.getTime());
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it('clamps monthly day 31 to the last day of a shorter month', () => {
    const after = new Date(2026, 0, 31, 12, 0);
    const next = computeNextRecurrenceAfter('monthly', '09:00', 31, after);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it('selects the requested weekly day', () => {
    const after = new Date(2026, 0, 5, 12, 0);
    const next = computeNextRecurrenceAfter('weekly', '09:00', 3, after);
    expect(next.getDay()).toBe(3);
    expect(next.getTime()).toBeGreaterThan(after.getTime());
  });
});
