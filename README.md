# SJN Reports site (using Supabase)

The site at **reports.solutionsjournalism.org** shares Claude-created HTML reports with SJN staff and partners.

## How it works

| Piece | Where | What it does |
|---|---|---|
| `index.html`, `sjn-logo.png`, `favicon.ico`, `CNAME` | GitHub repo `sjn-reports`, served by GitHub Pages | The website |
| Supabase project | supabase.com | Sign-in, the report list (a database table), and private storage for the report files |
| Email service (e.g. Resend) | Connected to Supabase | Sends the sign-in emails |

- **Signing in:** a person enters their email and gets a sign-in link. Only people you've added can sign in. They stay signed in on that device until they sign out.
- **Reading:** each person sees only the reports shared with them, for 30 days, 90 days, or until removed. Uploaders see every report.
- **Uploading, editing, deleting:** only people on the **uploaders** list.
- Supabase's access rules enforce all of this, not just the website. Report files sit in private storage, and deleting a report removes it permanently.

---

## Setup

### 1. Create the Supabase project
1. At supabase.com, create a project (e.g. **SJN Reports**). Choose a region near most readers (e.g. East US) and save the database password somewhere safe. You won't need it day to day.
2. **Plan:** upgrade to **Pro** (about $25/month) under Organization → Billing. Free projects pause after a week without activity, and the site stops working until someone restores the project.

