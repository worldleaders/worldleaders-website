// scripts/generate-insight.mjs
// WorldLeaders — weekly "Insight" generator (v2: adds an on-brand hero illustration).
// 1) writes a composite-scenario article (educational, ECE-framed) to /insights
// 2) generates an on-brand illustration to /assets/insights (falls back to a bundled banner)
// 3) rebuilds /insights.html with thumbnails
// Runs in GitHub Actions. Uses OPENAI_API_KEY.

import fs from "node:fs";
import path from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const GEN_IMAGE = (process.env.GEN_IMAGE || "true") !== "false";
const SITE_URL = (process.env.SITE_URL || "https://worldleaders.ca").replace(/\/$/, "");

if (!OPENAI_API_KEY) { console.error("Missing OPENAI_API_KEY"); process.exit(1); }

const ROOT = process.cwd();
const INSIGHTS_DIR = path.join(ROOT, "insights");
const ASSETS_DIR = path.join(ROOT, "assets", "insights");
fs.mkdirSync(INSIGHTS_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const THEMES = [
  "A child with ADHD gets a note home for swearing or shoving at recess, but no one asks what happened right before.",
  "A 'defiant' toddler who won't put on shoes or leave the park — transitions, not defiance.",
  "A child labelled 'aggressive' who bites or hits — what biting communicates and how to respond.",
  "A quiet child who 'shuts down' in class — anxiety and overwhelm mistaken for not trying.",
  "Meltdowns at pickup time — the after-school 'restraint collapse' every parent misreads.",
  "A child who 'won't listen' — when instructions outpace a developing brain.",
  "Sensory overwhelm in a loud classroom mistaken for misbehaviour.",
  "A child who refuses to write or do homework — lethargy, avoidance, and hidden difficulty.",
  "Sibling conflict and 'tattling' — teaching repair instead of assigning blame.",
  "Screen-time transitions and the tantrum that follows — predictability over punishment.",
  "A child who 'lies' about small things — fear of consequences vs. moral failing.",
  "Big feelings at bedtime — regulation routines that actually calm a nervous system.",
];

function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

const today = new Date();
const dateISO = today.toISOString().slice(0, 10);
const dateLabel = today.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
const theme = THEMES[isoWeek(today) % THEMES.length];

/* ---------------- 1. article text ---------------- */

const system = [
  "You write for WorldLeaders, a warm, values-driven resource helping parents and educators support children — including neurodiverse children.",
  "VOICE: calm, kind, plain-language, practical. Never clinical, never preachy. Short sentences.",
  "SAFETY: Write an ILLUSTRATIVE, COMPOSITE scenario. Use an invented first name in quotes (e.g. \"Sam\"). NEVER reference a real, named child, family, school, city incident, or news event. Do not invent statistics or cite sources.",
  "LENS: Frame 'what could have helped' through three traditions side by side — Reggio Emilia (the environment and the image of the capable child), Montessori (prepared environment, freedom within limits), and general early-childhood practice (regulate first, teach second). Keep each distinct and practical.",
  "Educational content only — not medical, legal, or diagnostic advice.",
  "Return ONLY a single minified JSON object (no code fences, no commentary) with EXACTLY these keys:",
  '{"title": string (<= 8 words), "dek": string (one hook sentence), "slug": string (kebab-case, <= 5 words), "scenario": [string, string], "reframe": [string], "whyItHappens": [{"title": string,"text": string},{..},{..}] (exactly 3), "whatHelps": [{"tradition":"Reggio Emilia","title":string,"text":string},{"tradition":"Montessori","title":string,"text":string},{"tradition":"Early-childhood practice","title":string,"text":string}], "tryThis": [string,string,string,string,string], "ctaHeading": string, "imagePrompt": string (a short visual description of a warm, abstract scene for this topic — NO people\'s faces, NO text)}',
].join("\n");

async function generateArticle() {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_output_tokens: 1600,
      input: [
        { role: "system", content: system },
        { role: "user", content: `This week's situation to explore: ${theme}\nWrite the JSON now.` },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  const raw =
    (typeof data.output_text === "string" && data.output_text) ||
    (data.output || []).flatMap((o) => o?.content || [])
      .filter((c) => c?.type === "output_text" || c?.type === "text").map((c) => c.text).join("");
  return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
}

/* ---------------- 2. hero illustration ---------------- */
// Returns { web, email }: web is used on the site (png or fallback svg); email is a png URL or null (email clients don't render svg).

async function generateImage(baseName, imagePrompt) {
  const fallback = { web: "assets/insights/default-hero.svg", email: null };
  if (!GEN_IMAGE) return fallback;
  try {
    const prompt =
      `Warm, soft flat-vector editorial illustration for a gentle parenting article. Scene: ${imagePrompt || theme}. ` +
      `Rounded organic shapes, calm and hopeful, inclusive. Palette: marigold #FDB05A, teal #48C0A6, soft sky blue #9DBEF5, coral, deep plum #2A1E42 on warm cream #FCF4EE. ` +
      `Editorial header banner. ABSOLUTELY NO text, letters, or words, and NO real or identifiable human faces.`;
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: "1536x1024", n: 1, quality: "medium" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.warn("Image gen failed:", data?.error?.message || res.status); return fallback; }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) { console.warn("Image gen: no data returned"); return fallback; }
    const file = `${baseName}.png`;
    fs.writeFileSync(path.join(ASSETS_DIR, file), Buffer.from(b64, "base64"));
    return { web: `assets/insights/${file}`, email: `assets/insights/${file}` };
  } catch (e) { console.warn("Image gen error:", e.message); return fallback; }
}

