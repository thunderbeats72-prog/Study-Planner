# Study Planner Pro - Email and Sign-in Setup Guide

This guide takes you from zero to: learners get a daily plan email, can sign
in with Google, and you never pay for anything. Every service below is free
at the usage this app needs.

You do not need to write code or understand what the pieces do. Follow the
steps in order, top to bottom. Each step ends with a "you have" line that
tells you what to copy into Vercel.

**Time needed: about 30 minutes, most of it clicking buttons on Google
pages.**

---

## What you will have at the end

1. Learners can add an email address to their account (at sign-up or later)
   and prove it is theirs with a link.
2. The **daily digest**: one short email each morning with today's first
   task, leftover work, streak and days to the exam.
3. A **Sunday-evening weekly summary** (optional per learner, off by
   default for the learner's peace).
4. A **Continue with Google** button on the sign-in screen.
5. An hourly clock that sends those emails at exactly the time each learner
   chose, in their own timezone.

Everything still works before you do any of this: with no keys at all the
app runs in a "dry run" where digest emails are written to a local file
instead of being sent, so you can check the wording first.

---

## Step 1 - Turn on 2-Step Verification for your Gmail account

This is required by Google before it will let any app send mail as you.

1. Open https://myaccount.google.com in your browser and sign in with the
   Gmail address you want the digests to come FROM (your own address is
   perfect for one deployment).
2. In the left menu, click **Security**.
3. Under "How you sign in to Google", click **2-Step Verification**.
4. Click **Get started** and follow the screens (a phone number and a
   confirmation code). When it says 2-Step Verification is ON, stop.

You have: a Gmail account with 2-Step Verification on. Nothing to copy yet.

---

## Step 2 - Create a Gmail "App Password"

This is the 16-letter password that lets the app send email through your
Gmail without ever touching your real password.

1. Still on https://myaccount.google.com, click **Security** again.
2. Use the search bar at the top of the page: type **App passwords** and
   press Enter (this option only appears after step 1).
3. On the App passwords page, in "App name", type `Study Planner Pro` and
   click **Create**.
4. A box shows 16 letters like `abcd efgh ijkl mnop`. **Copy all 16
   letters** (the spaces do not matter).

You have:

- `GMAIL_ADDRESS` = your full Gmail address, e.g. `you@gmail.com`
- `GMAIL_APP_PASSWORD` = those 16 letters

Free tier: Google allows about 500 emails per day from one account, which
covers this deployment comfortably.

---

## Step 3 - Google Cloud: create the "Continue with Google" button keys

Skip this section only if you do not want the Google button. Everything
else works without it - the button simply never shows.

### 3a. Create a Google Cloud project

1. Open https://console.cloud.google.com and sign in with the same Google
   account.
2. At the very top-left, click the **project picker** (next to the Google
   Cloud logo), then click **New Project**.
3. Name it `study-planner`, leave the rest as default, click **Create**.
4. Wait a few seconds, then make sure the top bar says "study-planner" - if
   not, pick it in the project picker.

### 3b. Set up the consent screen (what learners see on Google's page)

1. In the left menu, click **APIs & Services**, then **OAuth consent
   screen**.
2. Click **Get started** (or choose **External** and **Create** if asked).
3. App name: `Study Planner Pro`.
4. User support email: pick your Gmail address.
5. Scroll down; for "Developer contact information" enter the same Gmail
   address. Click **Save and continue** through the remaining screens (you
   can leave Scopes and Test users untouched - the defaults are right), then
   **Back to dashboard**.

### 3c. Create the OAuth client (the two keys)

1. In the left menu, click **Credentials**.
2. Click **+ Create credentials**, then **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Study Planner web`.
5. Under **Authorized JavaScript origins**, click **+ Add URI** and enter
   `https://your-app.vercel.app` (replace with your real Vercel address; you
   find it on the Vercel dashboard, it looks like
   `study-planner-abc123.vercel.app`).
6. Under **Authorized redirect URIs**, click **+ Add URI** and enter exactly
   `https://your-app.vercel.app/api/auth/google/callback` (note: `/api/auth/google/callback` - no trailing slash).
7. If you want to test locally on your own computer later, add one more
   redirect URI: `http://localhost:3000/api/auth/google/callback`.
8. Click **Create**. A box shows a **Client ID** (ends in
   `.apps.googleusercontent.com`) and a **Client secret** (starts with
   `GOCSPX-`). Copy both somewhere safe.

You have:

- `GOOGLE_OAUTH_CLIENT_ID` = the long ID ending in
  `.apps.googleusercontent.com`
- `GOOGLE_OAUTH_CLIENT_SECRET` = the value starting with `GOCSPX-`

---

## Step 4 - Generate the two random secrets

These are random strings the app uses so only YOUR scheduled jobs can wake
the mailer, and so email links cannot be forged.

Generate two different values. On a Mac or Linux computer open the
terminal and run this twice:

    openssl rand -hex 32

On Windows, open https://www.random.org/strings/ twice with 32 hex letters
per string. Any 32+ random characters are fine; the two values must differ
from each other.

You have:

- `CRON_SECRET` = first random string (print it here for the file:
  `CRON_SECRET=<paste your first string>`)
- `MAIL_LINK_SECRET` = second random string
  (`MAIL_LINK_SECRET=<paste your second string>`)

