import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
// @deno-types="npm:@types/nodemailer@6.4.17"
import nodemailer from 'npm:nodemailer@6.9.16';

type SupabaseClient = ReturnType<typeof createClient>;
type ErrorLike = { message?: string; name?: string; code?: string };

const asError = (error: unknown): ErrorLike => (
  typeof error === 'object' && error !== null ? error as ErrorLike : {}
);

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
  recipient_ids?: string[];
  assigned_by_id?: string;
  notification_type?: 'reminder' | 'assignment';
  manual_reminder?: boolean;
  deadline_digest_recipient_id?: string;
  process_due_reminders?: boolean;
  process_due_recurring_tasks?: boolean;
  send_report?: boolean;
  process_due_schedules?: boolean;
};

type TaskRecord = {
  id: string;
  created_at: string;
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
  recurrence_timezone: string | null;
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
  messageId?: string;
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

const consumeRateLimit = async (
  supabase: SupabaseClient,
  actorId: string,
  action: string,
  maxAttempts: number
) => {
  const { data, error } = await supabase.rpc('consume_api_rate_limit', {
    actor_id: actorId,
    action_key: action,
    max_attempts: maxAttempts,
    window_seconds: 3600
  });
  if (error) throw new Error('Unable to verify the request rate.');
  return data === true;
};

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

const getSupabaseErrorMessage = (label: string, error: unknown) => (
  error ? `${label}: ${asError(error).message || 'Unknown database error'}` : null
);

const getAssigneeIds = (task: TaskRecord) => (
  task.assignee_ids?.length
    ? task.assignee_ids
    : (task.assignee_id ? [task.assignee_id] : [])
);

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
    parent_task_id: template.id,
    recurrence_key: occurrenceAt.toISOString()
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
    })),
    messageId: message.messageId
  });

  return { messageId: info.messageId };
};

