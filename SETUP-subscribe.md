# WorldLeaders — Public signup + double opt-in + sitewide footer form

Adds: a signup form on Insights + every article AND a compact one in the footer sitewide;
double opt-in (a "confirm your email" step, no database); newsletter broadcasts to your Resend
Audience with automatic unsubscribe. Workflow bumped to Node 24.

## Files in this bundle

    functions/api/subscribe.js               NEW/OVERWRITE — signup; sends a confirmation email (double opt-in)
    functions/api/confirm.js                 NEW — verifies the confirm link, adds the contact
    main.js                                  OVERWRITE — signup handler + auto footer form on every page
    scripts/generate-insight.mjs             OVERWRITE — signup card on Insights + each article
    scripts/send-newsletter.mjs              OVERWRITE — broadcasts to the audience (with unsubscribe)
    .github/workflows/weekly-insights.yml    OVERWRITE — Node 24 + passes RESEND_AUDIENCE_ID
    insights.html + sample article           OVERWRITE — regenerated with the form

Commit all to the repo root. The **footer form appears on all nine pages automatically** (via
main.js) — no need to re-edit each page.

## Step 1 — Resend Audience

Resend → Audience → create one → copy its **Audience ID**.

## Step 2 — Cloudflare Pages env vars (the signup + confirm run here)

Your Pages project → Settings → Variables and Secrets → add:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | your Resend key |
| `RESEND_AUDIENCE_ID` | the Audience ID |
| `NEWSLETTER_FROM` | `WorldLeaders <team@worldleaders.ca>` |
| `SITE_URL` | `https://worldleaders.ca` |
| `CONFIRM_SECRET` | any long random string (enables double opt-in) |

**Double opt-in is controlled by `CONFIRM_SECRET`:**
- **Set it** → signups get a "confirm your subscription" email; they're added only after they click. (Recommended for real subscribers.)
- **Leave it out** → single opt-in (added immediately). Fine for quick testing.

Redeploy the Pages project after adding (or it applies on the next build).

## Step 3 — GitHub Actions secret (the weekly send runs here)

Repo → Settings → Secrets and variables → Actions → add:
- `RESEND_AUDIENCE_ID` = the same Audience ID

(Once this is set, the weekly email goes to the **audience**. Make sure you + Carol are in it —
subscribe through the form, or add yourselves in Resend.)

## Step 4 — Test

1. Visit `worldleaders.ca` (any page) — the footer shows a signup box. The Insights page and each
   article show the larger signup card.
2. Enter your email → Subscribe.
   - With `CONFIRM_SECRET` set: you get a confirmation email → click **Confirm subscription** →
     a "You're in!" page shows, and the contact appears in Resend → Audience.
   - Without it: you're added immediately.
3. Actions → Weekly Insight → Run workflow → the broadcast goes to the audience, with an
   **Unsubscribe** link in the footer.

## Notes

- Stateless double opt-in: the confirm link is a signed token (HMAC of the email). No database.
- The Node.js deprecation warning you saw earlier is gone (Node 24). Any remaining notice about
  GitHub's built-in actions is cosmetic and resolves as GitHub updates them.