/* ---------------- template ---------------- */

const EM = '<svg class="brand-mark" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true"><rect x="7" y="55.5" width="50" height="4" rx="2" fill="#2A1E42" opacity=".10"/><rect x="7.5" y="30" width="7" height="26" rx="3.5" fill="#9DBEF5"/><circle cx="11" cy="27.5" r="4.4" fill="#9DBEF5"/><rect x="18" y="24" width="7" height="32" rx="3.5" fill="#48C0A6"/><circle cx="21.5" cy="21.5" r="4.4" fill="#48C0A6"/><rect x="28.5" y="18" width="7" height="38" rx="3.5" fill="#FDB05A"/><circle cx="32" cy="15.5" r="4.4" fill="#FDB05A"/><rect x="39" y="24" width="7" height="32" rx="3.5" fill="#FF8E72"/><circle cx="42.5" cy="21.5" r="4.4" fill="#FF8E72"/><rect x="49.5" y="30" width="7" height="26" rx="3.5" fill="#B79CF0"/><circle cx="53" cy="27.5" r="4.4" fill="#B79CF0"/></svg>';

function esc(s = "") { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function head(title, desc, prefix) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | WorldLeaders</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,500&family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${prefix}styles.css?v=20260726-1">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${prefix}favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="${prefix}apple-touch-icon.png">
<link rel="manifest" href="${prefix}site.webmanifest">
<meta name="theme-color" content="#FCF4EE">
</head>
<body>`;
}

function nav(prefix, active) {
  const link = (href, label) => `<a${active === href ? ' class="active"' : ""} href="${prefix}${href}">${label}</a>`;
  return `<header class="site-header"><div class="wrap nav">
<a class="brand" href="${prefix}index.html" aria-label="WorldLeaders home">${EM}<span>World<b>Leaders</b></span></a>
<nav class="nav-links" aria-label="Primary">
${link("philosophy.html", "Philosophy")}${link("approach.html", "Approach")}${link("learning.html", "Learning")}${link("neurodiversity.html", "Neurodiversity")}${link("parents.html", "For Parents")}${link("resources.html", "Resources")}${link("insights.html", "Insights")}
<a class="btn btn-primary nav-cta" href="${prefix}contact.html">Contact us</a>
</nav>
<button class="menu-btn" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
</div></header>`;
}

function footer(prefix) {
  return `<footer class="site-footer"><div class="wrap">
<div class="foot-grid">
<div class="foot-brand"><a class="brand" href="${prefix}index.html">${EM}<span>World<b>Leaders</b></span></a><p>Raising confident, morally aware children through play, connection, and purpose.</p></div>
<div class="foot-col"><h4>Explore</h4><a href="${prefix}philosophy.html">Philosophy</a><a href="${prefix}neurodiversity.html">Neurodiversity</a><a href="${prefix}insights.html">Weekly Insights</a></div>
<div class="foot-col"><h4>Support</h4><a href="${prefix}parents.html">For Parents</a><a href="${prefix}resources.html">Resources</a><a href="${prefix}contact.html">Contact</a></div>
</div>
<div class="foot-bottom">&copy; <span id="yr"></span> WorldLeaders &middot; Made with care in Canada &#127809;</div>
</div></footer>
<script src="${prefix}main.js?v=20260726-1" defer></script>
<script src="${prefix}assets/chatbot.js"></script>
</body></html>`;
}

const WHY_ICONS = [{ c: "chip-marigold", e: "&#9203;" }, { c: "chip-meadow", e: "&#128266;" }, { c: "chip-sky", e: "&#129504;" }];
const HELP_ICONS = [{ c: "chip-sky", e: "&#127917;" }, { c: "chip-meadow", e: "&#129530;" }, { c: "chip-marigold", e: "&#128155;" }];

function renderArticle(a, imgWeb) {
  const meta = JSON.stringify({ title: a.title, dek: a.dek, slug: a.slug, date: dateISO, label: dateLabel, img: imgWeb || "" });
  const scenario = (a.scenario || []).map((p) => `<p>${esc(p)}</p>`).join("");
  const reframe = (a.reframe || []).map((p) => `<p>${esc(p)}</p>`).join("");
  const why = (a.whyItHappens || []).slice(0, 3).map((w, i) =>
    `<div class="card reveal"><div class="chip ${WHY_ICONS[i].c}">${WHY_ICONS[i].e}</div><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p></div>`).join("");
  const helps = (a.whatHelps || []).slice(0, 3).map((h, i) =>
    `<div class="card reveal"><div class="chip ${HELP_ICONS[i].c}">${HELP_ICONS[i].e}</div><h3>${esc(h.tradition)}: ${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`).join("");
  const tryThis = (a.tryThis || []).map((t) => `<li>${esc(t)}</li>`).join("");
  const hero = imgWeb ? `<div class="infographic reveal" style="margin-bottom:30px"><img src="../${imgWeb}" alt="" loading="lazy"></div>` : "";

  return `${head(a.title, a.dek, "../")}
<!--WL_META ${meta} -->
${nav("../", "insights.html")}
<main>
<section class="page-hero">
  <div class="blob b-marigold b1"></div>
  <div class="wrap page-hero-inner">
    <p style="margin:0 0 6px;font-weight:800;color:var(--marigold-deep);font-size:.9rem"><a href="../insights.html" style="color:inherit">&larr; Weekly Insights</a> &middot; ${dateLabel}</p>
    <h1>${esc(a.title)}</h1>
    <p class="lead">${esc(a.dek)}</p>
  </div>
</section>
<section class="section" style="padding-top:8px">
  <div class="wrap" style="max-width:760px">
    ${hero}
    <p class="disclaimer-light"><strong>An illustrative, composite scenario</strong> &mdash; not a real named incident. Educational content only; not medical or legal advice. For diagnosis or support, consult qualified professionals.</p>
    <div class="stack" style="margin-top:28px">${scenario}</div>
    <h2 class="h2-block" style="margin-top:44px">Behaviour is communication</h2>
    <div class="stack">${reframe}</div>
    <h2 class="h2-block" style="margin-top:44px">What was likely really going on</h2>
    <div class="cards" style="margin-top:20px">${why}</div>
    <h2 class="h2-block" style="margin-top:48px">What could have helped</h2>
    <div class="cards" style="margin-top:20px">${helps}</div>
    <h2 class="h2-block" style="margin-top:48px">Try this at home &amp; school</h2>
    <div class="card reveal" style="margin-top:16px"><ul class="list">${tryThis}</ul></div>
    <div class="cta reveal" style="margin-top:48px"><div class="blob cb1"></div><div class="cta-inner">
      <h2>${esc(a.ctaHeading || "Every behaviour has a reason.")}</h2>
      <p>If you're supporting a child like this, our neurodiversity strategies and free guides are a good next step &mdash; or send us your situation.</p>
      <div class="cta-actions"><a class="btn btn-light" href="../neurodiversity.html">Neurodiversity support <span class="arrow">&rarr;</span></a><a class="btn btn-ghost" href="../contact.html" style="border-color:rgba(42,30,66,.35)">Ask a question</a></div>
    </div></div>
  </div>
</section>
</main>
${footer("../")}`;
}

function rebuildIndex() {
  const files = fs.readdirSync(INSIGHTS_DIR).filter((f) => f.endsWith(".html"));
  const items = [];
  for (const f of files) {
    const html = fs.readFileSync(path.join(INSIGHTS_DIR, f), "utf8");
    const m = html.match(/<!--WL_META (.*?) -->/);
    if (m) { try { items.push({ ...JSON.parse(m[1]), file: f }); } catch {} }
  }
  items.sort((a, b) => (a.date < b.date ? 1 : -1));
  const cards = items.map((it) => {
    const thumb = it.img ? `<img src="${it.img}" alt="" loading="lazy" style="margin:-34px -30px 18px;width:calc(100% + 60px);max-width:none;display:block">` : "";
    return `<a class="card reveal" href="insights/${it.file}">${thumb}<span class="tag" style="opacity:.5;font-size:.85rem">${esc(it.label || it.date)}</span><h3>${esc(it.title)}</h3><p>${esc(it.dek)}</p><p class="try-line"><b>Read &rarr;</b></p></a>`;
  }).join("\n      ");

  const indexHtml = `${head("Weekly Insights", "Weekly, practical insights on neurodiversity and child behaviour — what's really going on beneath the surface, and what actually helps.", "")}
${nav("", "insights.html")}
<main>
<section class="page-hero">
  <div class="blob b-marigold b1"></div>
  <div class="wrap page-hero-inner">
    <span class="eyebrow">Weekly Insights</span>
    <h1>What was really going on?</h1>
    <p class="lead">Each week: a common situation many parents and teachers misread, what's usually happening beneath the behaviour, and what actually helps &mdash; through a practical early-childhood lens.</p>
  </div>
</section>
<section class="section" style="padding-top:16px">
  <div class="wrap">
    <div class="cards">
      ${cards || '<p class="lead">First insight coming soon.</p>'}
    </div>
  </div>
</section>
</main>
${footer("")}`;
  fs.writeFileSync(path.join(ROOT, "insights.html"), indexHtml);
}

/* ---------------- run ---------------- */
(async () => {
  const a = await generateArticle();
  const slug = (a.slug || "insight").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const baseName = `${dateISO}-${slug}`;
  const img = await generateImage(baseName, a.imagePrompt);

  fs.writeFileSync(path.join(INSIGHTS_DIR, `${baseName}.html`), renderArticle(a, img.web));
  rebuildIndex();

  const url = `${SITE_URL}/insights/${baseName}.html`;
  const emailImage = img.email ? `${SITE_URL}/${img.email}` : null;
  fs.writeFileSync(path.join(ROOT, ".last-insight.json"), JSON.stringify({ title: a.title, dek: a.dek, url, image: emailImage }, null, 2));
  console.log("Created:", `${baseName}.html`, "| image:", img.web);
})().catch((e) => { console.error(e); process.exit(1); });