---

## Step 5 - Put everything into Vercel

1. Open https://vercel.com/dashboard and click your study-planner project.
2. Click **Settings** (top bar), then **Environment Variables** (left side).
3. For EACH line below: type the name in "Key", paste the value in "Value",
   leave all environments (Production, Preview, Development) ticked, click
   **Save**:

| Key | Value from |
| --- | --- |
| `GMAIL_ADDRESS` | Step 2 |
| `GMAIL_APP_PASSWORD` | Step 2 (16 letters) |
| `GOOGLE_OAUTH_CLIENT_ID` | Step 3c (skip if you skipped Google) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Step 3c (skip if you skipped Google) |
| `APP_URL` | `https://your-app.vercel.app` (your real Vercel address, no slash at the end) |
| `CRON_SECRET` | Step 4, first random string |
| `MAIL_LINK_SECRET` | Step 4, second random string |

4. Click **Deployments** (top bar), on the newest row click the three dots
   **⋮**, then **Redeploy**. Confirm. Wait about a minute.

The app now sends real email. To check: open your app, sign up with an
email address you can read, and the verification email will arrive in that
inbox within a minute.

---

## Step 6 - Turn on the hourly email clock (GitHub Actions)

Vercel's free plan allows a scheduled job only once per day. Learners pick
their own send time, so the app needs an hourly poke instead - that hourly
poke comes from GitHub Actions, free on every public repository and on
private ones up to the monthly limit (2,000 free minutes; this job uses
about 30 minutes per month).

### 6a. Create the two repository secrets

1. Open your GitHub repository in the browser.
2. Click **Settings** (top bar of the repo), then in the left menu under
   "Security" click **Secrets and variables**, then **Actions**.
3. Click **New repository secret**:
   - Name: `CRON_SECRET` - Value: the same first random string from Step 4
     (must match Vercel exactly).
   - Click **Add secret**.
4. Click **New repository secret** again:
   - Name: `DIGEST_URL` - Value:
     `https://your-app.vercel.app/api/cron/digest` (your real address again,
     with `/api/cron/digest` at the end).
   - Click **Add secret**.

The workflow file is already in the repository (`.github/workflows/digest-cron.yml`); it runs at the top of every hour, all by itself.

### 6b. Prove it works

1. In the repo click **Actions** (top bar), then in the left column click
   **Digest cron**.
2. Click **Run workflow** (right side, grey button), then the green
   **Run workflow** again.
3. After about 10 seconds, refresh the page: the newest run should show a
   green tick. Click it - the log shows `HTTP 200` and a small JSON summary
   of who was emailed.
4. (The built-in Vercel cron also calls the same endpoint once a day as a
   backstop - the endpoint itself makes sure nobody ever gets two digests
   in one day.)

---

## Step 7 - Optional: swap Gmail for Brevo

Only do this if Gmail's 500/day ever becomes too small, or you prefer
Brevo's dashboard. Brevo's free tier is 300 emails/day, no credit card
needed for it.

1. Open https://www.brevo.com and create a free account with your email.
2. In the top-right menu click your name, then **SMTP & API**.
3. Open the **API Keys** tab, click **Generate a new API key**, name it
   `study-planner`, and copy the key that starts with `xkeysib-`.
4. In Vercel (Settings -> Environment Variables) **remove** `GMAIL_ADDRESS`
   and `GMAIL_APP_PASSWORD`, then add:
   - `BREVO_API_KEY` = the `xkeysib-...` key
   - `BREVO_SENDER_EMAIL` = the email address you verified with Brevo
5. Redeploy (same as Step 5, point 4). One variable was the whole switch.

(Gmail and Brevo are the only two senders this app knows, by design.)

---

## Step 8 - Keep the digests out of spam (one Gmail filter)

Delivery depends partly on the reader's spam filters. One free filter
helps a lot for every Gmail learner:

1. In the learner's Gmail, click the filter icon at the right end of the
   search bar and search **From:** the sender address from Step 2 (your
   Gmail).
2. Click **Create filter**.
3. Tick **Never send it to Spam** and also **Mark as important** if you
   like, then click **Create filter**.
4. Optionally also star the first digest when it arrives - Gmail learns
   from that.

---

## Final checklist - five quick prods

Do these once, after Step 6, and everything else takes care of itself:

1. **Sign-up email works**: create a test account with an email you can
   read - the verification email arrives, and clicking it shows "verified"
   in Settings -> Account.
2. **The digest button works**: in the app open Settings -> Notifications,
   press **Send me a test digest now**, and read the email that lands (or,
   before keys are set, read the preview the app shows).
3. **The clock works**: the GitHub Action run from Step 6b is green, and a
   second manual run does NOT send you another digest for the same day.
4. **No email still works**: open the app in a private window - with none
   of this set up, nothing errors anywhere; the mail notes in Settings just
   say delivery is in dry run.
5. **Google works where you enabled it**: if you did Step 3, the front page
   shows Continue with Google; signing in with it creates the account once
   and always returns you to your own plan.

If any of these fail, the most common causes are: a redirect URI typed
slightly differently from Step 3c, the two `CRON_SECRET` values in Vercel
and GitHub not matching exactly, or the App Password copied without 2-Step
Verification being on.
