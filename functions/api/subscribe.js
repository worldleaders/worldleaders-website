// functions/api/subscribe.js
// Double opt-in: emails a confirmation link (stateless HMAC token — no database).
// Adds the contact only after they click confirm (see confirm.js).
// If CONFIRM_SECRET is not set, falls back to single opt-in (adds immediately).
//
// Cloudflare Pages env vars: RESEND_API_KEY, RESEND_AUDIENCE_ID,
//   and for double opt-in: CONFIRM_SECRET, NEWSLETTER_FROM, SITE_URL (SITE_URL optional).

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body?.email || "").toString().trim().toLowerCase();
    const honeypot = (body?.website || "").toString();
    if (honeypot) return json({ message: "Thanks!" }, 200); // bot

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Please enter a valid email address." }, 400);
    }
    if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
      return json({ error: "The newsletter isn't set up yet — please check back soon." }, 500);
    }

    // ---- Double opt-in path ----
    if (env.CONFIRM_SECRET) {
      const site = (env.SITE_URL || "https://worldleaders.ca").replace(/\/$/, "");
      const from = env.NEWSLETTER_FROM || "WorldLeaders <team@worldleaders.ca>";
      const token = await sign(email, env.CONFIRM_SECRET);
      const link = `${site}/api/confirm?email=${encodeURIComponent(email)}&token=${token}`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject: "Confirm your WorldLeaders subscription", html: confirmEmail(link) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return json({ error: "Couldn't send the confirmation email. Please try again." + (d?.message ? "" : "") }, 502);
      }
      return json({ message: "Almost there — check your inbox and click the confirmation link." }, 200);
    }

    // ---- Single opt-in fallback ----
    const res = await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, unsubscribed: false }),
    });
    const data = await res.json().catch(() => ({}));
    const msg = (data?.message || data?.error?.message || "").toLowerCase();
    if (res.ok || res.status === 409 || res.status === 422 || msg.includes("already")) {
      return json({ message: "You're subscribed — thank you!" }, 200);
    }
    return json({ error: "Sorry, we couldn't subscribe you just now. Please try again." }, 502);
  } catch (e) {
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

async function sign(email, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.toLowerCase()));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function confirmEmail(link) {
  return `<!doctype html><html><body style="margin:0;background:#FCF4EE;font-family:Nunito,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 22px">
  <div style="font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:12px;color:#F0912E">WorldLeaders</div>
  <h1 style="font-family:Georgia,serif;color:#2A1E42;font-size:24px;margin:12px 0 10px">Confirm your subscription</h1>
  <p style="color:#5C5072;font-size:16px;line-height:1.6;margin:0 0 22px">Tap below to start getting the weekly WorldLeaders insight &mdash; one short, practical read on what&rsquo;s really going on beneath children&rsquo;s behaviour.</p>
  <a href="${link}" style="display:inline-block;background:#FDB05A;color:#2A1E42;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:100px">Confirm subscription</a>
  <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:26px 0 0">If you didn&rsquo;t request this, ignore this email &mdash; you won&rsquo;t be subscribed.</p>
</div></body></html>`;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
