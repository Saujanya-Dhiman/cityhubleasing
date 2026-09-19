(() => {
  if (window.__ariaWidget) return;
  window.__ariaWidget = true;

  const CHAT_URLS = ["/api/chat", "/.netlify/functions/chat"];
  const STORE_KEY = "aria-chat-v1";
  const FALLBACK = "I'm having a little trouble connecting right now. Please call +91 76965 10579.";
  const INITIAL_CHIPS = [
    { label: "Explore Office Space", text: "I'm interested in office space.", category: "Office Space" },
    { label: "Explore Warehouse", text: "I'm looking for a warehouse.", category: "Warehouse" },
    { label: "Explore Showroom", text: "I'm looking for a showroom / retail space.", category: "Showroom" }
  ];
  const LISTING_CHIPS = {
    Office: [
      { label: "Office Space in Mohali", href: "office-space-mohali.html" },
      { label: "Office Space in Chandigarh", href: "office-space-chandigarh.html" }
    ],
    Warehouse: [{ label: "Warehouse", href: "warehouse-for-rent.html" }],
    Showroom: [{ label: "Showroom", href: "showroom-for-rent.html" }]
  };

  const root = document.getElementById("aria-widget-root") || Object.assign(document.createElement("div"), { id: "aria-widget-root" });
  if (!root.isConnected) document.body.appendChild(root);
  root.className = "aria-root";
  root.innerHTML = `
    <div class="aria-launcher-wrap">
      <div class="aria-tooltip">Need help finding an office? Chat with Aria</div>
      <button type="button" class="aria-launcher cha-launcher" aria-label="Need help finding an office? Chat with Aria">
        <span class="aria-beacon" aria-hidden="true"></span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2M6 9H18V11H6V9M14 14H6V12H14V14M18 8H6V6H18V8Z"/></svg>
      </button>
    </div>
    <aside class="aria-panel" aria-label="Aria CityHub Commercial Advisory">
      <header class="aria-head">
        <div class="aria-avatar">A</div>
        <div>
          <h2>Aria | CityHub Commercial Advisory</h2>
          <p>Commercial leasing specialist</p>
          <span class="aria-verified">● Verified</span>
        </div>
        <div class="aria-tools">
          <button type="button" data-clear title="Clear conversation">↺</button>
          <button type="button" data-min title="Minimize">–</button>
        </div>
      </header>
      <div class="aria-thread" data-thread></div>
      <div class="aria-chips" data-chips></div>
      <form class="aria-composer" data-form>
        <input name="q" autocomplete="off" placeholder="Ask about offices, coworking, warehouses…">
        <button type="submit">Send</button>
      </form>
    </aside>
  `;

  const panel = root.querySelector(".aria-panel");
  const launcher = root.querySelector(".aria-launcher");
  const thread = root.querySelector("[data-thread]");
  const chipsEl = root.querySelector("[data-chips]");
  const form = root.querySelector("[data-form]");
  const input = form.querySelector("input");

  const loadStore = () => {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; }
  };
  const saveStore = (data) => sessionStorage.setItem(STORE_KEY, JSON.stringify(data));

  let store = loadStore();
  let history = Array.isArray(store.history) ? store.history : [];
  let leadState = store.leadState && typeof store.leadState === "object" ? store.leadState : {};
  let sessionId = store.sessionId || (crypto.randomUUID ? crypto.randomUUID() : `aria_${Date.now()}`);
  let busy = false;
  let leadCardShown = false;

  const persist = () => saveStore({ history: history.slice(-40), leadState, sessionId });

  const scrollThread = () => {
    thread.scrollTop = thread.scrollHeight;
  };

  const addMsg = (role, text) => {
    const el = document.createElement("div");
    el.className = `aria-msg ${role}`;
    el.textContent = text;
    thread.appendChild(el);
    scrollThread();
    return el;
  };

  const setLoader = (on) => {
    let loader = thread.querySelector(".aria-loader");
    if (on) {
      if (!loader) {
        loader = document.createElement("div");
        loader.className = "aria-loader visible";
        loader.innerHTML = "<span></span><span></span><span></span>";
        thread.appendChild(loader);
      }
      loader.classList.add("visible");
      scrollThread();
    } else if (loader) {
      loader.remove();
    }
  };

  const isQualified = () => {
    const type = leadState.officeType;
    const sizeProvided = type === "Warehouse" || type === "Showroom"
      ? Boolean(leadState.requiredArea || leadState.sqft)
      : Boolean(leadState.teamSize);
    return Boolean(
      hasContact() && type && leadState.location && sizeProvided && leadState.budget &&
      (leadState.timeline || leadState.moveInDate)
    );
  };

  const listingChips = () => {
    const cat = String(leadState.category || leadState.officeType || "").toLowerCase();
    if (cat.includes("warehouse")) return LISTING_CHIPS.Warehouse;
    if (cat.includes("showroom") || cat.includes("retail")) return LISTING_CHIPS.Showroom;
    return LISTING_CHIPS.Office;
  };

  const renderChips = () => {
    chipsEl.innerHTML = "";
    const chips = !leadState.officeType && !leadState.category && !history.length
      ? INITIAL_CHIPS
      : hasContact()
        ? listingChips()
        : [];
    chips.forEach((chip) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = chip.label;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (chip.href) {
          window.location.assign(chip.href);
          return;
        }
        if (chip.category) {
          leadState.category = chip.category;
          leadState.officeType = chip.category;
          persist();
        }
        send(chip.text, chip.label);
      });
      chipsEl.appendChild(btn);
    });
  };

  const looksLikeContact = (text) =>
    /name and (best )?phone|phone number|contact details|before we explore|book (a )?site|site inspection|callback/i.test(String(text || ""));

  const hasContact = () => Boolean((leadState.name && leadState.phone) || leadState.inspectionBooked);

  const renderLeadCard = () => {
    if (leadCardShown || hasContact() || thread.querySelector(".aria-lead")) return;
    leadCardShown = true;
    const card = document.createElement("article");
    card.className = "aria-lead";
    card.innerHTML = `
      <h3>Book Site Inspection</h3>
      <p>Share your details and Aria will connect our leasing team for a walkthrough.</p>
      <form>
        <input name="name" placeholder="Full name *" required value="${leadState.name || ""}">
        <input name="phone" placeholder="10-digit mobile *" required inputmode="numeric" value="${leadState.phone || ""}">
        <input name="company" placeholder="Business name" value="${leadState.company || ""}">
        <p class="aria-error" data-err hidden></p>
        <button type="submit">Book Site Inspection</button>
      </form>
    `;
    thread.appendChild(card);
    scrollThread();
    card.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get("name") || "").trim();
      const phone = String(fd.get("phone") || "").replace(/\D/g, "").slice(-10);
      const company = String(fd.get("company") || "").trim();
      const err = card.querySelector("[data-err]");
      if (!/^[A-Za-z][A-Za-z\s.'-]{1,60}$/.test(name) || !/^[6-9]\d{9}$/.test(phone)) {
        err.hidden = false;
        err.textContent = "Enter a valid name and 10-digit mobile number.";
        return;
      }
      leadState = {
        ...leadState,
        name,
        phone,
        company,
        category: leadState.category || leadState.officeType || "Office Space",
        officeType: leadState.officeType || leadState.category || "Office Space",
        inspectionBooked: true,
        contactCaptured: true
      };
      persist();
      card.remove();

      // Submit lead to backend (which handles single unique storage by phone number)
      const leadPayload = {
        ...leadState,
        name,
        phone,
        company,
        category: leadState.category || leadState.officeType || "Office Space",
        officeType: leadState.officeType || leadState.category || "Office Space",
        sessionId,
        history,
        fullTranscript: history,
        createdAt: new Date().toISOString(),
        status: "new",
        source: "website_ai_assistant"
      };

      try {
        const res = await fetch("/.netlify/functions/lead", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(leadPayload)
        });
        if (!res.ok) throw new Error("Lead function failed");
      } catch (err) {
        console.warn("Lead save error, trying deterministic Firestore fallback:", err);
        try {
          const docId = `CH-TEL-${phone}`;
          const firestoreUrl = `https://firestore.googleapis.com/v1/projects/cityhubadmin/databases/(default)/documents/commercial_leads/${encodeURIComponent(docId)}?key=AIzaSyAUI6xoxsREuNJ1XXd7VS1GD0vC0iUYynY`;
          fetch(firestoreUrl, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fields: {
                id: { stringValue: docId },
                publicId: { stringValue: docId },
                name: { stringValue: name },
                phone: { stringValue: phone },
                company: { stringValue: company || "" },
                category: { stringValue: leadState.category || "Office Space" },
                officeType: { stringValue: leadState.officeType || "Office Space" },
                sessionId: { stringValue: sessionId },
                createdAt: { stringValue: leadPayload.createdAt },
                status: { stringValue: "new" },
                source: { stringValue: "website_ai_assistant" }
              }
            })
          }).catch(() => {});
        } catch {}
      }

      await send("I've shared my details.", null, {
        contactContinue: true,
        contactDetails: { name, phone, company, email: "" }
      });
    });
  };

  const parseHeaderJson = (value, fallback) => {
    if (!value) return fallback;
    try { return JSON.parse(decodeURIComponent(value)); } catch {
      try { return JSON.parse(value); } catch { return fallback; }
    }
  };

  const typewrite = (el, chunk) => {
    el.dataset.q = (el.dataset.q || "") + chunk;
    if (el.dataset.typing === "1") return;
    el.dataset.typing = "1";
    const step = () => {
      const pending = el.dataset.q || "";
      if (!pending) {
        el.dataset.typing = "0";
        return;
      }
      const n = Math.min(4, pending.length);
      el.textContent += pending.slice(0, n);
      el.dataset.q = pending.slice(n);
      scrollThread();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const readStream = async (response, el) => {
    const type = response.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const data = await response.json();
      if (data.leadState) leadState = { ...leadState, ...data.leadState };
      return data.answer || FALLBACK;
    }
    const headerState = parseHeaderJson(response.headers.get("X-Lead-State"), null);
    if (headerState) leadState = { ...leadState, ...headerState };
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const isSse = type.includes("text/event-stream");
    let buffer = "";
    let full = "";
    const consume = (piece) => {
      full += piece;
      // Render each SSE chunk directly. The old typewriter queue raced the
      // completed-response fallback below, appending the same reply twice.
      el.textContent = full;
      scrollThread();
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (isSse) {
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const block of parts) {
          const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.replace(/^data:\s?/, "")).join("\n");
          if (!data || data === "[DONE]") continue;
          consume(data);
        }
      } else {
        consume(buffer);
        buffer = "";
      }
    }
    if (isSse && buffer.trim()) {
      const data = buffer.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.replace(/^data:\s?/, "")).join("\n");
      if (data && data !== "[DONE]") consume(data);
    }
    return full.trim();
  };

  const postChat = async (payload) => {
    let lastErr = null;
    for (const url of CHAT_URLS) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.status === 404) continue;
        return response;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Chat unavailable");
  };

  async function send(question, display, extra = {}) {
    const shown = display || question;
    if (!question || busy) return;
    panel.classList.add("open");
    chipsEl.innerHTML = "";
    addMsg("user", shown);
    history.push({ role: "user", content: question });
    persist();
    busy = true;
    input.disabled = true;
    setLoader(true);
    const botEl = addMsg("bot", "");
    try {
      const response = await postChat({
        question,
        history,
        sessionId,
        leadState,
        stream: true,
        ...extra
      });
      setLoader(false);
      if (!response.ok) {
        botEl.textContent = FALLBACK;
      } else {
        const text = await readStream(response, botEl);
        if (!botEl.textContent.trim() && text) botEl.textContent = text;
        if (!botEl.textContent.trim()) botEl.textContent = FALLBACK;
      }
      history.push({ role: "assistant", content: botEl.textContent });
      persist();
      if (!hasContact() && (looksLikeContact(botEl.textContent) || leadState.officeType)) {
        renderLeadCard();
      }
      renderChips();
    } catch (err) {
      setLoader(false);
      botEl.textContent = FALLBACK;
      history.push({ role: "assistant", content: botEl.textContent });
      persist();
      renderChips();
    } finally {
      busy = false;
      input.disabled = false;
      input.focus();
      scrollThread();
    }
  }

  const restore = () => {
    thread.innerHTML = "";
    history.forEach((item) => addMsg(item.role === "assistant" ? "bot" : "user", item.content));
    if (!history.length) {
      addMsg("bot", "Hi, I'm Aria — CityHub Commercial Advisory. I can match offices, coworking, showrooms, and warehouses across Mohali and Chandigarh.");
    }
    renderChips();
    if (history.some((item) => item.role === "assistant" && looksLikeContact(item.content)) && !hasContact()) {
      renderLeadCard();
    }
  };

  launcher.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });
  root.querySelector("[data-min]").addEventListener("click", () => panel.classList.remove("open"));
  root.querySelector("[data-clear]").addEventListener("click", () => {
    history = [];
    leadState = {};
    leadCardShown = false;
    persist();
    restore();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    input.value = "";
    send(q);
  });

  restore();

  const api = {
    setContext(prop) {
      if (prop && typeof prop === "object") {
        leadState.currentProperty = prop;
      } else if (typeof prop === "string" && prop) {
        leadState.currentPropertyId = prop;
      }
      persist();
    },
    ask(prompt) {
      panel.classList.add("open");
      if (prompt) send(String(prompt || "").trim());
    },
    open(propContext) {
      if (propContext) this.setContext(propContext);
      panel.classList.add("open");
      if (!history.length) {
        restore();
      }
    }
  };
  window.CityHubAria = api;
  window.CityHubAva = api;
})();