### 2. Create the tables, storage and access rules
1. Open `setup.sql`. In section 4 at the bottom, remove the `--` from the four `insert` lines and put in the real emails of the people who will upload (yours and David's).
2. In Supabase: **SQL Editor → New query**, paste in the whole file, and click **Run**. It should finish with "Success. No rows returned."

### 3. Sign-in settings
1. **Authentication → Sign In / Providers:** make sure **Email** is enabled, and turn **off** "Allow new users to sign up". Only people you add can then sign in.
2. **Authentication → URL Configuration:**
   - **Site URL:** `https://reports.solutionsjournalism.org`
   - **Redirect URLs:** add `https://reports.solutionsjournalism.org/**`

### 4. Sign-in emails
Supabase's built-in sender only allows about 2 emails an hour, which isn't enough. Connect a real email service instead. These steps use Resend, which is free for small volumes:

1. Sign up at resend.com and **add a domain**. A subdomain such as `mail.solutionsjournalism.org` keeps it separate from SJN's regular email.
2. Resend lists a few **DNS records**. Add them in GoDaddy (or ask whoever manages SJN's DNS), then click **Verify** in Resend.
3. In Resend, create an **API key**.
4. In Supabase: **Authentication → Emails → SMTP Settings** → turn on **Enable Custom SMTP**:
   - Host `smtp.resend.com`, port `465`, username `resend`, password: the API key
   - Sender email, e.g. `reports@mail.solutionsjournalism.org`; sender name `SJN Reports`
5. **Authentication → Emails → Templates:** edit **Magic Link** (subject like "Your sign-in link for SJN Reports") and **Invite user** ("You've been invited to SJN Reports"). Keep the `{{ .ConfirmationURL }}` link in both.
6. If several people sign in around the same time, raise **Authentication → Rate Limits → emails sent per hour**.

### 5. Connect the website
This is the part you edit yourself.

1. In Supabase, open **Project Settings → API Keys** and copy the **Publishable key** (it starts with `sb_publishable_`). **Never use the secret key in the website.**
2. Copy your **Project URL** (`https://xxxx.supabase.co`). It's shown under **Project Settings → Data API**, or in the **Connect** dialog.
3. In VS Code, open `index.html` and find these two lines near the top of the `<script>` section:
   ```javascript
   const SUPABASE_URL = 'https://YOUR-PROJECT-ID.supabase.co';
   const SUPABASE_KEY = 'sb_publishable_PASTE_YOUR_KEY_HERE';
   ```
   Paste in your URL and key, keeping the quote marks.
4. Replace the old `index.html` in the `sjn-reports` repo with this one (keep the logo, favicon and `CNAME`), then commit and push.

The publishable key is meant to be public. The access rules from step 2 decide what it can do.

### 6. Add yourself and test
1. **Authentication → Users → Add user → Send invitation** with your email. Click the link in the email. It opens the site, already signed in.
2. You should see **Upload reports** (you're on the uploaders list). Upload a report, open it, edit its title, and delete it to check everything works.
3. Upload the existing reports from the Drive folder. You can select several at once.

### 7. Retire the old setup
- In Apps Script: **Deploy → Manage deployments**, archive the web app, and delete any triggers. You can keep the project for reference or delete it.
- The Drive folder can stay as an archive of the original files. The site no longer reads it.

---

## Update: sharing reports with specific people
Do this once if your site was set up before per-person sharing existed.

1. **Run the update.** Supabase → **SQL Editor → New query**, paste in all of `update-sharing.sql`, **Run**. Its last section gives everyone who has access today every existing report, with no end date, so nothing changes for current readers.
2. **Add the sharing function.** Supabase → **Edge Functions → Deploy a new function → Via editor**. Name it exactly `share-report`, replace the sample code with all of `share-report.ts`, and click **Deploy**. Leave JWT verification on (the default). There are no keys to paste: Supabase gives the function what it needs.
2b. **Connect email for sharing (required).** In Resend, create an API key named `Supabase – share emails` (Sending access). In Supabase → **Edge Functions → Secrets**, add a secret named `RESEND_API_KEY` with that key as the value. The Share button uses it to send both welcome emails to new people and "new report" emails to existing people. Without it, sharing still grants access, but no emails go out (the Share window says so).
3. **Update the site.** Before replacing `index.html`, copy the two lines with `SUPABASE_URL` and `SUPABASE_KEY` from your current file into the new one (they're near the top of the `<script>` section). Then replace it in the repo, commit and push.
4. **Test.** Signed in as an uploader, click **Share** on one report and share it with an email you control that isn't an uploader. Open the invitation in a private window: that person should see only that report, with "Available until…" under it.

## Everyday use

**Sharing a report:** next to any report, click **Share** → enter one or more email addresses → choose **30 days**, **90 days**, or **Until removed** → **Share**. New people get a welcome email; people who already have an account get a "new report" email (untick **Email people who already have an account** to skip those). Nobody is emailed twice for a report they already have access to.

**The links in these emails never expire.** They're plain links to the report, not sign-in links. The first time someone uses one on a device, the site shows their email already filled in: they click **Email me a sign-in link**, open that email, and they're in. After that, the link takes them straight to the report.

Use **Share** rather than Supabase's **Invite user** for readers: dashboard invitations use one-click sign-in links that expire after 24 hours.

**Extending or removing access:** in the same **Share** window, click **Extend 30 days** or **Remove** next to a person. Expired access shows in red with a **Renew 30 days** option. Access ends right away when removed or expired.

**Seeing who can see what:** uploaders have a **People** tab above the list. It shows everyone with access, the reports each person can see, and when each one ends, with **Extend 30 days** and **Remove** buttons. Use the search box to find a person or a report.

**Making someone an uploader:** add their email in **Table Editor → uploaders**. Uploaders see every report and can upload, edit, share and delete. They need an account first (share any report with them, or invite them in Authentication → Users).

**Removing someone completely:** Authentication → Users → find them → **Delete user** (and remove them from **uploaders** if listed). If they're signed in at that moment, they lose access within about an hour.

**Uploading:** sign in → **Upload reports** → drop in HTML files. Titles and summaries come from inside each file and can be edited before uploading. New reports aren't shared with anyone until you click **Share**.

**Fixing a title later:** click **Edit** next to the report.

**Linking to one report:** open it and copy the address (it ends in `#report=…`). It works for anyone the report is shared with.

**Staying signed in:** the sign-in link expires after 24 hours, but once someone has signed in they stay signed in on that device and browser until they sign out or clear their browser data. Each new device or browser needs its own sign-in.

## Troubleshooting

| What you see | What to do |
|---|---|
| "That email address doesn't have access yet" | They don't have an account yet: share a report with them, or invite them under Authentication → Users. |
| Someone signs in but sees "No reports have been shared with you yet" | Nothing is shared with them, or their access expired. Use **Share** on the report. |
| **Share** says "Failed to send a request to the Edge Function" or similar | Check the function is deployed and named exactly `share-report` (Edge Functions page). Its **Logs** tab shows the detailed error. |
| Share says "the notification email failed" | Check the `RESEND_API_KEY` secret (Edge Functions → Secrets) and that the domain is still verified in Resend. The person still has access. |
| Sharing works but the invitation email doesn't arrive | Same as sign-in emails: check spam, Authentication → Logs, and the Resend settings. |
| No email arrives | Check spam. Under Authentication → Logs, look for email errors. Confirm SMTP is on (step 4) and the domain is verified in Resend. |
| "Please wait a minute before asking for another link" | Supabase limits how often one address can request links. Wait 60 seconds. |
| The link opens a page that says it's expired | Links expire after about an hour and work once. Request a new one. |
| The link goes to the wrong site or `localhost` | Fix the Site URL and Redirect URLs (step 3). |
| An uploader doesn't see **Upload reports** | Their email isn't in the **uploaders** table, or has a typo. |
| "Couldn't load the reports" or nothing works at all | Check the URL and key in `index.html`. Check the project isn't paused (Pro plan, step 1). |
| An upload fails with "mime type not supported" | The file isn't HTML. Only `.html` files can be uploaded. |
