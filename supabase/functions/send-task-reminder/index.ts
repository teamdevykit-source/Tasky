import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
import * as XLSX from 'npm:xlsx@0.18.5';
// @deno-types="npm:@types/nodemailer@6.4.17"
import nodemailer from 'npm:nodemailer@6.9.16';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const DEFAULT_APP_URL = 'https://tasky-tko5.vercel.app/';

const normalizeAppUrl = (value?: string) => {
  try {
    const url = new URL(value || DEFAULT_APP_URL);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return DEFAULT_APP_URL;
  }
};

type ReminderRequest = {
  task_id?: string;
  recipient_id?: string;
  process_due_reminders?: boolean;
  process_due_recurring_tasks?: boolean;
  send_report?: boolean;
  process_due_schedules?: boolean;
};

type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_ids: string[] | null;
  creator_id: string;
  status: string;
  priority: 'High' | 'Medium' | 'Low' | null;
  category: string | null;
  observers: string[] | null;
  start_date: string | null;
  end_date: string | null;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  is_self_task: boolean;
  is_recurring: boolean;
  recurrence_type: 'daily' | 'weekly' | 'monthly' | null;
  recurrence_time: string | null;
  recurrence_day: number | null;
  next_recurrence_at: string | null;
  parent_task_id: string | null;
};

type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  department: string | null;
  job_title: string | null;
};

type UserRoleRecord = {
  user_id: string;
  role: 'Admin' | 'Worker';
};

type MailAttachment = {
  filename: string;
  content: string;
  encoding?: 'base64';
  contentType?: string;
};

type MailMessage = {
  from?: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
};

const jsonResponse = (body: unknown, status = 200) => (
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
);

const formatDate = (value: string | null) => {
  if (!value) return 'No deadline set';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const escapeHtml = (value: string | null | undefined) => (
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
);

const getSupabaseErrorMessage = (label: string, error: any) => (
  error ? `${label}: ${error.message || 'Unknown database error'}` : null
);

const getAssigneeIds = (task: TaskRecord) => (
  task.assignee_ids?.length
    ? task.assignee_ids
    : (task.assignee_id ? [task.assignee_id] : [])
);

const parseRecurrenceTime = (time?: string | null) => {
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

const computeNextRecurrenceAfter = (
  type: NonNullable<TaskRecord['recurrence_type']>,
  time?: string | null,
  day?: number | null,
  after: Date = new Date()
) => {
  const { hour, minute } = parseRecurrenceTime(time);
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

const buildRecurringTaskOccurrence = (
  template: TaskRecord,
  occurrenceAt: Date,
  defaultStatus: string
) => {
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
    reminder_sent_at: null,
    is_recurring: false,
    recurrence_type: null,
    recurrence_time: null,
    recurrence_day: null,
    next_recurrence_at: null,
    parent_task_id: template.id
  };
};

const getSmtpConfig = () => {
  const host = Deno.env.get('SMTP_HOST');
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('APP_PASSWORD');
  const from = Deno.env.get('SMTP_FROM') || Deno.env.get('MAIL_FROM') || user;
  const secureEnv = Deno.env.get('SMTP_SECURE');
  const secure = secureEnv
    ? ['1', 'true', 'yes'].includes(secureEnv.toLowerCase())
    : port === 465;

  if (!host || !port || !user || !pass || !from) {
    throw new Error(
      'SMTP mailer is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS or APP_PASSWORD, and SMTP_FROM.'
    );
  }

  return { host, port, secure, user, pass, from };
};

const sendSmtpMail = async (message: MailMessage) => {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  });

  const info = await transporter.sendMail({
    from: message.from || smtp.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments?.map(attachment => ({
      filename: attachment.filename,
      content: attachment.content,
      encoding: attachment.encoding,
      contentType: attachment.contentType
    }))
  });

  return { messageId: info.messageId };
};

