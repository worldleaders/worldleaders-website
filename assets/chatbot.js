(function () {
  const API_URL = "/api/chat";
  const LOCAL_LIMIT = 3;
  const LS_KEY = "wl_chat_count_v1";

  function getCount() {
    const v = Number(localStorage.getItem(LS_KEY) || "0");
    return Number.isFinite(v) ? v : 0;
  }
  function setCount(n) {
    localStorage.setItem(LS_KEY, String(Math.max(0, n)));
  }
  function incCount() {
    const n = getCount() + 1;
    setCount(n);
    return n;
  }

  // UI styles
  const style = document.createElement("style");
  style.textContent = `
    .wl-chat-btn{
      position: fixed; right: 18px; bottom: 18px; z-index: 9999;
      border: 0; cursor: pointer;
      padding: 12px 14px; border-radius: 999px;
      background: #111827; color: #fff;
      box-shadow: 0 12px 30px rgba(0,0,0,.18);
      font-weight: 700; letter-spacing: .2px;
    }
    .wl-chat-panel{
      position: fixed; right: 18px; bottom: 72px; z-index: 9999;
      width: min(400px, calc(100vw - 36px));
      height: 540px;
      background: #fff; border: 1px solid rgba(17,24,39,.12);
      border-radius: 18px; overflow: hidden;
      box-shadow: 0 18px 45px rgba(0,0,0,.22);
      display: none; flex-direction: column;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }
    .wl-chat-head{
      padding: 12px 14px; background: #0f172a; color: #fff;
      display:flex; align-items:center; justify-content:space-between;
    }
    .wl-chat-title{font-weight:800; font-size:14px; letter-spacing:.2px;}
    .wl-chat-sub{font-size:12px; opacity:.85; margin-top:2px;}
    .wl-chat-close{
      border:0; background: transparent; color:#fff; cursor:pointer;
      font-size: 18px; line-height: 1; padding: 6px 8px; border-radius: 10px;
    }
    .wl-chat-body{
      padding: 12px; overflow:auto; flex:1;
      background: #f8fafc;
    }
    .wl-msg{max-width: 92%; padding: 10px 12px; border-radius: 14px; margin: 8px 0; white-space: pre-wrap;}
    .wl-user{margin-left:auto; background:#111827; color:#fff; border-bottom-right-radius: 6px;}
    .wl-bot{margin-right:auto; background:#fff; color:#111827; border:1px solid rgba(17,24,39,.08); border-bottom-left-radius: 6px;}
    .wl-chat-foot{
      padding: 10px; background: #fff; border-top:1px solid rgba(17,24,39,.08);
      display:flex; gap:8px;
    }
    .wl-input{
      flex:1; border:1px solid rgba(17,24,39,.15); border-radius: 12px;
      padding: 10px 12px; outline:none; font-size: 14px;
    }
    .wl-send{
      border:0; cursor:pointer;
      padding: 10px 12px; border-radius: 12px;
      background:#111827; color:#fff; font-weight: 800;
    }
    .wl-send[disabled]{opacity:.55; cursor:not-allowed;}
    .wl-typing{font-size:12px; color:#475569; margin: 6px 2px;}
    .wl-cta{
      margin: 10px 0 2px 0;
      padding: 12px;
      border-radius: 14px;
      background: #fff;
      border: 1px solid rgba(17,24,39,.08);
    }
    .wl-cta h4{margin:0 0 6px 0; font-size:14px;}
    .wl-cta p{margin:0 0 10px 0; font-size:13px; color:#334155; line-height:1.4;}
    .wl-cta .wl-cta-row{display:flex; gap:8px; flex-wrap:wrap;}
    .wl-cta a{
      display:inline-block;
      padding: 9px 10px;
      border-radius: 12px;
      border:1px solid rgba(17,24,39,.15);
      text-decoration:none;
      color:#0f172a;
      font-weight:700;
      font-size:13px;
      background:#fff;
    }
    .wl-cta a.primary{
      background:#111827;
      color:#fff;
      border-color:#111827;
    }
    .wl-counter{
      font-size:12px; color:#94a3b8; margin-top:6px;
    }
  `;
  document.head.appendChild(style);

  // UI elements
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
        <div class="wl-chat-sub">Parents & educators • practical support</div>
      </div>
      <button class="wl-chat-close" aria-label="Close">×</button>
    </div>
    <div class="wl-chat-body" id="wlChatBody"></div>
    <div class="wl-chat-foot">
      <input class="wl-input" id="wlChatInput" placeholder="Ask a question..." />
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

  function setTyping(on) {
    let t = bodyEl.querySelector(".wl-typing");
    if (on) {
      if (!t) {
        t = document.createElement("div");
        t.className = "wl-typing";
        t.textContent = "Typing…";
        bodyEl.appendChild(t);
        bodyEl.scrollTop = bodyEl.scrollHeight;
      }
    } else if (t) {
      t.remove();
    }
  }

  function showLimitCTA(sourceLabel) {
    // Avoid duplicates
    if (bodyEl.querySelector(".wl-cta")) return;

    const used = Math.min(getCount(), LOCAL_LIMIT);
    const cta = document.createElement("div");
    cta.className = "wl-cta";
    cta.innerHTML = `
      <h4>Assistant limit reached</h4>
      <p>
        To keep WorldLeaders sustainable, the assistant is limited to a few questions per day.
        You can still get support right now:
      </p>
      <div class="wl-cta-row">
        <a class="primary" href="resources.html">Download free guides</a>
        <a href="contact.html">Send your question</a>
      </div>
      <div class="wl-counter">Usage: ${used}/${LOCAL_LIMIT} (source: ${sourceLabel})</div>
    `;
    bodyEl.appendChild(cta);
    bodyEl.scrollTop = bodyEl.scrollHeight;

    // Disable input
    sendBtn.disabled = true;
    inputEl.disabled = true;
    inputEl.placeholder = "Limit reached — use Resources or Contact";
  }

  function updateCounterHint() {
    const used = Math.min(getCount(), LOCAL_LIMIT);
    // show a subtle hint in the bot message area at start
    if (!bodyEl.querySelector("[data-counter]")) {
      const div = document.createElement("div");
      div.className = "wl-typing";
      div.setAttribute("data-counter", "1");
      div.textContent = `Daily usage: ${used}/${LOCAL_LIMIT}`;
      bodyEl.appendChild(div);
    } else {
      bodyEl.querySelector("[data-counter]").textContent = `Daily usage: ${used}/${LOCAL_LIMIT}`;
    }
  }

  async function ask(message) {
    // Frontend soft limit
    if (getCount() >= LOCAL_LIMIT) {
      showLimitCTA("frontend");
      return;
    }

    setTyping(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await res.json().catch(() => ({}));

      // If backend rate limited, sync local and show CTA
      if (res.status === 429) {
        setCount(LOCAL_LIMIT);
        addMsg(data?.message || "Assistant limit reached.", "wl-bot");
        showLimitCTA("backend");
        return;
      }

      if (!res.ok) {
        addMsg(data?.error || "Sorry — something went wrong.", "wl-bot");
        return;
      }

      // Count successful answers
      const newCount = incCount();
      addMsg(data?.answer || "Sorry — no answer returned.", "wl-bot");
      updateCounterHint();

      if (newCount >= LOCAL_LIMIT) {
        showLimitCTA("frontend");
      }
    } catch (e) {
      addMsg("Network error. Please try again.", "wl-bot");
    } finally {
      setTyping(false);
    }
  }

  function openChat() {
    panel.style.display = "flex";
    btn.textContent = "Close";

    if (bodyEl.childElementCount === 0) {
      addMsg(
        "Hi. I’m the WorldLeaders Assistant. Ask me about the five pillars, routines, emotions, and learning through play.",
        "wl-bot"
      );
      updateCounterHint();
    }

    // If already at limit, show CTA immediately
    if (getCount() >= LOCAL_LIMIT) showLimitCTA("frontend");

    setTimeout(() => inputEl.focus(), 50);
  }

  function closeChat() {
    panel.style.display = "none";
    btn.textContent = "Chat";
  }

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
    ask(msg);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendBtn.click();
  });
})();
