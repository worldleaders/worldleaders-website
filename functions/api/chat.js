// functions/api/chat.js
// WorldLeaders: RAG chat endpoint + simple per-IP rate limiting using Cloudflare Cache API.
// v2: conversation memory (history) + higher token limit + follow-up aware prompt.

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return corsPreflight();

  if (request.method === "GET") {
    return new Response(
      'WorldLeaders Chat API. Send POST JSON: {"message":"...","history":[...]}',
      { headers: corsHeaders({ "content-type": "text/plain; charset=utf-8" }) }
    );
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    if (!env.OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY" }, 500);
    if (!env.OPENAI_VECTOR_STORE_ID) return json({ error: "Missing OPENAI_VECTOR_STORE_ID" }, 500);

    // ---- Rate limit (server-side safety net; the UI enforces the friendlier 5/day cap)
    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("x-forwarded-for") ||
      "unknown";

    // NOTE: keep this >= the UI limit (AI_LOCAL_LIMIT in chatbot.js). This is per-IP anti-abuse.
    const limit = 8;
    const windowSeconds = 24 * 60 * 60;

    const rl = await rateLimitCheck({ ip, limit, windowSeconds });
    if (!rl.allowed) {
      return json(
        {
          error: "Rate limit reached",
          message:
            "To keep WorldLeaders sustainable, the assistant is limited to a few questions per day. Please use Resources or Contact for more support.",
          limit: rl.limit,
          remaining: rl.remaining,
          reset_in_seconds: rl.resetInSeconds,
        },
        429,
        { "retry-after": String(rl.resetInSeconds) }
      );
    }

    // ---- Read user input + optional conversation history
    const body = await request.json().catch(() => ({}));
    const message = (body?.message || "").toString().trim();
    const rawHistory = Array.isArray(body?.history) ? body.history : [];

    if (!message && rawHistory.length === 0) return json({ error: "Missing 'message' string" }, 400);

    // Sanitize history: only user/assistant string turns, cap count + length to control tokens.
    const history = rawHistory
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));

    const model = env.OPENAI_MODEL || "gpt-4.1-mini";

    const system = [
      "You are the WorldLeaders Assistant for parents and educators.",
      "ANSWER PRIMARILY FROM THE WORLDLEADERS DOCUMENTS returned by file_search. Paraphrase our own guidance whenever it applies, and prefer it over general knowledge.",
      "If the documents cover the question: base the answer on them and keep it concise (about 100–150 words), with short paragraphs and simple bullets.",
      "If the documents do NOT cover it: do NOT write a long general essay. Give one or two brief, sensible pointers in the calm WorldLeaders style (2–4 short lines), then point to the most relevant page (Resources or Contact). Our library is still growing, so it's fine to say a fuller answer is on the way.",
      "This is a CONVERSATION: use previous turns for context. For follow-ups like 'what if that doesn't work' or 'same as before', do NOT repeat your last answer — offer new, different, more specific strategies, and ask one gentle clarifying question if useful.",
      "Calm, supportive, practical. Educational content only. Not medical advice. Do not diagnose.",
    ].join("\n");

    // Build the model input from the conversation.
    const input = [{ role: "system", content: system }, ...history];
    const last = input[input.length - 1];
    if ((!last || last.role !== "user") && message) {
      input.push({ role: "user", content: message });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 450, // enough for a concise grounded answer; avoids the old 220 cutoff
        input,
        tools: [
          {
            type: "file_search",
            vector_store_ids: [env.OPENAI_VECTOR_STORE_ID],
            max_num_results: 5,
          },
        ],
      }),
    });

    const data = await openaiRes.json().catch(() => ({}));

    if (!openaiRes.ok) {
      return json({ error: data?.error?.message || `OpenAI error (${openaiRes.status})` }, 500);
    }

    const answer = extractAnswerText(data) || "Sorry — I couldn’t generate a response.";
    return json(
      {
        answer,
        rate_limit: {
          limit: rl.limit,
          remaining: rl.remaining,
          reset_in_seconds: rl.resetInSeconds,
        },
      },
      200
    );
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
}

/* ---------------- Rate limiting using Cache API ---------------- */

async function rateLimitCheck({ ip, limit, windowSeconds }) {
  const keyUrl = `https://worldleaders.local/ratelimit?ip=${encodeURIComponent(ip)}`;
  const cacheKey = new Request(keyUrl);
  const cache = caches.default;
  const now = Math.floor(Date.now() / 1000);

  const cached = await cache.match(cacheKey);
  if (!cached) {
    const record = { count: 1, start: now, windowSeconds };
    await cache.put(cacheKey, new Response(JSON.stringify(record), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${windowSeconds}` },
    }));
    return { allowed: true, limit, remaining: limit - 1, resetInSeconds: windowSeconds };
  }

  const record = await cached.json().catch(() => ({ count: 0, start: now, windowSeconds }));
  const start = Number(record.start || now);
  const count = Number(record.count || 0);
  const elapsed = now - start;

  if (elapsed >= windowSeconds) {
    const newRecord = { count: 1, start: now, windowSeconds };
    await cache.put(cacheKey, new Response(JSON.stringify(newRecord), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${windowSeconds}` },
    }));
    return { allowed: true, limit, remaining: limit - 1, resetInSeconds: windowSeconds };
  }

  if (count >= limit) {
    return { allowed: false, limit, remaining: 0, resetInSeconds: Math.max(1, windowSeconds - elapsed) };
  }

  const newCount = count + 1;
  const remaining = limit - newCount;
  const resetInSeconds = Math.max(1, windowSeconds - elapsed);
  const newRecord = { count: newCount, start, windowSeconds };
  await cache.put(cacheKey, new Response(JSON.stringify(newRecord), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${resetInSeconds}` },
  }));

  return { allowed: true, limit, remaining, resetInSeconds };
}

/* ---------------- Helpers ---------------- */

function extractAnswerText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const out = data?.output;
  if (!Array.isArray(out)) return "";
  let text = "";
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type === "output_text" && typeof c.text === "string") text += c.text;
      if (c?.type === "text" && typeof c.text === "string") text += c.text;
    }
  }
  return text.trim();
}

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    ...extra,
  };
}
function corsPreflight() { return new Response(null, { headers: corsHeaders() }); }
function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders({ "content-type": "application/json; charset=utf-8", ...extraHeaders }),
  });
}