const sendReminderEmail = async ({
  supabase,
  appUrl,
  task,
  recipientId
}: {
  supabase: any;
  appUrl: string;
  task: TaskRecord;
  recipientId?: string;
}) => {
  const assigneeIds = getAssigneeIds(task);
  const recipientIds = task.is_self_task
    ? [task.creator_id]
    : (recipientId ? [recipientId] : assigneeIds);

  if (recipientIds.length === 0 || recipientIds.some(id => !id)) {
    throw new Error('Task has no reminder recipient.');
  }

  if (recipientId && !task.is_self_task && !assigneeIds.includes(recipientId)) {
    throw new Error('The selected recipient is not assigned to this task.');
  }

  const { data: recipients } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', recipientIds);

  const emailableRecipients = (recipients || []).filter((recipient: any) => recipient.email);
  if (emailableRecipients.length === 0) {
    throw new Error('Recipients do not have email addresses.');
  }

  const deadline = formatDate(task.end_date);
  const subject = task.is_self_task
    ? `Private task reminder: ${task.title}`
    : `Task reminder: ${task.title}`;
  const recipientName = emailableRecipients.length === 1
    ? escapeHtml(emailableRecipients[0].full_name || 'there')
    : 'team';
  const assignmentLabel = task.is_self_task ? 'private task' : 'assigned task';
  const text = [
    `Hello ${emailableRecipients.length === 1 ? emailableRecipients[0].full_name || 'there' : 'team'},`,
    '',
    `This is a reminder for your ${assignmentLabel}:`,
    '',
    `Task: ${task.title}`,
    `Deadline: ${deadline}`,
    `Status: ${task.status}`,
    `Category: ${task.category || 'General'}`,
    '',
    task.description ? `Description: ${task.description}` : 'Description: No additional details.',
    '',
    `Open the Tasky workspace: ${appUrl}`,
    '',
    'Best regards,',
    'El Meraki Ops'
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <p style="margin: 0 0 8px; color: #4b46d8; font-size: 13px; font-weight: 700; text-transform: uppercase;">Task reminder</p>
      <h2 style="margin: 0 0 16px;">${escapeHtml(task.title)}</h2>
      <p>Hello ${recipientName},</p>
      <p>This is a reminder about the following ${assignmentLabel}:</p>
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin-top: 0;"><strong>Task:</strong> ${escapeHtml(task.title)}</p>
        <p><strong>Deadline:</strong> ${deadline}</p>
        <p><strong>Status:</strong> ${escapeHtml(task.status)}</p>
        <p><strong>Category:</strong> ${escapeHtml(task.category || 'General')}</p>
        <p style="margin-bottom: 0;"><strong>Description:</strong> ${escapeHtml(task.description || 'No additional details.')}</p>
      </div>
      <p><a href="${escapeHtml(appUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #4b46d8; color: #ffffff; font-weight: 700; text-decoration: none;">Open Tasky</a></p>
      <p>Best regards,<br />El Meraki Ops</p>
    </div>
  `;

  try {
    const result = await sendSmtpMail({
      to: emailableRecipients.map((recipient: any) => recipient.email),
      subject,
      text,
      html
    });

    return {
      recipients: emailableRecipients.map((recipient: any) => recipient.email),
      messageId: result.messageId
    };
  } catch (error: any) {
    const providerMessage = error.message || 'Unknown provider error';
    throw new Error(`Mail provider rejected the reminder email: ${providerMessage}`);
  }
};

const sendReportEmail = async (supabase: any, appUrl: string) => {
  const [
    profilesResult,
    tasksResult,
    statusesResult,
    rolesResult
  ] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, department, job_title'),
    supabase.from('tasks').select('id, title, assignee_id, assignee_ids, creator_id, status, priority, category, end_date, is_self_task').is('deleted_at', null),
    supabase.from('statuses').select('name, sort_order'),
    supabase.from('user_roles').select('user_id, role')
  ]);

  const queryErrors = [
    getSupabaseErrorMessage('Could not load profiles for report', profilesResult.error),
    getSupabaseErrorMessage('Could not load tasks for report', tasksResult.error),
    getSupabaseErrorMessage('Could not load statuses for report', statusesResult.error),
    getSupabaseErrorMessage('Could not load roles for report', rolesResult.error)
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    throw new Error(queryErrors.join('; '));
  }

  const profiles = (profilesResult.data || []) as ProfileRecord[];
  const tasks = ((tasksResult.data || []) as any[]).filter(task => !task.is_self_task);
  const statuses = statusesResult.data || [];
  const roles = (rolesResult.data || []) as UserRoleRecord[];

  if (!profiles.length) throw new Error('No profiles found.');

  const roleByUserId = new Map(roles.map(role => [role.user_id, role.role]));
  const adminIds = new Set(roles.filter(role => role.role === 'Admin').map(role => role.user_id));
  const adminProfiles = profiles.filter(profile => adminIds.has(profile.id) && profile.email);
  if (adminProfiles.length === 0) throw new Error('No admin email addresses found.');

  const maxSort = statuses.length > 0 ? Math.max(...statuses.map((s: any) => s.sort_order || 0)) : 0;
  const isCompleted = (task: any) => {
    if (statuses.length === 0) {
      return ['done', 'completed'].includes(String(task.status || '').toLowerCase());
    }

    const status = statuses.find((s: any) => s.name === task.status);
    return !!status && (status.sort_order || 0) === maxSort;
  };
  const getAssigneeIds = (task: any) => (
    task.assignee_ids?.length ? task.assignee_ids : (task.assignee_id ? [task.assignee_id] : [])
  );

  const summaryRows = profiles.map((profile) => {
    const assigned = tasks.filter((task: any) => getAssigneeIds(task).includes(profile.id));
    const completed = assigned.filter(isCompleted);
    const pct = assigned.length > 0 ? Math.round((completed.length / assigned.length) * 100) : 0;
    return {
      'Employee': profile.full_name || profile.email || 'Unknown',
      'Email': profile.email || '-',
      'Role': roleByUserId.get(profile.id) || 'Worker',
      'Department': profile.department || '-',
      'Job Title': profile.job_title || '-',
      'Total Tasks': assigned.length,
      'Completed': completed.length,
      'Completion %': `${pct}%`
    };
  });

  const taskRows = profiles.flatMap((profile) => {
    const assigned = tasks.filter((task: any) => getAssigneeIds(task).includes(profile.id));
    return assigned.map((task: any) => ({
      'Employee': profile.full_name || profile.email || 'Unknown',
      'Email': profile.email || '-',
      'Role': roleByUserId.get(profile.id) || 'Worker',
      'Task': task.title || 'Untitled',
      'Status': task.status || 'No status',
      'Priority': task.priority || '-',
      'Category': task.category || '-',
      'Deadline': task.end_date ? formatDate(task.end_date) : '-',
      'Completed': isCompleted(task) ? 'Yes' : 'No'
    }));
  });

  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = Object.keys(summaryRows[0] || {}).map(key => ({ wch: Math.max(key.length, 20) }));
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Employee Summary');

  const taskSheet = XLSX.utils.json_to_sheet(taskRows);
  taskSheet['!cols'] = Object.keys(taskRows[0] || {}).map(key => ({ wch: Math.max(key.length, 25) }));
  XLSX.utils.book_append_sheet(wb, taskSheet, 'Task Details');

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const now = new Date().toISOString().slice(0, 10);
  const adminEmails = [
    ...new Set(adminProfiles.map(profile => profile.email).filter((email): email is string => Boolean(email)))
  ];

  const sendToAdmins = async (recipients: string[]) => {
    const result = await sendSmtpMail({
      to: recipients,
      subject: `Employee Summary Report - ${now}`,
      text: `Hello,\n\nPlease find attached the employee summary report for ${now}.\n\nGenerated by El Meraki Ops`,
      html: `<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h2>Employee Summary Report</h2>
        <p>Hello,</p>
        <p>Please find attached the employee summary report for <strong>${now}</strong>.</p>
        <p><a href="${escapeHtml(appUrl)}" style="color: #4b46d8;">Open the Tasky workspace</a></p>
        <p>Best regards,<br />El Meraki Ops</p>
      </div>`,
      attachments: [{
        filename: `employee_summary_${now}.xlsx`,
        content: base64,
        encoding: 'base64',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }]
    });

    return result;
  };

  try {
    const result = await sendToAdmins(adminEmails);
    return { recipientCount: adminEmails.length, messageId: result.messageId };
  } catch (error: any) {
    const providerMessage = error.message || 'Unknown';
    throw new Error(`Mail provider rejected the report: ${providerMessage}`);
  }
};

const processDueRecurringTasks = async (supabase: any, appUrl: string) => {
  const { data: defaultStatusRow } = await supabase
    .from('statuses')
    .select('name')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  const defaultStatus = defaultStatusRow?.name || 'To Do';

  const { data: dueTemplates, error: templatesError } = await supabase
    .from('tasks')
    .select(
      'id, title, description, assignee_id, assignee_ids, creator_id, status, priority, category, ' +
      'observers, is_self_task, start_date, end_date, reminder_at, reminder_sent_at, is_recurring, ' +
      'recurrence_type, recurrence_time, recurrence_day, next_recurrence_at, parent_task_id'
    )
    .eq('is_recurring', true)
    .is('parent_task_id', null)
    .is('deleted_at', null)
    .not('next_recurrence_at', 'is', null)
    .lte('next_recurrence_at', new Date().toISOString())
    .order('next_recurrence_at', { ascending: true })
    .limit(50);

  if (templatesError) {
    throw new Error(`Unable to load due recurring tasks: ${templatesError.message}`);
  }

  let created = 0;
  let immediateReminderEmails = 0;
  const failures: { task_id: string; error: string }[] = [];

  for (const template of (dueTemplates || []) as TaskRecord[]) {
    try {
      if (!template.recurrence_type || !template.next_recurrence_at) continue;

      const occurrenceAt = new Date(template.next_recurrence_at);
      if (Number.isNaN(occurrenceAt.getTime())) {
        throw new Error('Template has an invalid next recurrence date.');
      }

      const nextRecurrence = computeNextRecurrenceAfter(
        template.recurrence_type,
        template.recurrence_time,
        template.recurrence_type === 'daily' ? null : template.recurrence_day,
        new Date()
      ).toISOString();

      const { data: claimedTemplate, error: claimError } = await supabase
        .from('tasks')
        .update({ next_recurrence_at: nextRecurrence })
        .eq('id', template.id)
        .eq('next_recurrence_at', template.next_recurrence_at)
        .select('id')
        .maybeSingle();

      if (claimError) throw claimError;
      if (!claimedTemplate) continue;

      const occurrence = buildRecurringTaskOccurrence(template, occurrenceAt, defaultStatus);
      const { data: createdTask, error: insertError } = await supabase
        .from('tasks')
        .insert([occurrence])
        .select(
          'id, title, description, assignee_id, assignee_ids, creator_id, status, priority, category, ' +
          'observers, is_self_task, start_date, end_date, reminder_at, reminder_sent_at, is_recurring, ' +
          'recurrence_type, recurrence_time, recurrence_day, next_recurrence_at, parent_task_id'
        )
        .single();

      if (insertError) {
        await supabase
          .from('tasks')
          .update({ next_recurrence_at: template.next_recurrence_at })
          .eq('id', template.id);
        throw insertError;
      }

      created += 1;

      if (!createdTask.reminder_at) {
        await sendReminderEmail({ supabase, appUrl, task: createdTask as TaskRecord });
        immediateReminderEmails += 1;
      }
    } catch (error: any) {
      failures.push({ task_id: template.id, error: error.message || 'Unknown error' });
    }
  }

  return {
    success: failures.length === 0,
    claimed: dueTemplates?.length || 0,
    created,
    immediateReminderEmails,
    failures
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let payload: ReminderRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const appUrl = normalizeAppUrl(Deno.env.get('APP_URL'));

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase function secrets are not configured.' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  if (payload.process_due_recurring_tasks) {
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return jsonResponse({ error: 'Invalid cron secret.' }, 401);
    }

    try {
      return jsonResponse(await processDueRecurringTasks(supabase, appUrl));
    } catch (error: any) {
      return jsonResponse({ error: error.message || 'Unable to process recurring tasks.' }, 500);
    }
  }

  if (payload.process_due_reminders) {
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return jsonResponse({ error: 'Invalid cron secret.' }, 401);
    }

    const { data: dueTasks, error: claimError } = await supabase
      .rpc('claim_due_task_reminders', { batch_size: 100 });

    if (claimError) {
      return jsonResponse({ error: `Unable to claim due reminders: ${claimError.message}` }, 500);
    }

    let sent = 0;
    const failures: { task_id: string; error: string }[] = [];

    for (const task of (dueTasks || []) as TaskRecord[]) {
      try {
        await sendReminderEmail({ supabase, appUrl, task });
        await supabase
          .from('tasks')
          .update({
            reminder_sent_at: new Date().toISOString(),
            reminder_claimed_at: null
          })
          .eq('id', task.id);
        sent += 1;
      } catch (error: any) {
        await supabase
          .from('tasks')
          .update({ reminder_claimed_at: null })
          .eq('id', task.id);
        failures.push({ task_id: task.id, error: error.message || 'Unknown error' });
      }
    }

    return jsonResponse({
      success: failures.length === 0,
      claimed: dueTasks?.length || 0,
      sent,
      failures
    });
  }

  if (payload.process_due_schedules) {
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return jsonResponse({ error: 'Invalid cron secret.' }, 401);
    }

    const { data: dueSchedules, error: claimError } = await supabase
      .rpc('claim_due_report_schedules', { batch_size: 10 });

    if (claimError) {
      return jsonResponse({ error: `Unable to claim due reports: ${claimError.message}` }, 500);
    }

    if (!dueSchedules?.length) {
      return jsonResponse({ success: true, claimed: 0, sent: 0 });
    }

    let sent = 0;
    const failures: { schedule_id: string; error: string }[] = [];

    for (const schedule of dueSchedules) {
      try {
        await sendReportEmail(supabase, appUrl);
        sent += 1;
      } catch (error: any) {
        failures.push({ schedule_id: schedule.id, error: error.message || 'Unknown error' });
      }
    }

    return jsonResponse({
      success: failures.length === 0,
      claimed: dueSchedules.length,
      sent,
      failures
    });
  }

  if (payload.send_report) {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!jwt) return jsonResponse({ error: 'Missing authorization token.' }, 401);

    const { data: authUser, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authUser.user) return jsonResponse({ error: 'Invalid authorization token.' }, 401);

    const { data: requesterRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.user.id)
      .maybeSingle();

    if (requesterRole?.role !== 'Admin') return jsonResponse({ error: 'Only admins can send reports.' }, 403);

    try {
      const result = await sendReportEmail(supabase, appUrl);
      return jsonResponse({ success: true, ...result });
    } catch (error: any) {
      return jsonResponse({
        error: error.message || 'Unable to send report.',
        details: { name: error.name || 'Error' }
      }, 502);
    }
  }

  if (!payload.task_id) {
    return jsonResponse({ error: 'task_id is required.' }, 400);
  }

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!jwt) {
    return jsonResponse({ error: 'Missing authorization token.' }, 401);
  }

  const { data: authUser, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !authUser.user) {
    return jsonResponse({ error: 'Invalid authorization token.' }, 401);
  }

  const [{ data: requesterRole }, { data: task, error: taskError }] = await Promise.all([
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.user.id)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select('id, title, description, assignee_id, assignee_ids, creator_id, status, category, end_date, is_self_task')
      .eq('id', payload.task_id)
      .maybeSingle()
  ]);

  if (taskError || !task) {
    return jsonResponse({ error: 'Task not found.' }, 404);
  }

  const assigneeIds = getAssigneeIds(task as TaskRecord);
  const isAdmin = requesterRole?.role === 'Admin';
  const isTaskCreator = task.creator_id === authUser.user.id;
  const isTaskAssignee = assigneeIds.includes(authUser.user.id);

  if (!isAdmin && !isTaskCreator && !isTaskAssignee) {
    return jsonResponse({ error: 'You do not have permission to send this reminder.' }, 403);
  }

  try {
    const result = await sendReminderEmail({
      supabase,
      appUrl,
      task: task as TaskRecord,
      recipientId: payload.recipient_id
    });

    return jsonResponse({
      success: true,
      provider: 'smtp',
      task_id: task.id,
      recipients: result.recipients,
      message_id: result.messageId
    });
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Unable to send reminder email.' }, 502);
  }
});
