import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type ReminderRequest = {
  task_id?: string;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const mailFrom = Deno.env.get('MAIL_FROM') || 'El Meraki Ops <onboarding@resend.dev>';
  const appUrl = Deno.env.get('APP_URL') || 'https://xemslalhsxdqgzyfdtqf.supabase.co';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase function secrets are not configured.' }, 500);
  }

  if (!resendApiKey) {
    return jsonResponse({ error: 'RESEND_API_KEY is not configured.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '');

  if (!jwt) {
    return jsonResponse({ error: 'Missing authorization token.' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { data: authUser, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !authUser.user) {
    return jsonResponse({ error: 'Invalid authorization token.' }, 401);
  }

  let payload: ReminderRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  if (!payload.task_id) {
    return jsonResponse({ error: 'task_id is required.' }, 400);
  }

  const [{ data: requesterRole }, { data: task, error: taskError }] = await Promise.all([
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.user.id)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select('id, title, description, assignee_id, creator_id, status, category, end_date, is_self_task')
      .eq('id', payload.task_id)
      .maybeSingle()
  ]);

  if (taskError || !task) {
    return jsonResponse({ error: 'Task not found.' }, 404);
  }

  if (!task.assignee_id) {
    return jsonResponse({ error: 'Task has no assignee.' }, 400);
  }

  if (!task.end_date) {
    return jsonResponse({ error: 'Task has no deadline.' }, 400);
  }

  const isAdmin = requesterRole?.role === 'Admin';
  const isTaskCreator = task.creator_id === authUser.user.id;
  const isTaskAssignee = task.assignee_id === authUser.user.id;

  if (!isAdmin && !isTaskCreator && !isTaskAssignee) {
    return jsonResponse({ error: 'You do not have permission to send this reminder.' }, 403);
  }

  const { data: assignee } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', task.assignee_id)
    .maybeSingle();

  if (!assignee?.email) {
    return jsonResponse({ error: 'Assignee does not have an email address.' }, 400);
  }

  const deadline = formatDate(task.end_date);
  const subject = `Task reminder: ${task.title}`;
  const assigneeName = escapeHtml(assignee.full_name || 'there');
  const taskTitle = escapeHtml(task.title);
  const taskStatus = escapeHtml(task.status);
  const taskCategory = escapeHtml(task.category || 'General');
  const taskDescription = escapeHtml(task.description || 'No additional details.');
  const appLink = escapeHtml(appUrl);
  const text = [
    `Hello ${assignee.full_name || 'there'},`,
    '',
    'This is a reminder for your assigned task:',
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
      <p>Hello ${assigneeName},</p>
      <p>This is a reminder for your assigned task:</p>
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Task:</strong> ${taskTitle}</p>
        <p><strong>Deadline:</strong> ${deadline}</p>
        <p><strong>Status:</strong> ${taskStatus}</p>
        <p><strong>Category:</strong> ${taskCategory}</p>
        <p><strong>Description:</strong> ${taskDescription}</p>
      </div>
      <p><a href="${appLink}" style="color: #4b46d8;">Open the Tasky workspace</a></p>
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
      to: assignee.email,
      subject,
      text,
      html
    })
  });

  const resendBody = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    return jsonResponse({
      error: 'Mail provider rejected the reminder email.',
      details: resendBody
    }, 502);
  }

  return jsonResponse({
    success: true,
    provider: 'resend',
    task_id: task.id,
    recipient: assignee.email,
    message_id: resendBody.id
  });
});
