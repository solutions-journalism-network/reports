// SJN Reports — "share-report" Edge Function
//
// Called by the site's Share button. It:
//   1. checks that the person clicking is signed in AND on the uploaders list
//   2. gives each email access to the report (for a number of days, or until removed)
//   3. creates an account for anyone new, and emails them a link to the report
//   4. emails people who already have an account to say a new report was shared with them
//
// The emailed links never expire: they're plain links to the report, not sign-in links.
// The site pre-fills the person's email, so signing in is one click on
// "Email me a sign-in link" and then opening that email.
//
// Emails are sent through Resend: needs the RESEND_API_KEY secret (Edge Functions → Secrets).
// Creating accounts needs Supabase's secret key, which must never be in the website.
// Edge Functions get it automatically, so there's nothing to paste in.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via editor,
// name it exactly  share-report , replace the sample code with this file, Deploy.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Supabase provides the project's keys to every function: new-style keys as JSON lists,
// with the older names as a fallback.
function projectKey(kind: 'PUBLISHABLE' | 'SECRET'): string {
  const list = Deno.env.get(`SUPABASE_${kind}_KEYS`);
  if (list) {
    try {
      const keys = JSON.parse(list);
      const k = keys.default ?? Object.values(keys)[0];
      if (k) return k as string;
    } catch (_) { /* fall through */ }
  }
  const legacy = Deno.env.get(kind === 'SECRET' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY');
  if (!legacy) throw new Error(`No ${kind.toLowerCase()} key available to the function.`);
  return legacy;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Who the "new report shared with you" email comes from (must be on your verified Resend domain)
const NOTIFY_FROM = Deno.env.get('NOTIFY_FROM') ?? 'SJN Reports <noreply@reports.solutionsjournalism.org>';
const CONTACT = 'marie@solutionsjournalism.org';
const SITE = 'https://reports.solutionsjournalism.org/';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function emailHtml(heading: string, introHtml: string, link: string, noteHtml: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#EEF3F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3F4;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-top:6px solid #D34435;">
<tr><td style="padding:32px 36px 8px;"><img src="${SITE}sjn-logo.png" width="170" alt="Solutions Journalism Network" style="display:block;width:170px;max-width:100%;height:auto;border:0;"></td></tr>
<tr><td style="padding:24px 36px 0;font-family:Figtree,Helvetica,Arial,sans-serif;">
<h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:400;color:#D34435;">${heading}</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#000000;">${introHtml}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#D34435;border-radius:2px;">
<a href="${link}" style="display:inline-block;padding:13px 26px;font-family:Figtree,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;">View the report</a>
</td></tr></table>
<p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#55686B;">${noteHtml}</p>
</td></tr>
<tr><td style="padding:28px 36px 32px;font-family:Figtree,Helvetica,Arial,sans-serif;">
<p style="margin:0;padding-top:20px;border-top:1px solid #D8E2E4;font-size:13px;line-height:1.6;color:#55686B;">Questions? Contact <a href="mailto:${CONTACT}" style="color:#30626B;">${CONTACT}</a>.<br>Solutions Journalism Network</p>
</td></tr></table></td></tr></table></body></html>`;
}

// kind: 'welcome' for someone new, 'shared' for someone who already has an account
async function sendReportEmail(kind: 'welcome' | 'shared', to: string, title: string, link: string, until: string | null) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY secret isn’t set, so no email was sent');
  const t = escapeHtml(title);
  const untilLine = until ? `You can view it until ${until}. ` : '';
  const heading = kind === 'welcome' ? 'You have access to a report' : 'A new report for you';
  const subject = kind === 'welcome' ? `You have access to an SJN report: ${title}` : `New SJN report: ${title}`;
  const signInHelp = 'If the site asks you to sign in, your email is already filled in: click “Email me a sign-in link” and open the email we send. No password needed.';
  const note = kind === 'welcome'
    ? `${untilLine}This link doesn’t expire. ${signInHelp}`
    : `${untilLine}${signInHelp}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: [to],
      subject,
      html: emailHtml(heading, `Solutions Journalism Network has shared <strong>${t}</strong> with you.`, link, note),
      text: `Solutions Journalism Network has shared "${title}" with you.\n\nView it here: ${link}\n\n${note.replace(/[“”]/g, '"')}\n\nQuestions? Contact ${CONTACT}.`,
    }),
  });
  if (!res.ok) throw new Error(`the email service said: ${(await res.text()).slice(0, 200)}`);
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;

    // 1. Who is asking? Use their own sign-in, so Supabase's rules apply to them.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const asCaller = createClient(url, projectKey('PUBLISHABLE'), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await asCaller.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    const { data: isUploader } = await asCaller.rpc('is_uploader');
    if (isUploader !== true) return json({ error: 'Only uploaders can share reports.' }, 403);

    // 2. What are they asking for?
    const body = await req.json().catch(() => ({}));
    const reportId = String(body.report_id ?? '');
    const days = body.days == null ? null : Number(body.days);
    const notify = body.notify !== false; // email existing account holders unless told not to
    const redirectTo = typeof body.redirect_to === 'string' && body.redirect_to.startsWith('https://')
      ? body.redirect_to : undefined; // Supabase only honors addresses on its Redirect URLs list anyway
    const emails: string[] = [...new Set<string>(
      (Array.isArray(body.emails) ? body.emails : [])
        .map((e: unknown) => String(e).trim().toLowerCase())
        .filter(Boolean),
    )].slice(0, 50);

    if (!reportId || emails.length === 0) return json({ error: 'Add at least one email address.' }, 400);
    if (days !== null && !(days > 0 && days <= 3650)) return json({ error: 'That length of access isn’t valid.' }, 400);

    // 3. Do it, with the project's secret key
    const admin = createClient(url, projectKey('SECRET'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: report } = await admin.from('reports').select('id, title').eq('id', reportId).maybeSingle();
    if (!report) return json({ error: 'That report no longer exists.' }, 404);

    const expires_at = days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
    const results: { email: string; status: 'invited' | 'notified' | 'shared' | 'error'; message?: string }[] = [];
    // A plain link to the report that never expires; ?email= pre-fills the sign-in box
    const linkFor = (email: string) => (redirectTo ?? SITE) + '?email=' + encodeURIComponent(email) + '#report=' + reportId;
    const untilText = expires_at
      ? new Date(expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null;

    for (const email of emails) {
      if (!EMAIL.test(email)) {
        results.push({ email, status: 'error', message: 'doesn’t look like an email address' });
        continue;
      }
      // Did they already have (unexpired) access? Then don't email them again.
      const { data: existing } = await admin.from('report_access')
        .select('expires_at').eq('report_id', reportId).eq('email', email).maybeSingle();
      const hadAccess = !!existing && (!existing.expires_at || new Date(existing.expires_at) > new Date());

      const { error: shareError } = await admin.from('report_access').upsert(
        { report_id: reportId, email, expires_at, granted_by: user.id, granted_at: new Date().toISOString() },
        { onConflict: 'report_id,email' },
      );
      if (shareError) {
        results.push({ email, status: 'error', message: shareError.message });
        continue;
      }
      // New person? Create their account (no expiring invitation link) and send a welcome email.
      const { error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true });
      const isNew = !createError;
      if (createError && !((createError as { code?: string }).code === 'email_exists' || /already|registered|exists/i.test(createError.message))) {
        results.push({ email, status: 'error', message: 'shared, but the account couldn’t be created: ' + createError.message });
        continue;
      }
      if (!isNew && !notify) { results.push({ email, status: 'shared', message: 'no email sent' }); continue; }
      if (!isNew && hadAccess) { results.push({ email, status: 'shared', message: 'already had access, so no email sent' }); continue; }
      try {
        await sendReportEmail(isNew ? 'welcome' : 'shared', email, report.title, linkFor(email), untilText);
        results.push({ email, status: isNew ? 'invited' : 'notified' });
      } catch (err) {
        results.push({ email, status: 'error', message: 'shared, but the email failed: ' + (err as Error).message });
      }
    }

    return json({ results });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
