// scripts/send-newsletter.mjs  (v3 — Resend Audience broadcast + unsubscribe, with direct-send fallback)
// If RESEND_AUDIENCE_ID is set  -> sends a Broadcast to your whole audience (adds unsubscribe automatically).
// If it's NOT set               -> falls back to emailing the fixed NEWSLETTER_TO list (test mode).
// Requires (installed in the workflow): react react-dom @react-email/components @react-email/render

import fs from "node:fs";
import React from "react";
import { render } from "@react-email/render";
import { Html, Head, Preview, Body, Container, Section, Heading, Text, Img, Button, Hr, Link } from "@react-email/components";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID || "";
const FROM = process.env.NEWSLETTER_FROM || "WorldLeaders <team@worldleaders.ca>";
const REPLY_TO = process.env.NEWSLETTER_REPLY_TO || "worldleaders.ca.team@gmail.com";
const TO = (process.env.NEWSLETTER_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
const SITE_URL = (process.env.SITE_URL || "https://worldleaders.ca").replace(/\/$/, "");

if (!RESEND_API_KEY) { console.log("RESEND_API_KEY not set — skipping newsletter."); process.exit(0); }

let insight;
try { insight = JSON.parse(fs.readFileSync(".last-insight.json", "utf8")); }
catch { console.log("No .last-insight.json — nothing to send."); process.exit(0); }

const { title, dek, url, image } = insight;
const e = React.createElement;
const ink = "#2A1E42", muted = "#5C5072", marigold = "#FDB05A", cream = "#FCF4EE";

function Email({ unsubscribe }) {
  return e(Html, { lang: "en" },
    e(Head, null),
    e(Preview, null, `This week: ${title}`),
    e(Body, { style: { background: cream, margin: 0, fontFamily: "Nunito, 'Segoe UI', Arial, sans-serif" } },
      e(Container, { style: { maxWidth: "560px", margin: "0 auto", padding: "24px 20px" } },
        image ? e(Img, { src: image, alt: "", width: "520", style: { width: "100%", height: "auto", borderRadius: "16px", marginBottom: "20px" } }) : null,
        e(Text, { style: { fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", fontSize: "12px", color: "#F0912E", margin: "0 0 6px" } }, "WorldLeaders · Weekly Insight"),
        e(Heading, { as: "h1", style: { fontFamily: "Georgia, serif", color: ink, fontSize: "26px", lineHeight: "1.15", margin: "0 0 10px" } }, title),
        e(Text, { style: { color: muted, fontSize: "16px", lineHeight: "1.6", fontWeight: 600, margin: "0 0 22px" } }, dek),
        e(Section, { style: { margin: "0 0 8px" } },
          e(Button, { href: url, style: { background: marigold, color: ink, fontWeight: 800, fontSize: "16px", textDecoration: "none", padding: "14px 28px", borderRadius: "100px" } }, "Read the full piece →")),
        e(Text, { style: { color: muted, fontSize: "14px", lineHeight: "1.6", margin: "26px 0 0" } },
          "Every behaviour has a reason. Each week we look at a situation many parents and teachers misread — and what actually helps."),
        e(Hr, { style: { borderColor: "rgba(42,30,66,.12)", margin: "26px 0" } }),
        e(Text, { style: { color: "#94a3b8", fontSize: "12px", lineHeight: "1.6", margin: 0 } },
          "Reply to reach us directly. Educational content only — not medical or legal advice."),
        unsubscribe
          ? e(Text, { style: { color: "#94a3b8", fontSize: "12px", margin: "8px 0 0" } },
              e(Link, { href: "{{{RESEND_UNSUBSCRIBE_URL}}}", style: { color: "#94a3b8", textDecoration: "underline" } }, "Unsubscribe"),
              "  ·  ", e(Link, { href: SITE_URL, style: { color: "#94a3b8" } }, "worldleaders.ca"))
          : e(Text, { style: { color: "#94a3b8", fontSize: "12px", margin: "8px 0 0" } },
              e(Link, { href: SITE_URL, style: { color: "#94a3b8" } }, "worldleaders.ca"))
      )
    )
  );
}

const subject = `WorldLeaders Weekly: ${title}`;

async function main() {
  if (AUDIENCE_ID) {
    // ---- Broadcast to the whole audience (public subscribers) ----
    const html = await render(e(Email, { unsubscribe: true }));
    const createRes = await fetch("https://api.resend.com/broadcasts", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audience_id: AUDIENCE_ID, from: FROM, reply_to: REPLY_TO, subject, html, name: subject }),
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !created?.id) { console.error("Broadcast create failed:", created); process.exit(1); }

    const sendRes = await fetch(`https://api.resend.com/broadcasts/${created.id}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const sent = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) { console.error("Broadcast send failed:", sent); process.exit(1); }
    console.log(`Broadcast sent to audience ${AUDIENCE_ID}. id=${created.id}`);
    return;
  }

  // ---- Fallback: direct send to the fixed test list ----
  if (TO.length === 0) { console.log("No RESEND_AUDIENCE_ID and no NEWSLETTER_TO — skipping."); process.exit(0); }
  const html = await render(e(Email, { unsubscribe: false }));
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: TO, reply_to: REPLY_TO, subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("Resend error:", data); process.exit(1); }
  console.log(`Newsletter sent to ${TO.length} recipient(s) (test mode). id=${data?.id || "?"}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
