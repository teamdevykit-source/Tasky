import type { Profile, Status, Task } from './supabase';
import { getTaskAssigneeIds, isTaskComplete } from './supabase';
import { formatDateTime } from './format';

const escapeCsv = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvRow = (values: unknown[]) => values.map(escapeCsv).join(',');

export function downloadEmployeeSummary(
  tasks: Task[],
  profiles: Profile[],
  statuses: Status[]
) {
  const rows: string[] = [
    csvRow([
      'Employee', 'Email', 'Role', 'Department', 'Job Title',
      'Total Tasks', 'Completed', 'Completion %'
    ])
  ];

  profiles.forEach(profile => {
    const assigned = tasks.filter(task => getTaskAssigneeIds(task).includes(profile.id));
    const completed = assigned.filter(task => isTaskComplete(task, statuses));
    const percentage = assigned.length > 0
      ? Math.round((completed.length / assigned.length) * 100)
      : 0;
    rows.push(csvRow([
      profile.full_name,
      profile.email,
      profile.role,
      profile.department || '-',
      profile.job_title || '-',
      assigned.length,
      completed.length,
      `${percentage}%`
    ]));
  });

  rows.push('', csvRow([
    'Employee', 'Email', 'Role', 'Task', 'Status', 'Priority',
    'Category', 'Deadline', 'Completed'
  ]));

  profiles.forEach(profile => {
    tasks
      .filter(task => getTaskAssigneeIds(task).includes(profile.id))
      .forEach(task => {
        rows.push(csvRow([
          profile.full_name,
          profile.email,
          profile.role,
          task.title || 'Untitled',
          task.status || 'No status',
          task.priority || '-',
          task.category || '-',
          task.end_date ? formatDateTime(task.end_date) : '-',
          isTaskComplete(task, statuses) ? 'Yes' : 'No'
        ]));
      });
  });

  const blob = new Blob([`\uFEFF${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'employee_summary.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