const sendReminderEmail = async ({
  supabase,
  appUrl,
  task,
  recipientId
}: {
  supabase: SupabaseClient;
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

  const profileRecipients = (recipients || []) as Pick<ProfileRecord, 'id' | 'email' | 'full_name'>[];
  const emailableRecipients = profileRecipients.filter(recipient => recipient.email);
  if (emailableRecipients.length === 0) {
    throw new Error('Recipients do not have email addresses.');
  }

  const deadline = formatDate(task.end_date);
  const subject = task.is_self_task
    ? `Private task reminder: ${task.title}`
    : `Task reminder: ${task.title}`;
  const assignmentLabel = task.is_self_task ? 'private task' : 'assigned task';
  const results = await Promise.allSettled(emailableRecipients.map(async recipient => {
    const recipientName = recipient.full_name || 'there';
    const text = [
      `Hello ${recipientName},`,
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
        <p>Hello ${escapeHtml(recipientName)},</p>
        <p>This is a reminder about the following ${assignmentLabel}:</p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin-top: 0;"><strong>Task:</strong> ${escapeHtml(task.title)}</p>
          <p><strong>Deadline:</strong> ${escapeHtml(deadline)}</p>
          <p><strong>Status:</strong> ${escapeHtml(task.status)}</p>
          <p><strong>Category:</strong> ${escapeHtml(task.category || 'General')}</p>
          <p style="margin-bottom: 0;"><strong>Description:</strong> ${escapeHtml(task.description || 'No additional details.')}</p>
        </div>
        <p><a href="${escapeHtml(appUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #4b46d8; color: #ffffff; font-weight: 700; text-decoration: none;">Open Tasky</a></p>
        <p>Best regards,<br />El Meraki Ops</p>
      </div>
    `;
    const reminderKey = task.reminder_at || task.end_date || task.created_at;
    const result = await sendSmtpMail({
      to: [recipient.email],
      subject,
      text,
      html,
      messageId: `<task-${task.id}-${recipient.id}-${encodeURIComponent(reminderKey)}@elmeraki.local>`
    });
    return { email: recipient.email, messageId: result.messageId };
  }));

  const sent = results
    .filter((result): result is PromiseFulfilledResult<{ email: string; messageId: string }> => (
      result.status === 'fulfilled'
    ))
    .map(result => result.value);
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length > 0) {
    throw new Error(`Could not send ${failed.length} of ${results.length} reminder emails.`);
  }

  return { recipients: sent.map(result => result.email), messageIds: sent.map(result => result.messageId) };
};

type StatusRecord = {
  name: string;
  is_completed: boolean;
};

const escapeCsv = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const rowsToCsv = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => headers.map(header => escapeCsv(row[header])).join(','))
  ].join('\r\n');
};

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const sendAssignmentEmails = async ({
  supabase,
  appUrl,
  task,
  assignedById,
  recipientIds
}: {
  supabase: SupabaseClient;
  appUrl: string;
  task: TaskRecord;
  assignedById: string;
  recipientIds?: string[];
}) => {
  const assigneeIds = getAssigneeIds(task);
  const requestedRecipientIds = recipientIds?.length
    ? [...new Set(recipientIds)]
    : assigneeIds;

  if (requestedRecipientIds.length === 0) {
    throw new Error('Task has no assignment recipient.');
  }

  if (requestedRecipientIds.some(id => !assigneeIds.includes(id))) {
    throw new Error('An assignment recipient is not assigned to this task.');
  }

  const [{ data: recipients, error: recipientsError }, { data: assignedBy }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', requestedRecipientIds),
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', assignedById)
      .maybeSingle()
  ]);

  if (recipientsError) {
    throw new Error(`Unable to load assignment recipients: ${recipientsError.message}`);
  }

  const profileRecipients = (recipients || []) as Pick<ProfileRecord, 'id' | 'email' | 'full_name'>[];
  const emailableRecipients = profileRecipients.filter(recipient => recipient.email);
  if (emailableRecipients.length === 0) {
    throw new Error('Assignment recipients do not have email addresses.');
  }
  if (emailableRecipients.length !== requestedRecipientIds.length) {
    throw new Error('One or more assignment recipients do not have email addresses.');
  }

  const assignedByName = assignedBy?.full_name || assignedBy?.email || 'an administrator';
  const subject = `New task assigned: ${task.title}`;
  const details = [
    `Task: ${task.title}`,
    `Description: ${task.description || 'No additional details.'}`,
    `Priority: ${task.priority || 'Not specified'}`,
    `Status: ${task.status}`,
    `Category: ${task.category || 'General'}`,
    `Start date: ${formatDate(task.start_date)}`,
    `Deadline: ${formatDate(task.end_date)}`,
    `Assigned by: ${assignedByName}`
  ];

  const results = await Promise.allSettled(emailableRecipients.map(async recipient => {
    const recipientName = recipient.full_name || 'there';
    const text = [
      `Hello ${recipientName},`,
      '',
      'A new task has been assigned to you.',
      '',
      ...details,
      '',
      `Open the Tasky workspace: ${appUrl}`,
      '',
      'Best regards,',
      'El Meraki Ops'
    ].join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <p style="margin: 0 0 8px; color: #4b46d8; font-size: 13px; font-weight: 700; text-transform: uppercase;">New task assignment</p>
        <h2 style="margin: 0 0 16px;">${escapeHtml(task.title)}</h2>
        <p>Hello ${escapeHtml(recipientName)},</p>
        <p><strong>${escapeHtml(assignedByName)}</strong> assigned a new task to you.</p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin-top: 0;"><strong>Task:</strong> ${escapeHtml(task.title)}</p>
          <p><strong>Description:</strong> ${escapeHtml(task.description || 'No additional details.')}</p>
          <p><strong>Priority:</strong> ${escapeHtml(task.priority || 'Not specified')}</p>
          <p><strong>Status:</strong> ${escapeHtml(task.status)}</p>
          <p><strong>Category:</strong> ${escapeHtml(task.category || 'General')}</p>
          <p><strong>Start date:</strong> ${escapeHtml(formatDate(task.start_date))}</p>
          <p style="margin-bottom: 0;"><strong>Deadline:</strong> ${escapeHtml(formatDate(task.end_date))}</p>
        </div>
        <p><a href="${escapeHtml(appUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #4b46d8; color: #ffffff; font-weight: 700; text-decoration: none;">Open Tasky</a></p>
        <p>Best regards,<br />El Meraki Ops</p>
      </div>
    `;

    const result = await sendSmtpMail({
      to: [recipient.email],
      subject,
      text,
      html
    });

    return { email: recipient.email, messageId: result.messageId };
  }));

  const sent = results
    .filter((result): result is PromiseFulfilledResult<{ email: string; messageId: string }> => (
      result.status === 'fulfilled'
    ))
    .map(result => result.value);
  const failed = results.filter(result => result.status === 'rejected');

  if (failed.length > 0) {
    throw new Error(`Could not send ${failed.length} of ${results.length} assignment emails.`);
  }

  return { recipients: sent.map(result => result.email), messageIds: sent.map(result => result.messageId) };
};

const sendDeadlineDigest = async (
  supabase: SupabaseClient,
  appUrl: string,
  recipientId: string
) => {
  const [
    { data: recipient, error: recipientError },
    { data: tasks, error: tasksError },
    { data: completedStatuses, error: statusesError }
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', recipientId)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select('id, title, assignee_id, assignee_ids, status, priority, category, end_date, is_self_task, is_recurring, parent_task_id')
      .is('deleted_at', null)
      .eq('is_self_task', false)
      .gt('end_date', new Date().toISOString())
      .order('end_date', { ascending: true }),
    supabase.from('statuses').select('name').eq('is_completed', true)
  ]);

  if (recipientError || !recipient?.email) {
    throw new Error('The selected employee does not have an email address.');
  }
  if (tasksError) throw new Error(`Unable to load employee deadlines: ${tasksError.message}`);
  if (statusesError) throw new Error(`Unable to load completed statuses: ${statusesError.message}`);

  const completedNames = new Set((completedStatuses || []).map((status: { name: string }) => status.name));
  const assignedTasks = (tasks || []).filter((task: TaskRecord) => (
    getAssigneeIds(task).includes(recipientId)
    && !completedNames.has(task.status)
    && !(task.is_recurring && !task.parent_task_id)
  ));
  if (assignedTasks.length === 0) {
    throw new Error('The selected employee has no active tasks with future deadlines.');
  }

  const recipientName = recipient.full_name || 'there';
  const textRows = assignedTasks.flatMap((task: TaskRecord, index: number) => [
    `${index + 1}. ${task.title}`,
    `   Deadline: ${formatDate(task.end_date)}`,
    `   Status: ${task.status}`,
    `   Priority: ${task.priority || 'Not specified'}`,
    `   Category: ${task.category || 'General'}`
  ]);
  const htmlRows = assignedTasks.map((task: TaskRecord) => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:10px 0;">
      <strong>${escapeHtml(task.title)}</strong>
      <div style="margin-top:6px;color:#4b5563;font-size:14px;">
        Deadline: ${escapeHtml(formatDate(task.end_date))}<br />
        Status: ${escapeHtml(task.status)} · Priority: ${escapeHtml(task.priority || 'Not specified')} ·
        Category: ${escapeHtml(task.category || 'General')}
      </div>
    </div>
  `).join('');

  const result = await sendSmtpMail({
    to: [recipient.email],
    subject: `Task deadline summary (${assignedTasks.length})`,
    text: [
      `Hello ${recipientName},`,
      '',
      `Here is your summary of ${assignedTasks.length} active task deadline${assignedTasks.length === 1 ? '' : 's'}:`,
      '',
      ...textRows,
      '',
      `Open the Tasky workspace: ${appUrl}`,
      '',
      'Best regards,',
      'El Meraki Ops'
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6;">
        <p style="color:#4b46d8;font-size:13px;font-weight:700;text-transform:uppercase;">Deadline summary</p>
        <h2>Your active task deadlines</h2>
        <p>Hello ${escapeHtml(recipientName)},</p>
        <p>Here is your summary of ${assignedTasks.length} active task deadline${assignedTasks.length === 1 ? '' : 's'}.</p>
        ${htmlRows}
        <p><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#4b46d8;color:#fff;font-weight:700;text-decoration:none;">Open Tasky</a></p>
        <p>Best regards,<br />El Meraki Ops</p>
      </div>
    `
  });

  return { recipient: recipient.email, taskCount: assignedTasks.length, messageId: result.messageId };
};

