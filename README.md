# SJN Reports site

The site at **reports.solutionsjournalism.org** shares HTML reports with SJN staff and partners.

## How it works

| Piece | Where | What it does |
|---|---|---|
| `index.html`, `sjn-logo.png`, `favicon.ico`, `CNAME` | GitHub repo `sjn-reports`, served by GitHub Pages | The website |
| Supabase project | supabase.com | Sign-in, the report list (a database table), and private storage for the report files |
| Email service (e.g. Resend) | Connected to Supabase | Sends the sign-in emails |

- **Signing in:** a person enters their email and gets a sign-in link. Only people you've added can sign in. They stay signed in on that device until they sign out.
- **Reading:** anyone signed in can read every report.
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

---

## Everyday use

**Giving someone access:** In Supabase, go to Authentication → Users → **Add user → Send invitation**. They click the emailed link and they're in. Afterward, they sign in by entering their email on the site.

**Making someone an uploader:** also add their email in **Table Editor → uploaders** (Insert → row). Capitalization doesn't matter.

**Removing access:** Authentication → Users → find them → **Delete user**. Also delete them from **uploaders** if they're listed. Their sign-in stops working; if they're signed in at that moment, they lose access within about an hour, when their session refreshes.

**Uploading:** sign in → **Upload reports** → drop in HTML files. Titles and summaries come from inside each file, and you can edit them before uploading. Reports appear immediately.

**Fixing a title later:** click **Edit** next to the report.

**Linking to one report:** open it and copy the address (it ends in `#report=…`). Whoever opens it goes straight to that report, after signing in if needed.

## Troubleshooting

| What you see | What to do |
|---|---|
| "That email address doesn't have access yet" | Add them under Authentication → Users (step 6). |
| No email arrives | Check spam. Under Authentication → Logs, look for email errors. Confirm SMTP is on (step 4) and the domain is verified in Resend. |
| "Please wait a minute before asking for another link" | Supabase limits how often one address can request links. Wait 60 seconds. |
| The link opens a page that says it's expired | Links expire after about an hour and work once. Request a new one. |
| The link goes to the wrong site or `localhost` | Fix the Site URL and Redirect URLs (step 3). |
| An uploader doesn't see **Upload reports** | Their email isn't in the **uploaders** table, or has a typo. |
| "Couldn't load the reports" or nothing works at all | Check the URL and key in `index.html`. Check the project isn't paused (Pro plan, step 1). |
| An upload fails with "mime type not supported" | The file isn't HTML. Only `.html` files can be uploaded. |
