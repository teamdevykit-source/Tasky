import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type ReminderRequest = {
  task_id?: string;
  recipient_id?: string;
  process_due_reminders?: boolean;
};

type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_ids: string[] | null;
  creator_id: string;
  status: string;
  category: string | null;
  end_date: string | null;
  is_self_task: boolean;
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

const getAssigneeIds = (task: TaskRecord) => (
  task.assignee_ids?.length
    ? task.assignee_ids
    : (task.assignee_id ? [task.assignee_id] : [])
);

const sendReminderEmail = async ({
  supabase,
  resendApiKey,
  mailFrom,
  appUrl,
  task,
  recipientId
}: {
  supabase: any;
  resendApiKey: string;
  mailFrom: string;
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
      <h2 style="margin-bottom: 8px;">Task reminder</h2>
      <p>Hello ${recipientName},</p>
      <p>This is a reminder for your ${assignmentLabel}:</p>
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Task:</strong> ${escapeHtml(task.title)}</p>
        <p><strong>Deadline:</strong> ${deadline}</p>
        <p><strong>Status:</strong> ${escapeHtml(task.status)}</p>
        <p><strong>Category:</strong> ${escapeHtml(task.category || 'General')}</p>
        <p><strong>Description:</strong> ${escapeHtml(task.description || 'No additional details.')}</p>
      </div>
      <p><a href="${escapeHtml(appUrl)}" style="color: #4b46d8;">Open the Tasky workspace</a></p>
      <p>Best regards,<br />El Meraki Ops</p>
    </div>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: mailFrom,
      to: emailableRecipients.map((recipient: any) => recipient.email),
      subject,
      text,
      html
    })
  });

  const resendBody = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    const providerMessage = resendBody?.message || resendBody?.error || 'Unknown provider error';
    throw new Error(`Mail provider rejected the reminder email: ${providerMessage}`);
  }

  return {
    recipients: emailableRecipients.map((recipient: any) => recipient.email),
    messageId: resendBody.id
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
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const mailFrom = Deno.env.get('MAIL_FROM') || 'El Meraki Ops <onboarding@resend.dev>';
  const appUrl = Deno.env.get('APP_URL') || 'https://xemslalhsxdqgzyfdtqf.supabase.co';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase function secrets are not configured.' }, 500);
  }

  if (!resendApiKey) {
    return jsonResponse({ error: 'RESEND_API_KEY is not configured.' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

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
        await sendReminderEmail({ supabase, resendApiKey, mailFrom, appUrl, task });
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
      resendApiKey,
      mailFrom,
      appUrl,
      task: task as TaskRecord,
      recipientId: payload.recipient_id
    });

    return jsonResponse({
      success: true,
      provider: 'resend',
      task_id: task.id,
      recipients: result.recipients,
      message_id: result.messageId
    });
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Unable to send reminder email.' }, 502);
  }
});