const sendReportEmail = async (supabase: SupabaseClient, appUrl: string) => {
  const [
    profilesResult,
    tasksResult,
    statusesResult,
    rolesResult
  ] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, department, job_title'),
    supabase.from('tasks').select('id, title, assignee_id, assignee_ids, creator_id, status, priority, category, end_date, is_self_task, is_recurring, parent_task_id').is('deleted_at', null),
    supabase.from('statuses').select('name, is_completed'),
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
  const tasks = ((tasksResult.data || []) as TaskRecord[]).filter(task => (
    !task.is_self_task && !(task.is_recurring && !task.parent_task_id)
  ));
  const statuses = (statusesResult.data || []) as StatusRecord[];
  const roles = (rolesResult.data || []) as UserRoleRecord[];

  if (!profiles.length) throw new Error('No profiles found.');

  const roleByUserId = new Map(roles.map(role => [role.user_id, role.role]));
  const adminIds = new Set(roles.filter(role => role.role === 'Admin').map(role => role.user_id));
  const adminProfiles = profiles.filter(profile => adminIds.has(profile.id) && profile.email);
  if (adminProfiles.length === 0) throw new Error('No admin email addresses found.');

  const isCompleted = (task: TaskRecord) => (
    statuses.some(status => status.name === task.status && status.is_completed)
  );

  const summaryRows = profiles.map((profile) => {
    const assigned = tasks.filter(task => getAssigneeIds(task).includes(profile.id));
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
    const assigned = tasks.filter(task => getAssigneeIds(task).includes(profile.id));
    return assigned.map(task => ({
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

  const csv = [rowsToCsv(summaryRows), '', rowsToCsv(taskRows)].join('\r\n');
  const base64 = toBase64(`\uFEFF${csv}`);

  const now = new Date().toISOString().slice(0, 10);
  const adminEmails = [
    ...new Set(adminProfiles.map(profile => profile.email).filter((email): email is string => Boolean(email)))
  ];

  const sendToAdmins = async (recipients: string[]) => {
    const results = await Promise.all(recipients.map(recipient => sendSmtpMail({
      to: [recipient],
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
        filename: `employee_summary_${now}.csv`,
        content: base64,
        encoding: 'base64',
        contentType: 'text/csv; charset=utf-8'
      }]
    })));

    return results;
  };

  try {
    const results = await sendToAdmins(adminEmails);
    return { recipientCount: adminEmails.length, messageIds: results.map(result => result.messageId) };
  } catch (error: unknown) {
    const providerMessage = asError(error).message || 'Unknown';
    throw new Error(`Mail provider rejected the report: ${providerMessage}`);
  }
};

const processDueRecurringTasks = async (supabase: SupabaseClient) => {
  const { data: defaultStatusRow } = await supabase
    .from('statuses')
    .select('name')
    .eq('is_completed', false)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  const defaultStatus = defaultStatusRow?.name || 'To Do';

  const { data: dueTemplates, error: templatesError } = await supabase
    .rpc('claim_due_recurring_tasks', { batch_size: 50 });

  if (templatesError) {
    throw new Error(`Unable to load due recurring tasks: ${templatesError.message}`);
  }

  let created = 0;
  const failures: { task_id: string; error: string }[] = [];

  for (const template of (dueTemplates || []) as TaskRecord[]) {
    try {
      if (!template.recurrence_type || !template.next_recurrence_at) continue;

      const occurrenceAt = new Date(template.next_recurrence_at);
      if (Number.isNaN(occurrenceAt.getTime())) {
        throw new Error('Template has an invalid next recurrence date.');
      }

      const { data: nextRecurrence, error: recurrenceError } = await supabase
        .rpc('compute_next_task_recurrence', {
          recurrence_type: template.recurrence_type,
          recurrence_time: template.recurrence_time || '09:00',
          recurrence_day: template.recurrence_type === 'daily' ? null : template.recurrence_day,
          recurrence_timezone: template.recurrence_timezone || 'Africa/Cairo',
          after: template.next_recurrence_at
        });
      if (recurrenceError || !nextRecurrence) {
        throw recurrenceError || new Error('Could not calculate the following recurrence.');
      }

      const occurrence = buildRecurringTaskOccurrence(template, occurrenceAt, defaultStatus);
      const { error: insertError } = await supabase
        .from('tasks')
        .insert([occurrence]);

      if (insertError && insertError.code !== '23505') {
        throw insertError;
      }

      const { error: completeError } = await supabase.rpc('complete_recurring_task_claim', {
        template_id: template.id,
        claimed_occurrence_at: template.next_recurrence_at,
        following_recurrence_at: nextRecurrence
      });
      if (completeError) throw completeError;

      created += 1;

    } catch (error: unknown) {
      await supabase.rpc('release_recurring_task_claim', { template_id: template.id });
      failures.push({ task_id: template.id, error: asError(error).message || 'Unknown error' });
    }
  }

  return {
    success: failures.length === 0,
    claimed: dueTemplates?.length || 0,
    created,
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

  if (payload.notification_type === 'assignment' && req.headers.get('x-cron-secret')) {
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return jsonResponse({ error: 'Invalid cron secret.' }, 401);
    }
    if (!payload.task_id) return jsonResponse({ error: 'task_id is required.' }, 400);

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(
        'id, title, description, assignee_id, assignee_ids, creator_id, status, priority, category, ' +
        'start_date, end_date, is_self_task'
      )
      .eq('id', payload.task_id)
      .maybeSingle();

    if (taskError || !task) return jsonResponse({ error: 'Task not found.' }, 404);
    if (task.is_self_task) return jsonResponse({ success: true, recipients: [] });

    try {
      const result = await sendAssignmentEmails({
        supabase,
        appUrl,
        task: task as TaskRecord,
        assignedById: payload.assigned_by_id || task.creator_id,
        recipientIds: payload.recipient_ids
      });
      return jsonResponse({
        success: true,
        provider: 'smtp',
        notification_type: 'assignment',
        task_id: task.id,
        recipients: result.recipients,
        message_ids: result.messageIds
      });
    } catch (error: unknown) {
      return jsonResponse({ error: asError(error).message || 'Unable to send assignment email.' }, 502);
    }
  }

  if (payload.process_due_recurring_tasks) {
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return jsonResponse({ error: 'Invalid cron secret.' }, 401);
    }

    try {
      return jsonResponse(await processDueRecurringTasks(supabase));
    } catch (error: unknown) {
      return jsonResponse({ error: asError(error).message || 'Unable to process recurring tasks.' }, 500);
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
        const { error: markError } = await supabase
          .from('tasks')
          .update({
            reminder_sent_at: new Date().toISOString(),
            reminder_claimed_at: null
          })
          .eq('id', task.id);

        if (markError) {
          failures.push({
            task_id: task.id,
            error: `Email sent, but delivery could not be recorded: ${markError.message}`
          });
          continue;
        }

        sent += 1;
      } catch (error: unknown) {
        const { error: releaseError } = await supabase
          .from('tasks')
          .update({ reminder_claimed_at: null })
          .eq('id', task.id);
        failures.push({
          task_id: task.id,
          error: [
            asError(error).message || 'Unknown error',
            releaseError ? `Claim release failed: ${releaseError.message}` : null
          ].filter(Boolean).join('; ')
        });
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
        const { error: completeError } = await supabase.rpc('complete_report_schedule_claim', {
          schedule_id: schedule.id,
          delivery_succeeded: true
        });
        if (completeError) throw completeError;
        sent += 1;
      } catch (error: unknown) {
        await supabase.rpc('complete_report_schedule_claim', {
          schedule_id: schedule.id,
          delivery_succeeded: false
        });
        failures.push({ schedule_id: schedule.id, error: asError(error).message || 'Unknown error' });
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
      if (!await consumeRateLimit(supabase, authUser.user.id, 'send-report', 5)) {
        return jsonResponse({ error: 'Report sending limit reached. Try again later.' }, 429);
      }
    } catch (error: unknown) {
      return jsonResponse({ error: asError(error).message }, 503);
    }

    try {
      const result = await sendReportEmail(supabase, appUrl);
      return jsonResponse({ success: true, ...result });
    } catch (error: unknown) {
      const details = asError(error);
      return jsonResponse({
        error: details.message || 'Unable to send report.',
        details: { name: details.name || 'Error' }
      }, 502);
    }
  }

  if (payload.deadline_digest_recipient_id) {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!jwt) return jsonResponse({ error: 'Missing authorization token.' }, 401);

    const { data: authUser, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authUser.user) return jsonResponse({ error: 'Invalid authorization token.' }, 401);

    const { data: requesterRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.user.id)
      .maybeSingle();
    if (requesterRole?.role !== 'Admin') {
      return jsonResponse({ error: 'Only admins can send deadline digests.' }, 403);
    }

    try {
      if (!await consumeRateLimit(supabase, authUser.user.id, 'deadline-digest', 20)) {
        return jsonResponse({ error: 'Deadline digest limit reached. Try again later.' }, 429);
      }
    } catch (error: unknown) {
      return jsonResponse({ error: asError(error).message }, 503);
    }

    try {
      const result = await sendDeadlineDigest(supabase, appUrl, payload.deadline_digest_recipient_id);
      return jsonResponse({ success: true, ...result });
    } catch (error: unknown) {
      return jsonResponse({ error: asError(error).message || 'Unable to send deadline digest.' }, 502);
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
      .select(
        'id, created_at, title, description, assignee_id, assignee_ids, creator_id, status, priority, ' +
        'category, start_date, end_date, reminder_at, parent_task_id, is_self_task'
      )
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

  if (payload.notification_type === 'assignment' && !isAdmin && !isTaskCreator) {
    return jsonResponse({ error: 'Only an admin or the task creator can send assignment emails.' }, 403);
  }

  try {
    const action = payload.notification_type === 'assignment' ? 'manual-assignment' : 'manual-reminder';
    if (!await consumeRateLimit(supabase, authUser.user.id, action, 30)) {
      return jsonResponse({ error: 'Email sending limit reached. Try again later.' }, 429);
    }
  } catch (error: unknown) {
    return jsonResponse({ error: asError(error).message }, 503);
  }

  const isFreshRecurringOccurrence = Boolean(
    task.parent_task_id &&
    !task.reminder_at &&
    Date.now() - new Date(task.created_at).getTime() < 10 * 60 * 1000
  );
  if (!payload.manual_reminder && isFreshRecurringOccurrence) {
    return jsonResponse({
      success: true,
      suppressed: true,
      reason: 'Assignment notification already queued for this recurring occurrence.'
    });
  }

  try {
    if (payload.notification_type === 'assignment') {
      const result = await sendAssignmentEmails({
        supabase,
        appUrl,
        task: task as TaskRecord,
        assignedById: authUser.user.id,
        recipientIds: payload.recipient_ids
      });

      return jsonResponse({
        success: true,
        provider: 'smtp',
        notification_type: 'assignment',
        task_id: task.id,
        recipients: result.recipients,
        message_ids: result.messageIds
      });
    }

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
      message_ids: result.messageIds
    });
  } catch (error: unknown) {
    return jsonResponse({ error: asError(error).message || 'Unable to send reminder email.' }, 502);
  }
});
