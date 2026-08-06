import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
// @deno-types="npm:@types/nodemailer@6.4.17"
import nodemailer from 'npm:nodemailer@6.9.16';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const DEFAULT_APP_URL = 'https://tasky-tko5.vercel.app/';
const createTemporaryPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const randomPart = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  return `ElM!${randomPart}9a`;
};

type AdminUserRequest =
  | { action: 'invite'; email: string }
  | { action: 'reset_password'; user_id: string };

type MailDelivery = {
  provider: 'smtp';
  messageId: string | null;
};

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

const sendSmtpEmail = async (
  email: string,
  subject: string,
  text: string,
  html: string
): Promise<MailDelivery> => {
  const smtp = getSmtpConfig();
  const isGmail = /(^|\.)gmail\.com$/i.test(smtp.host);
  const alignedFrom = isGmail && smtp.user.includes('@')
    ? { name: 'El Meraki Ops', address: smtp.user }
    : smtp.from;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  });
  const info = await transporter.sendMail({
    from: alignedFrom,
    replyTo: isGmail && smtp.user.includes('@') ? smtp.user : undefined,
    to: email,
    subject,
    text,
    html
  });
  const accepted = (info.accepted || []).map(address => String(address).toLowerCase());
  if (!accepted.includes(email.toLowerCase())) {
    const rejected = (info.rejected || []).map(address => String(address)).join(', ');
    throw new Error(rejected ? `SMTP rejected the recipient: ${rejected}` : 'SMTP did not accept the recipient.');
  }

  console.log(`SMTP accepted the message; response: ${info.response || 'unavailable'}`);
  return { provider: 'smtp', messageId: info.messageId || null };
};

const sendPasswordEmail = async (
  email: string,
  appUrl: string,
  kind: 'invitation' | 'reset',
  temporaryPassword: string
) => {
  const safeEmail = escapeHtml(email);
  const safeUrl = escapeHtml(appUrl);
  const intro = kind === 'invitation'
    ? 'You have been invited to join the El Meraki workspace.'
    : 'An administrator reset your El Meraki password.';
  const subject = kind === 'invitation'
    ? 'Your El Meraki workspace invitation'
    : 'Your El Meraki password was reset';
  const text = [
    intro,
    '',
    `Sign in: ${appUrl}`,
    `Email: ${email}`,
    `Temporary password: ${temporaryPassword}`,
    '',
    'You will be required to choose a private password after signing in.'
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:auto">
      <h2 style="color:#2563eb">El Meraki Ops</h2>
      <p>${intro}</p>
      <div style="background:#f1f5f9;border-radius:12px;padding:18px;margin:20px 0">
        <div><strong>Email:</strong> ${safeEmail}</div>
        <div><strong>Temporary password:</strong> ${escapeHtml(temporaryPassword)}</div>
      </div>
      <p><a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:11px 18px;border-radius:8px">Sign in to El Meraki</a></p>
      <p style="color:#64748b;font-size:13px">You will be required to choose a private password after signing in.</p>
    </div>
  `;

  return sendSmtpEmail(email, subject, text, html);
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
  const { data: rateAllowed, error: rateError } = await supabase.rpc('consume_api_rate_limit', {
    actor_id: authData.user.id,
    action_key: `admin-password:${payload.action}`,
    max_attempts: 20,
    window_seconds: 3600
  });
  if (rateError) return jsonResponse({ error: 'Unable to verify the request rate.' }, 503);
  if (!rateAllowed) return jsonResponse({ error: 'Too many requests. Try again later.' }, 429);

  if (payload.action === 'invite') {
    const email = payload.email?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return jsonResponse({ error: 'A valid email address is required.' }, 400);
    }

    const temporaryPassword = createTemporaryPassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: email.split('@')[0],
        must_change_password: true
      }
    });

    const alreadyExists = /already|registered|exists/i.test(error?.message || '');
    let invitedUserId = data.user?.id || null;
    let resent = false;

    if (alreadyExists) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      const existingUser = profile?.id
        ? await supabase.auth.admin.getUserById(profile.id)
        : null;
      const canResend = existingUser?.data.user?.email?.toLowerCase() === email
        && existingUser.data.user.user_metadata?.must_change_password === true;

      if (!canResend) {
        return jsonResponse({ error: 'This email already has an active account.' }, 409);
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
        password: temporaryPassword
      });
      if (updateError) return jsonResponse({ error: updateError.message }, 400);

      invitedUserId = profile.id;
      resent = true;
    } else if (error || !invitedUserId) {
      return jsonResponse({ error: error?.message || 'Unable to create user.' }, 400);
    }

    try {
      const delivery = await sendPasswordEmail(email, appUrl, 'invitation', temporaryPassword);
      console.log(`Invitation queued via ${delivery.provider}; message id: ${delivery.messageId || 'unavailable'}`);
      return jsonResponse({
        success: true,
        user_id: invitedUserId,
        resent,
        email_provider: delivery.provider,
        message_id: delivery.messageId,
        temporary_password: temporaryPassword
      });
    } catch (error) {
      if (!resent && invitedUserId) await supabase.auth.admin.deleteUser(invitedUserId);
      return jsonResponse({
        error: error instanceof Error ? error.message : 'Unable to send invitation email.',
        account_preserved: resent
      }, 502);
    }
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

    const temporaryPassword = createTemporaryPassword();
    const { error: updateError } = await supabase.auth.admin.updateUserById(payload.user_id, {
      password: temporaryPassword,
      user_metadata: {
        ...targetData.user.user_metadata,
        must_change_password: true
      }
    });
    if (updateError) return jsonResponse({ error: updateError.message }, 400);

    let emailSent = true;
    let delivery: MailDelivery | null = null;
    try {
      delivery = await sendPasswordEmail(targetData.user.email, appUrl, 'reset', temporaryPassword);
    } catch (error) {
      emailSent = false;
      console.error('Password reset email failed:', error);
    }

    return jsonResponse({
      success: true,
      email_sent: emailSent,
      email_provider: delivery?.provider || null,
      message_id: delivery?.messageId || null,
      temporary_password: temporaryPassword
    });
  }

  return jsonResponse({ error: 'Unsupported action.' }, 400);
});
