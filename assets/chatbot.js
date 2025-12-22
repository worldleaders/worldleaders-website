(() => {
  const API_ENDPOINT = "/api/chat";

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(c));
    return node;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[m]));
  }

  const root = el("div", { class: "wl-chatbot" });

  const button = el("button", {
    class: "wl-chatbot__fab",
    type: "button",
    "aria-label": "Open chat"
  });
  button.textContent = "Chat";

  const panel = el("div", { class: "wl-chatbot__panel", "aria-hidden": "true" });

  const header = el("div", { class: "wl-chatbot__header" });
  header.innerHTML = `
    <div class="wl-chatbot__title">WorldLeaders Assistant</div>
    <button class="wl-chatbot__close" type="button" aria-label="Close chat">×</button>
  `;

  const messages = el("div", { class: "wl-chatbot__messages" });

  const footer = el("form", { class: "wl-chatbot__footer" });
  footer.innerHTML = `
    <input class="wl-chatbot__input" type="text" placeholder="Ask about routines, emotions, learning, ADHD support..." aria-label="Chat message" />
    <button class="wl-chatbot__send" type="submit">Send</button>
  `;

  const disclaimer = el("div", { class: "wl-chatbot__disclaimer" });
  disclaimer.textContent = "Educational only. Not medical advice.";

  panel.appendChild(header);
  panel.appendChild(messages);
  panel.appendChild(disclaimer);
  panel.appendChild(footer);

  root.appendChild(button);
  root.appendChild(panel);
  document.body.appendChild(root);

  const closeBtn = header.querySelector(".wl-chatbot__close");
  const input = footer.querySelector(".wl-chatbot__input");

  let isOpen = false;

  function openPanel() {
    isOpen = true;
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    setTimeout(() => input.focus(), 50);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  }

  button.addEventListener("click", () => (isOpen ? closePanel() : openPanel()));
  closeBtn.addEventListener("click", closePanel);

  function addMsg(role, text) {
    const item = el("div", { class: `wl-chatbot__msg ${role}` });
    item.innerHTML = escapeHtml(text).replace(/\n/g, "<br/>");
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  addMsg("assistant", "Hi! I’m here to help with practical, respectful strategies for children’s learning, emotions, and behavior. What’s going on today?");

  async function sendMessage(userText) {
    addMsg("user", userText);
    addMsg("assistant", "…");

    const placeholders = messages.querySelectorAll(".wl-chatbot__msg.assistant");
    const placeholder = placeholders[placeholders.length - 1];

    try {
      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");

      placeholder.innerHTML = escapeHtml(data.answer || "").replace(/\n/g, "<br/>");
    } catch (e) {
      placeholder.innerHTML = escapeHtml("Sorry — I couldn’t answer that right now. Please try again in a moment.");
      console.error(e);
    }

    messages.scrollTop = messages.scrollHeight;
  }

  footer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = (input.value || "").trim();
    if (!text) return;
    input.value = "";
    sendMessage(text);
  });
})();
