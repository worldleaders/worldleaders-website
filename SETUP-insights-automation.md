# WorldLeaders — Weekly Insights automation (v2)

Weekly, auto-published "Insight" article **with an on-brand illustration**, plus a
**React-Email newsletter** (bulletproof in Gmail/Outlook/Apple Mail) to you and Carol.

## What's in this bundle (keep the folder structure)

    .github/workflows/weekly-insights.yml    the schedule + "Run now" button
    scripts/generate-insight.mjs             writes the article, generates the illustration, rebuilds insights.html
    scripts/send-newsletter.mjs              renders the email with React Email + sends via Resend
    insights.html                            the Insights index (NEW)
    insights/2026-07-27-behind-the-note.html first sample article (NEW)
    assets/insights/default-hero.svg         on-brand fallback banner (NEW)
    index.html + 8 pages                     now with "Insights" in the nav (OVERWRITE)

Unzip and commit all of it to the repo root of `worldleaders/worldleaders-website`.
Cloudflare rebuilds automatically.

## Step 1 — GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value | Required? |
|---|---|---|
| `OPENAI_API_KEY` | your existing OpenAI key (used for text AND the illustration) | yes |
| `SITE_URL` | `https://worldleaders.ca` | yes |
| `RESEND_API_KEY` | from resend.com → API Keys | for email |
| `NEWSLETTER_FROM` | `WorldLeaders <team@worldleaders.ca>` | for email |
| `NEWSLETTER_REPLY_TO` | `worldleaders.ca.team@gmail.com` | for email |
| `NEWSLETTER_TO` | your email, Carol's email (comma-separated) | for email |
| `OPENAI_MODEL` | `gpt-4.1-mini` | optional |
| `IMAGE_MODEL` | `gpt-image-1` | optional |
| `GEN_IMAGE` | `false` to turn OFF illustrations (uses the banner instead) | optional |

Notes:
- The **illustration** uses your existing OpenAI key — roughly a few cents per week. If image
  generation fails or is turned off, the article falls back to the bundled on-brand banner, so it
  never breaks.
- The newsletter step **auto-skips** if `RESEND_API_KEY` isn't set — so you can test article
  generation first, and switch on email once Resend is ready.
- **React Email is installed automatically** by the workflow. Nothing to do.

## Step 2 — Verify your domain in Resend (one-time)

Resend only sends from a domain you own, so `team@worldleaders.ca` must be verified:

1. resend.com → Domains → Add Domain → `worldleaders.ca`.
2. Add the DNS records Resend shows (SPF/DKIM, usually DMARC) in Cloudflare → DNS.
3. Click Verify in Resend. (DNS can take minutes to hours.)

Replies land in your Gmail via `NEWSLETTER_REPLY_TO`.

## Step 3 — Test before trusting the schedule

Repo → Actions → "Weekly Insight" → **Run workflow**. It generates a page + illustration,
commits them, and (if Resend is set) emails you. Check the page and the email. Repeat until happy.

## Step 4 — Let it run

Cron runs every Monday ~8:30am Toronto. (GitHub only runs scheduled workflows from the **default
branch**, so this must be on `main` for the weekly run to fire.)

## Later (optional)

- **Public signup form** (a `/api/subscribe` + Resend audience) to grow past you and Carol.
- **Human review**: change the workflow's commit step to open a Pull Request instead of pushing.
- **Edit topics**: the `THEMES` list at the top of `generate-insight.mjs`.
- **Move to n8n** on your Dell when the workflow grows (more sources, approvals, visual editing).
