// functions/api/chat.js
// WorldLeaders: RAG chat endpoint + simple per-IP rate limiting using Cloudflare Cache API.
// Limit: 3 requests per 24 hours per IP (rolling window)

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") return corsPreflight();

  // Friendly GET response
  if (request.method === "GET") {
    return new Response(
      'WorldLeaders Chat API. Send POST JSON: {"message":"..."}',
      { headers: corsHeaders({ "content-type": "text/plain; charset=utf-8" }) }
    );
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // ---- Guardrails: env vars
    if (!env.OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY" }, 500);
    if (!env.OPENAI_VECTOR_STORE_ID) return json({ error: "Missing OPENAI_VECTOR_STORE_ID" }, 500);

    // ---- Rate limit (server-side)
    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("x-forwarded-for") ||
      "unknown";

    const limit = 3;
    const windowSeconds = 24 * 60 * 60; // 24h rolling window

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
        {
          "retry-after": String(rl.resetInSeconds),
        }
      );
    }

    // ---- Read user input
    const body = await request.json().catch(() => ({}));
    const message = (body?.message || "").toString().trim();
    if (!message) return json({ error: "Missing 'message' string" }, 400);

    // ---- OpenAI call (Responses API + file_search RAG)
    const model = env.OPENAI_MODEL || "gpt-4.1-mini";

    const system = [
      "You are the WorldLeaders Assistant for parents and educators.",
      "Be calm, supportive, and practical. Use short paragraphs and bullets.",
      "Answer ONLY using WorldLeaders documents returned via file_search.",
      "If the answer is not in the documents, say you don't know and suggest Resources/Contact.",
      "Keep the answer short (max ~160 words).",
      "Educational content only. Not medical advice. Do not diagnose.",
    ].join("\n");

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 220,
        input: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
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
      return json(
        {
          error: data?.error?.message || `OpenAI error (${openaiRes.status})`,
        },
        500
      );
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
  // Use a deterministic cache key
  const keyUrl = `https://worldleaders.local/ratelimit?ip=${encodeURIComponent(ip)}`;
  const cacheKey = new Request(keyUrl);
  const cache = caches.default;

  const now = Math.floor(Date.now() / 1000);

  const cached = await cache.match(cacheKey);
  if (!cached) {
    // First request in window
    const record = { count: 1, start: now, windowSeconds };
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(record), {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${windowSeconds}`,
        },
      })
    );

    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetInSeconds: windowSeconds,
    };
  }

  const record = await cached.json().catch(() => ({ count: 0, start: now, windowSeconds }));
  const start = Number(record.start || now);
  const count = Number(record.count || 0);
  const elapsed = now - start;

  // If for any reason window elapsed exceeds cache max-age, treat as reset
  if (elapsed >= windowSeconds) {
    const newRecord = { count: 1, start: now, windowSeconds };
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(newRecord), {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${windowSeconds}`,
        },
      })
    );

    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetInSeconds: windowSeconds,
    };
  }

  // Still within the rolling window
  if (count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetInSeconds: Math.max(1, windowSeconds - elapsed),
    };
  }

  const newCount = count + 1;
  const remaining = limit - newCount;
  const resetInSeconds = Math.max(1, windowSeconds - elapsed);

  const newRecord = { count: newCount, start, windowSeconds };
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(newRecord), {
      headers: {
        "content-type": "application/json",
        // Keep original window; do NOT extend on each request
        "cache-control": `public, max-age=${resetInSeconds}`,
      },
    })
  );

  return {
    allowed: true,
    limit,
    remaining,
    resetInSeconds,
  };
}

/* ---------------- Helpers ---------------- */

function extractAnswerText(data) {
  // Preferred shortcut if present
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

function corsPreflight() {
  return new Response(null, { headers: corsHeaders() });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders({ "content-type": "application/json; charset=utf-8", ...extraHeaders }),
  });
}
