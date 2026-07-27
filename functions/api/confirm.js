// functions/api/confirm.js
// Verifies the double opt-in token, then adds the contact to the Resend Audience.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = (url.searchParams.get("token") || "").trim();
  const site = (env.SITE_URL || "https://worldleaders.ca").replace(/\/$/, "");

  if (!env.CONFIRM_SECRET || !env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) return page(site, false, "This link isn't available right now.");
  if (!email || !token) return page(site, false, "This confirmation link is incomplete.");

  const expected = await sign(email, env.CONFIRM_SECRET);
  if (!timingEqual(expected, token)) return page(site, false, "This confirmation link is invalid or has expired.");

  const res = await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  const data = await res.json().catch(() => ({}));
  const msg = (data?.message || data?.error?.message || "").toLowerCase();
  if (res.ok || res.status === 409 || res.status === 422 || msg.includes("already")) {
    return page(site, true, "You're subscribed! Your first weekly insight is on its way.");
  }
  return page(site, false, "Something went wrong confirming your subscription. Please try again.");
}

async function sign(email, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.toLowerCase()));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function page(site, ok, message) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ok ? "Subscribed" : "Subscription"} | WorldLeaders</title>
<style>body{margin:0;background:#FCF4EE;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#2A1E42;display:grid;place-items:center;min-height:100vh}
.card{background:#fff;max-width:460px;margin:20px;padding:40px 32px;border-radius:28px;box-shadow:0 24px 60px -20px rgba(42,30,66,.28);text-align:center}
h1{font-family:Georgia,serif;font-size:28px;margin:0 0 12px}p{color:#5C5072;font-size:16px;line-height:1.6;margin:0 0 24px;font-weight:600}
a{display:inline-block;background:#FDB05A;color:#2A1E42;font-weight:800;text-decoration:none;padding:13px 26px;border-radius:100px}
.emoji{font-size:44px;margin-bottom:8px}</style></head>
<body><div class="card"><div class="emoji">${ok ? "&#127881;" : "&#128533;"}</div><h1>${ok ? "You're in!" : "Hmm."}</h1><p>${message}</p><a href="${site}/insights.html">Go to Weekly Insights &rarr;</a></div></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}
