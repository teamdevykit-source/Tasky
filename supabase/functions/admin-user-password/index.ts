import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
// @deno-types="npm:@types/nodemailer@6.4.17"
import nodemailer from 'npm:nodemailer@6.9.16';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const DEFAULT_APP_URL = 'https://tasky-tko5.vercel.app/';
const TEMPORARY_PASSWORD = 'ElMeraki@2026';

type AdminUserRequest =
  | { action: 'invite'; email: string }
  | { action: 'reset_password'; user_id: string };

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json'
  }
});

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

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

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
    throw new Error('SMTP mailer is not configured.');
  }

  return { host, port, user, pass, from, secure };
};

const sendPasswordEmail = async (
  email: string,
  appUrl: string,
  kind: 'invitation' | 'reset'
) => {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  });
  const safeEmail = escapeHtml(email);
  const safeUrl = escapeHtml(appUrl);
  const intro = kind === 'invitation'
    ? 'You have been invited to join the El Meraki workspace.'
    : 'An administrator reset your El Meraki password.';

  await transporter.sendMail({
    from: smtp.from,
    to: email,
    subject: kind === 'invitation' ? 'Your El Meraki workspace invitation' : 'Your El Meraki password was reset',
    text: [
      intro,
      '',
      `Sign in: ${appUrl}`,
      `Email: ${email}`,
      `Temporary password: ${TEMPORARY_PASSWORD}`,
      '',
      'You will be required to choose a private password after signing in.'
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:auto">
        <h2 style="color:#2563eb">El Meraki Ops</h2>
        <p>${intro}</p>
        <div style="background:#f1f5f9;border-radius:12px;padding:18px;margin:20px 0">
          <div><strong>Email:</strong> ${safeEmail}</div>
          <div><strong>Temporary password:</strong> ${TEMPORARY_PASSWORD}</div>
        </div>
        <p><a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:11px 18px;border-radius:8px">Sign in to El Meraki</a></p>
        <p style="color:#64748b;font-size:13px">You will be required to choose a private password after signing in.</p>
      </div>
    `
  });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase function secrets are not configured.' }, 500);
  }

  const authorization = req.headers.get('Authorization') || '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt) return jsonResponse({ error: 'Missing authorization token.' }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Invalid authorization token.' }, 401);
  }

  const { data: requesterRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (requesterRole?.role !== 'Admin') {
    return jsonResponse({ error: 'Only administrators can manage user passwords.' }, 403);
  }

  let payload: AdminUserRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const appUrl = normalizeAppUrl(Deno.env.get('APP_URL'));

  if (payload.action === 'invite') {
    const email = payload.email?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return jsonResponse({ error: 'A valid email address is required.' }, 400);
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: TEMPORARY_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: email.split('@')[0],
        must_change_password: true
      }
    });

    if (error || !data.user) {
      const alreadyExists = /already|registered|exists/i.test(error?.message || '');
      return jsonResponse({
        error: alreadyExists ? 'This email already has an account.' : (error?.message || 'Unable to create user.')
      }, alreadyExists ? 409 : 400);
    }

    try {
      await sendPasswordEmail(email, appUrl, 'invitation');
    } catch (error) {
      await supabase.auth.admin.deleteUser(data.user.id);
      return jsonResponse({
        error: error instanceof Error ? error.message : 'Unable to send invitation email.'
      }, 502);
    }

    return jsonResponse({
      success: true,
      user_id: data.user.id,
      temporary_password: TEMPORARY_PASSWORD
    });
  }

  if (payload.action === 'reset_password') {
    if (!payload.user_id) return jsonResponse({ error: 'User ID is required.' }, 400);
    if (payload.user_id === authData.user.id) {
      return jsonResponse({ error: 'Use Profile Settings to change your own password.' }, 400);
    }

    const { data: targetData, error: targetError } = await supabase.auth.admin.getUserById(payload.user_id);
    if (targetError || !targetData.user?.email) {
      return jsonResponse({ error: 'User account was not found.' }, 404);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(payload.user_id, {
      password: TEMPORARY_PASSWORD,
      user_metadata: {
        ...targetData.user.user_metadata,
        must_change_password: true
      }
    });
    if (updateError) return jsonResponse({ error: updateError.message }, 400);

    let emailSent = true;
    try {
      await sendPasswordEmail(targetData.user.email, appUrl, 'reset');
    } catch (error) {
      emailSent = false;
      console.error('Password reset email failed:', error);
    }

    return jsonResponse({
      success: true,
      email_sent: emailSent,
      temporary_password: TEMPORARY_PASSWORD
    });
  }

  return jsonResponse({ error: 'Unsupported action.' }, 400);
});
