(function () {
  const API_URL = "/api/chat";

  // AI answers are limited per browser (localStorage); local answers are unlimited.
  const AI_LOCAL_LIMIT = 5;
  const LS_KEY = "wl_ai_chat_count_v1";

  // ---- Conversation state (memory) ----
  let history = [];        // [{role:'user'|'assistant', content:'...'}] sent to the API for context
  let aiStarted = false;   // once we've gone to AI, follow-ups stay in the AI thread (with context)
  let askedIntake = false; // we only show the "tell me age/setting/goal" prompt once

  function trimHistory() { if (history.length > 10) history = history.slice(-10); }
  function pushUser(t) { history.push({ role: "user", content: t }); trimHistory(); }
  function pushAssistant(t) { history.push({ role: "assistant", content: t }); trimHistory(); }

  function getAiCount() {
    const v = Number(localStorage.getItem(LS_KEY) || "0");
    return Number.isFinite(v) ? v : 0;
  }
  function setAiCount(n) { localStorage.setItem(LS_KEY, String(Math.max(0, n))); }
  function incAiCount() { const n = getAiCount() + 1; setAiCount(n); return n; }

  // -------- Local Knowledge (zero-cost answers) --------
  const LOCAL_KB = [
    {
      test: (m) => /five pillars|5 pillars|pillars/i.test(m),
      answer: () =>
        [
          "WorldLeaders is built on five pillars:",
          "• Whole-Child Growth — emotions, thinking, movement, and belonging grow together",
          "• Play = Learning — confidence and skills through hands-on exploration",
          "• Connection & Belonging — safe relationships make learning possible",
          "• Guided Independence — choice within boundaries builds self-control",
          "• Service & Responsibility — leadership begins with kindness and care",
          "",
          "See: Philosophy for the full picture.",
        ].join("\n"),
      links: [{ label: "Philosophy", href: "philosophy.html" }],
    },
    {
      test: (m) => /what is worldleaders|about worldleaders|mission|purpose|who are you/i.test(m),
      answer: () =>
        [
          "WorldLeaders supports children’s emotional, social, and learning growth through play, connection, and guided practice.",
          "We share practical tools for parents and educators — educational only, not medical advice.",
          "",
          "Start here:",
          "• Philosophy (why we do this)",
          "• Approach (how to apply it)",
        ].join("\n"),
      links: [
        { label: "Philosophy", href: "philosophy.html" },
        { label: "Approach", href: "approach.html" },
      ],
    },
    {
      test: (m) => /download|printable|pdf|guide|resources/i.test(m),
      answer: () =>
        [
          "You can download free WorldLeaders resources here:",
          "• ADHD: Understand & Connect toolkit",
          "• Calm-Down Plan",
          "• Transitions: First–Then guide",
          "",
          "See: Resources.",
        ].join("\n"),
      links: [{ label: "Resources", href: "resources.html" }],
    },
    {
      test: (m) => /contact|email|call|book/i.test(m),
      answer: () =>
        [
          "If you want to discuss a child-specific situation, the best next step is to send us your question via Contact.",
          "Sharing age + setting (home/school) + what’s happening + your goal helps us respond clearly.",
        ].join("\n"),
      links: [{ label: "Contact", href: "contact.html" }],
    },
  ];

  function matchLocalAnswer(message) {
    for (const item of LOCAL_KB) if (item.test(message)) return item;
    return null;
  }

  // Should this first message go straight to AI (scenario / plan / detail)?
  function shouldUseAI(message) {
    const m = message.trim();
    const words = m.split(/\s+/).filter(Boolean).length;
    if (/(step by step|plan|routine|script|what should i do|how do i handle|help me|example|strateg(y|ies)|in this situation|difficult|struggl|meltdown|homework|writing|lethargic|anxious|anxiety|sensory)/i.test(m)) return true;
    if (words >= 12) return true;
    return false;
  }

  // -------- UI --------
  const style = document.createElement("style");
  style.textContent = `
    .wl-chat-btn{position: fixed; right: 18px; bottom: 18px; z-index: 9999; border: 0; cursor: pointer; padding: 12px 14px; border-radius: 999px; background: #111827; color: #fff; box-shadow: 0 12px 30px rgba(0,0,0,.18); font-weight: 800; letter-spacing: .2px;}
    .wl-chat-panel{position: fixed; right: 18px; bottom: 72px; z-index: 9999; width: min(420px, calc(100vw - 36px)); height: 560px; background: #fff; border: 1px solid rgba(17,24,39,.12); border-radius: 18px; overflow: hidden; box-shadow: 0 18px 45px rgba(0,0,0,.22); display: none; flex-direction: column; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;}
    .wl-chat-head{padding: 12px 14px; background: #0f172a; color: #fff; display:flex; align-items:center; justify-content:space-between;}
    .wl-chat-title{font-weight:900; font-size:14px; letter-spacing:.2px;}
    .wl-chat-sub{font-size:12px; opacity:.85; margin-top:2px;}
    .wl-chat-close{border:0; background: transparent; color:#fff; cursor:pointer; font-size: 18px; line-height: 1; padding: 6px 8px; border-radius: 10px;}
    .wl-chat-body{padding: 12px; overflow:auto; flex:1; background: #f8fafc;}
    .wl-msg{max-width: 92%; padding: 10px 12px; border-radius: 14px; margin: 8px 0; white-space: pre-wrap;}
    .wl-user{margin-left:auto; background:#111827; color:#fff; border-bottom-right-radius: 6px;}
    .wl-bot{margin-right:auto; background:#fff; color:#111827; border:1px solid rgba(17,24,39,.08); border-bottom-left-radius: 6px;}
    .wl-chat-foot{padding: 10px; background: #fff; border-top:1px solid rgba(17,24,39,.08); display:flex; gap:8px;}
    .wl-input{flex:1; border:1px solid rgba(17,24,39,.15); border-radius: 12px; padding: 10px 12px; outline:none; font-size: 14px;}
    .wl-send{border:0; cursor:pointer; padding: 10px 12px; border-radius: 12px; background:#111827; color:#fff; font-weight: 900;}
    .wl-send[disabled]{opacity:.55; cursor:not-allowed;}
    .wl-typing{font-size:12px; color:#475569; margin: 6px 2px;}
    .wl-links{margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;}
    .wl-links a{display:inline-block; padding: 8px 10px; border-radius: 12px; border:1px solid rgba(17,24,39,.15); text-decoration:none; color:#0f172a; font-weight:800; font-size:13px; background:#fff;}
    .wl-meta{font-size:12px; color:#94a3b8; margin-top:8px;}
    .wl-cta{margin: 10px 0 2px 0; padding: 12px; border-radius: 14px; background: #fff; border: 1px solid rgba(17,24,39,.08);}
    .wl-cta h4{margin:0 0 6px 0; font-size:14px;}
    .wl-cta p{margin:0 0 10px 0; font-size:13px; color:#334155; line-height:1.4;}
    .wl-cta-row{display:flex; gap:8px; flex-wrap:wrap;}
    .wl-cta-row a.primary{background:#111827; color:#fff; border-color:#111827;}
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.className = "wl-chat-btn";
  btn.type = "button";
  btn.textContent = "Chat";
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.className = "wl-chat-panel";
  panel.innerHTML = `
    <div class="wl-chat-head">
      <div>
        <div class="wl-chat-title">WorldLeaders Assistant</div>
        <div class="wl-chat-sub">Quick answers • AI when needed</div>
      </div>
      <button class="wl-chat-close" aria-label="Close">×</button>
    </div>
    <div class="wl-chat-body" id="wlChatBody"></div>
    <div class="wl-chat-foot">
      <input class="wl-input" id="wlChatInput" placeholder="Ask about routines, emotions, learning..." />
      <button class="wl-send" id="wlChatSend">Send</button>
    </div>
  `;
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector(".wl-chat-close");
  const bodyEl = panel.querySelector("#wlChatBody");
  const inputEl = panel.querySelector("#wlChatInput");
  const sendBtn = panel.querySelector("#wlChatSend");

  function addMsg(text, who) {
    const div = document.createElement("div");
    div.className = `wl-msg ${who}`;
    div.textContent = text;
    bodyEl.appendChild(div);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
  function addLinks(links) {
    if (!links || !links.length) return;
    const wrap = document.createElement("div");
    wrap.className = "wl-links";
    for (const l of links) {
      const a = document.createElement("a");
      a.href = l.href;
      a.textContent = l.label;
      wrap.appendChild(a);
    }
    bodyEl.appendChild(wrap);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
  function setTyping(on) {
    let t = bodyEl.querySelector(".wl-typing");
    if (on) {
      if (!t) { t = document.createElement("div"); t.className = "wl-typing"; t.textContent = "Thinking…"; bodyEl.appendChild(t); bodyEl.scrollTop = bodyEl.scrollHeight; }
    } else if (t) { t.remove(); }
  }
  function showAiLimitCTA() {
    if (bodyEl.querySelector(".wl-cta")) return;
    const used = Math.min(getAiCount(), AI_LOCAL_LIMIT);
    const cta = document.createElement("div");
    cta.className = "wl-cta";
    cta.innerHTML = `
      <h4>You’ve reached today’s AI limit</h4>
      <p>For deeper, situation-specific help, send your question and we’ll reply by email. You can still ask quick questions here.</p>
      <div class="wl-cta-row">
        <a class="primary" href="contact.html">Send your question</a>
        <a href="resources.html">Download free guides</a>
      </div>
      <div class="wl-meta">AI usage: ${used}/${AI_LOCAL_LIMIT}</div>
    `;
    bodyEl.appendChild(cta);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
  function showUsageMeta() {
    const used = Math.min(getAiCount(), AI_LOCAL_LIMIT);
    const existing = bodyEl.querySelector("[data-usage]");
    if (!existing) {
      const div = document.createElement("div");
      div.className = "wl-meta";
      div.setAttribute("data-usage", "1");
      div.textContent = `AI usage today: ${used}/${AI_LOCAL_LIMIT}`;
      bodyEl.appendChild(div);
    } else {
      existing.textContent = `AI usage today: ${used}/${AI_LOCAL_LIMIT}`;
    }
  }
  function showIntakePrompt() {
    addMsg([
      "I can help. For the best answer, tell me:",
      "• child’s age",
      "• setting (home or school)",
      "• what’s happening",
      "• your goal (calm routine, listening, transitions, etc.)",
    ].join("\n"), "wl-bot");
    addLinks([
      { label: "Philosophy", href: "philosophy.html" },
      { label: "Approach", href: "approach.html" },
      { label: "Resources", href: "resources.html" },
    ]);
    showUsageMeta();
  }

  async function askAI(message) {
    if (getAiCount() >= AI_LOCAL_LIMIT) {
      showAiLimitCTA();
      const m = "You’ve reached today’s AI limit. For deeper, situation-specific help, please send your question via Contact and we’ll reply by email.";
      addMsg(m, "wl-bot"); pushAssistant(m);
      addLinks([{ label: "Contact", href: "contact.html" }, { label: "Resources", href: "resources.html" }]);
      return;
    }

    aiStarted = true;
    setTyping(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.slice(-8) }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setAiCount(AI_LOCAL_LIMIT);
        const m = data?.message || "We’ve reached today’s assistant limit. You can still browse resources or contact us for deeper support.";
        addMsg(m, "wl-bot"); pushAssistant(m);
        showAiLimitCTA();
        addLinks([{ label: "Contact", href: "contact.html" }, { label: "Resources", href: "resources.html" }]);
        return;
      }
      if (!res.ok) {
        const m = "I’m having trouble reaching the assistant right now. Meanwhile, here are good places to start on the site:";
        addMsg(m, "wl-bot"); pushAssistant(m);
        addLinks([
          { label: "Philosophy", href: "philosophy.html" },
          { label: "Approach", href: "approach.html" },
          { label: "Resources", href: "resources.html" },
          { label: "Contact", href: "contact.html" },
        ]);
        return;
      }

      incAiCount();
      showUsageMeta();
      const ans = data?.answer || "I couldn’t find that in our resources. Try asking another way, or use Contact.";
      addMsg(ans, "wl-bot");
      pushAssistant(ans);
    } catch (e) {
      const m = "I’m having trouble connecting right now. You can still use Resources or Contact for support.";
      addMsg(m, "wl-bot"); pushAssistant(m);
      addLinks([{ label: "Contact", href: "contact.html" }, { label: "Resources", href: "resources.html" }]);
    } finally {
      setTyping(false);
    }
  }

  async function handleMessage(message) {
    pushUser(message);

    // Already in an AI conversation → keep answering WITH context (this is the key fix).
    if (aiStarted) { await askAI(message); return; }

    // Pre-AI: instant, free answers for common one-off questions.
    const match = matchLocalAnswer(message);
    if (match) {
      const ans = match.answer();
      addMsg(ans, "wl-bot");
      if (match.links) addLinks(match.links);
      pushAssistant(ans);
      showUsageMeta();
      return;
    }

    // Enough detail / scenario, OR the user is replying to our intake prompt → use AI.
    if (shouldUseAI(message) || askedIntake) { await askAI(message); return; }

    // Otherwise ask for the key details ONCE; the next message goes to AI.
    askedIntake = true;
    showIntakePrompt();
  }

  function openChat() {
    panel.style.display = "flex";
    btn.textContent = "Close";
    if (bodyEl.childElementCount === 0) {
      addMsg("Hi. I can answer quick questions from WorldLeaders pages instantly, and use the assistant for deeper questions when needed.", "wl-bot");
      addMsg("Try: “What are the five pillars?” or “How do I support transitions?”", "wl-bot");
      showUsageMeta();
    }
    setTimeout(() => inputEl.focus(), 50);
  }
  function closeChat() { panel.style.display = "none"; btn.textContent = "Chat"; }

  btn.addEventListener("click", () => {
    const open = panel.style.display === "flex";
    open ? closeChat() : openChat();
  });
  closeBtn.addEventListener("click", closeChat);
  sendBtn.addEventListener("click", () => {
    const msg = inputEl.value.trim();
    if (!msg) return;
    inputEl.value = "";
    addMsg(msg, "wl-user");
    handleMessage(msg);
  });
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") sendBtn.click(); });
})();
