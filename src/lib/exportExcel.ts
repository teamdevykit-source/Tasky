import * as XLSX from 'xlsx';
import type { Task, Profile } from './supabase';
import { getTaskAssigneeIds } from './supabase';
import { formatDateTime } from './format';

export function downloadEmployeeSummary(
  tasks: Task[],
  profiles: Profile[],
  statuses: { name: string; sort_order: number }[]
) {
  const maxSort = statuses.length > 0 ? Math.max(...statuses.map(s => s.sort_order || 0)) : 0;

  const isCompleted = (task: Task) => {
    const st = statuses.find(s => s.name === task.status);
    return !!st && (st.sort_order || 0) === maxSort;
  };

  // Sheet 1: Employee Summary
  const summaryRows = profiles.map(p => {
    const assigned = tasks.filter(t => getTaskAssigneeIds(t).includes(p.id));
    const completed = assigned.filter(isCompleted);
    const pct = assigned.length > 0 ? Math.round((completed.length / assigned.length) * 100) : 0;
    return {
      'Employee': p.full_name,
      'Email': p.email,
      'Role': p.role,
      'Department': p.department || '-',
      'Job Title': p.job_title || '-',
      'Total Tasks': assigned.length,
      'Completed': completed.length,
      'Completion %': `${pct}%`
    };
  });

  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, ws1, 'Employee Summary');

  // Auto-fit column widths for summary
  const summaryColWidths = Object.keys(summaryRows[0] || {}).map(k => ({ wch: Math.max(k.length, 20) }));
  ws1['!cols'] = summaryColWidths;

  // Sheet 2: Task Details
  const taskRows = profiles.flatMap(p => {
    const assigned = tasks.filter(t => getTaskAssigneeIds(t).includes(p.id));
    return assigned.map(t => ({
      'Employee': p.full_name,
      'Email': p.email,
      'Role': p.role,
      'Task': t.title || 'Untitled',
      'Status': t.status || 'No status',
      'Priority': t.priority || '-',
      'Category': t.category || '-',
      'Deadline': t.end_date ? formatDateTime(t.end_date) : '-',
      'Completed': isCompleted(t) ? 'Yes' : 'No'
    }));
  });

  const ws2 = XLSX.utils.json_to_sheet(taskRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'Task Details');

  const taskColWidths = Object.keys(taskRows[0] || {}).map(k => ({ wch: Math.max(k.length, 25) }));
  ws2['!cols'] = taskColWidths;

  XLSX.writeFile(wb, 'employee_summary.xlsx');
}
