import { describe, expect, it } from 'vitest';
import { sanitizeTaskUpdates, WORKSPACE_SELECTS } from './workspaceContract';

describe('workspace database contract', () => {
  it('keeps every module on an explicit live-schema selection', () => {
    expect(Object.keys(WORKSPACE_SELECTS).sort()).toEqual([
      'categories',
      'departments',
      'profiles',
      'report_schedules',
      'statuses',
      'tasks',
      'ticket_requests',
      'user_roles'
    ]);
    expect(WORKSPACE_SELECTS.tasks).toContain('recurrence_timezone');
    expect(WORKSPACE_SELECTS.tasks).toContain('reminder_claimed_at');
    expect(WORKSPACE_SELECTS.report_schedules).toContain('timezone');
    expect(WORKSPACE_SELECTS.ticket_requests).toContain('linked_task_id');
  });

  it('removes undefined and non-updatable task fields from mutation payloads', () => {
    const payload = sanitizeTaskUpdates({
      title: 'Updated title',
      category: undefined,
      id: 'immutable-id',
      recurrence_timezone: 'Africa/Cairo'
    } as never);

    expect(payload).toEqual({
      title: 'Updated title',
      recurrence_timezone: 'Africa/Cairo'
    });
  });
});
