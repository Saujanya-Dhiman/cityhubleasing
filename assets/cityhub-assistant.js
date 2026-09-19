const endpoint = "/.netlify/functions";
const historyKey = "cityhub-assistant-history-v3";
const sessionKey = "cityhub-assistant-session";
const stateKey = "cityhub-assistant-state";
const fallback = "I couldn't find that information on our website. Please contact our leasing team at +91 76965 10579.";
const busyFallback = "I'm having a little trouble connecting right now. Please try again in a moment.";

if (!document.querySelector(".cha-panel")) {

const intentPattern = /\b(price|budget|rent|lease|visit|office|warehouse|showroom|coworking|team|move[- ]?in|available|chahiye|dekhna hai|looking for|interested)\b/i;
const casualPattern = /^(hi|hello|hey|good (morning|afternoon|evening)|how are you|how r u|thanks|thank you|bye|who are you|what can you do|namaste|kaise ho|kya haal hai|dhanyawad|shukriya|alvida)[!.?\s]*$/i;

const sentKey = "cityhub-assistant-sent";
const thanksKey = "cityhub-assistant-thanks";

const CONTACT_PROMPT = "Before we explore spaces, may I get your name and best phone number? That way our CityHub leasing team can assist you if you find something you like.";
const NO_CATEGORY_MATCH_REPLY = "No problem — this one may not be the right fit. I can connect you directly with our CityHub leasing expert who can suggest spaces based on your exact requirement.";
const HANDOFF_REASSURANCE = "Thank you — I've shared your requirement and full conversation with our CityHub leasing team. They'll contact you shortly.";

const SQFT_CHIPS = ["Under 500 sq ft", "500–1,000 sq ft", "1,000–2,000 sq ft", "2,000–5,000 sq ft", "5,000–10,000 sq ft", "10,000+ sq ft", "Not Sure"];
const BUDGET_CHIPS = ["Under ₹50K", "₹50K–₹1L", "₹1L–₹3L", "₹3L–₹5L", "₹5L+", "Not Sure"];

/** Map UI chip labels → natural user intents (same session, no chat reset). */
const CHIP_INTENTS = {

  "Explore Office Space": "I'm interested in office space.",
  "Explore Warehouse": "I'm looking for a warehouse.",
  "Explore Showroom": "I'm looking for a showroom / retail space.",

  "Office Space": "I'm interested in office space.",
  "Explore Office Spaces": "I'm interested in office space.",

  "Explore Private Offices": "I'm interested in a private office.",

  "Coworking": "I'm interested in coworking space.",
  "Explore Coworking": "I'm interested in coworking space.",

  "Warehouse": "I'm looking for a warehouse.",
  "Warehouses": "I'm looking for a warehouse.",
  "Explore Warehouses": "I'm looking for a warehouse.",

  "Showroom": "I'm looking for a showroom / retail space.",
  "Showrooms": "I'm looking for a showroom / retail space.",
  "Explore Showrooms": "I'm looking for a showroom / retail space.",

  "Explore Warehouses & Showrooms": "I'd like to explore warehouses and showrooms.",

  "Find a Space for My Team": "I need office space for my team.",
  "Schedule a Site Visit": "I want to book a site visit.",
  "Talk to a Leasing Expert": "I'd like to talk to a leasing expert.",

  "Mohali": "Preferred location is Mohali.",
  "Chandigarh": "Preferred location is Chandigarh.",
  "Airport Road": "I'd prefer something near Airport Road.",
  "IT City": "I'd prefer IT City / IT Park area.",
  "Zirakpur": "Preferred location is Zirakpur.",
  "Panchkula": "Preferred location is Panchkula.",

  "Under ₹50K": "My budget is under ₹50K per month.",
  "₹50K–₹1L": "My budget is ₹50K–₹1L per month.",
  "₹1L–₹3L": "My budget is ₹1L–₹3L per month.",
  "₹3L–₹5L": "My budget is ₹3L–₹5L per month.",
  "₹5L+": "My budget is ₹5L+ per month.",

  "Under 500 sq ft": "We need under 500 sq ft.",
  "500–1,000 sq ft": "We need 500–1,000 sq ft.",
  "1,000–2,000 sq ft": "We need 1,000–2,000 sq ft.",
  "2,000–5,000 sq ft": "We need 2,000–5,000 sq ft.",
  "5,000–10,000 sq ft": "We need 5,000–10,000 sq ft.",
  "10,000+ sq ft": "We need 10,000+ sq ft.",

  "Not Sure": "Not sure yet.",
  "Book a visit": "I want to book a site visit.",
  "Talk to an expert": "I'd like to talk to a leasing expert."

};
const FRESH_SEARCH_CHIPS = {
  "Explore Office Spaces": true,
  "Explore Warehouses": true,
  "Explore Showrooms": true
};

const LISTING_ACTIONS = {
  Office: [
    { label: "Office Space in Mohali", href: "office-space-mohali.html" },
    { label: "Office Space in Chandigarh", href: "office-space-chandigarh.html" }
  ],
  Warehouse: [
    { label: "Warehouse", href: "warehouse-for-rent.html" }
  ],
  Showroom: [
    { label: "Showroom", href: "showroom-for-rent.html" }
  ]
};

let history = [];
try { history = JSON.parse(localStorage.getItem(historyKey) || "[]"); } catch { history = []; }
let sessionId = localStorage.getItem(sessionKey);
if (!sessionId) {
  sessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  localStorage.setItem(sessionKey, sessionId);
}
let leadState = {};
try { leadState = JSON.parse(localStorage.getItem(stateKey) || "{}") || {}; } catch { leadState = {}; }
let busy = false;
let dislikeAttempts = 0;
let seenPropertyIds = [];
let dislikeCategoryKey = "";
let activeRequestId = 0;
let abortController = null;
let enquirySent = localStorage.getItem(sentKey) === "1";
let contactSubmitting = false;
let contactContinueLock = false;
const phoneNumber = "+917696510579";
const whatsappNumber = "917696510579";

const mascotSvg = "";
const markup = `<div class="cha-fab-wrap">
  <span class="cha-live-pill" aria-live="polite"><span class="cha-live-dot"></span> AI ARIA ⚡ — Online</span>
  <button class="cha-launcher" aria-label="Open CityHub Leasing assistant">
    <span class="cha-orb" aria-hidden="true">
      <span class="cha-orb-ring cha-orb-ring-a"></span>
      <span class="cha-orb-ring cha-orb-ring-b"></span>
      <span class="cha-orb-core"></span>
      <span class="cha-spark">✨</span>
    </span>
    <div class="cha-status-dot"></div>
  </button>
</div>
<aside class="cha-panel" aria-label="CityHub Leasing assistant">
  <header class="cha-head">
    <div class="cha-head-info">
      <strong>Ava</strong>
      <span>CityHub Leasing Master Agent</span>
    </div>
    <div class="cha-tools">
      <button type="button" data-clear>Clear</button>
      <button type="button" data-close aria-label="Minimize">-</button>
    </div>
  </header>
  <div class="cha-body">
    <div class="cha-messages"></div>
    <div class="cha-typing" hidden>
      <div class="cha-typing-dot"></div>
      <div class="cha-typing-dot"></div>
      <div class="cha-typing-dot"></div>
    </div>
    <div class="cha-actions-row">
      <a href="https://wa.me/${whatsappNumber}?text=Hi%20Ava%2C%20I%20am%20interested%20in%20a%20property." target="_blank" rel="noopener" class="cha-action-btn" id="waHandoffBtn">
        <svg viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7 8.5 7 9.71C7 10.93 7.89 12.1 8 12.27C8.14 12.44 9.76 14.94 12.25 16C12.84 16.27 13.3 16.42 13.66 16.53C14.25 16.72 14.79 16.69 15.22 16.63C15.7 16.56 16.68 16.03 16.89 15.45C17.1 14.87 17.1 14.38 17.04 14.27C16.97 14.17 16.81 14.11 16.56 13.96C16.31 13.81 15.08 13.21 14.85 13.12C14.62 13.04 14.45 12.99 14.29 13.24C14.12 13.49 13.64 14.06 13.49 14.21C13.34 14.36 13.19 14.38 12.94 14.26C12.69 14.13 11.89 13.88 10.95 13.04C10.2 12.38 9.7 11.55 9.55 11.3C9.4 11.05 9.53 10.91 9.66 10.79C9.77 10.68 9.91 10.5 10.04 10.35C10.16 10.21 10.2 10.11 10.29 9.94C10.37 9.78 10.33 9.64 10.27 9.5C10.21 9.39 9.7 8.16 9.49 7.65C9.28 7.15 9.07 7.22 8.92 7.22C8.78 7.22 8.61 7.22 8.44 7.22C8.28 7.22 8 7.29 7.78 7.54C7.55 7.79 6.9 8.39 6.9 9.61C6.9 10.83 7.79 12 7.9 12.17C8.04 12.34 9.66 14.84 12.15 15.9C12.74 16.17 13.2 16.32 13.56 16.43C14.15 16.62 14.69 16.59 15.12 16.53C15.6 16.46 16.58 15.93 16.79 15.35C17 14.77 17 14.28 16.94 14.17C16.87 14.07 16.71 14.01 16.46 13.86Z"/></svg>
        WhatsApp
      </a>
      <a href="tel:${phoneNumber}" class="cha-action-btn">
        <svg viewBox="0 0 24 24"><path d="M6.62,10.79C8.06,13.62 10.38,15.94 13.21,17.38L15.41,15.18C15.69,14.9 16.08,14.82 16.43,14.93C17.55,15.3 18.75,15.5 20,15.5C20.55,15.5 21,15.95 21,16.5V20C21,20.55 20.55,21 20,21C10.61,21 3,13.39 3,4C3,3.45 3.45,3 4,3H7.5C8.05,3 8.5,3.45 8.5,4C8.5,5.25 8.7,6.45 9.07,7.57C9.18,7.92 9.1,8.31 8.82,8.59L6.62,10.79Z"/></svg>
        Call
      </a>
    </div>
    <div class="cha-suggestions-wrap">
      <div class="cha-suggestions"></div>
    </div>
    <form class="cha-lead">
      <strong>Get a leasing callback</strong>
      <div class="cha-liked-box" hidden></div>
      <input name="name" placeholder="Name *" required>
      <input name="phone" placeholder="Phone *" required>
      <input name="email" type="email" placeholder="Email *" required>
      <input name="company" placeholder="Company Name">
      <input name="officeType" placeholder="Space Type (e.g. Coworking, Private Office)">
      <input name="location" placeholder="Preferred Location">
      <input name="teamSize" placeholder="Team Size (e.g. 15 seats)">
      <input name="budget" placeholder="Estimated Budget">
      <input name="timeline" placeholder="Move-in Timeline (e.g. Immediate, 30 days)">
      <button type="submit">Send request</button>
    </form>
  </div>
</aside>`;

document.body.insertAdjacentHTML("beforeend", markup);
const panel = document.querySelector(".cha-panel");
const launcher = document.querySelector(".cha-launcher");
const messages = document.querySelector(".cha-messages");
const typing = document.querySelector(".cha-typing");
const lead = document.querySelector(".cha-lead");
const suggestions = document.querySelector(".cha-suggestions");
const waHandoffBtn = document.getElementById("waHandoffBtn");
const form = document.querySelector(".cha-form");
const sendButton = form ? form.querySelector("button") : null;

function persist() {
  localStorage.setItem(historyKey, JSON.stringify(history.slice(-50)));
  localStorage.setItem(stateKey, JSON.stringify(leadState));
  localStorage.setItem(sessionKey, sessionId);
  if (enquirySent) localStorage.setItem(sentKey, "1");
  else localStorage.removeItem(sentKey);
}

function scrollToBottom() {
  messages.parentElement.scrollTop = messages.parentElement.scrollHeight;
}

function parseHeaderJson(value, fallbackValue) {
  if (!value) return fallbackValue;
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return fallbackValue;
    }
  }
}

function setBusy(value) {
  busy = value;
  if (sendButton) sendButton.disabled = value;
  const input = form ? form.querySelector("input") : null;
  if (input) input.disabled = value;
  suggestions.querySelectorAll("button").forEach(btn => {
    btn.disabled = value;
  });
}

function resolveMessage(raw) {
  const label = String(raw || "").trim();
  return CHIP_INTENTS[label] || label;
}

function nextMessageId(role) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${role}_${Date.now()}_${rand}`;
}

function validateName(name) {
  const trimmed = String(name || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return { valid: false, error: "Please enter your full name." };
  if (/^\d+$/.test(trimmed)) return { valid: false, error: "Please enter your full name." };
  if (!/^[A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s.'-]{0,60}$/.test(trimmed)) {
    return { valid: false, error: "Please enter your full name." };
  }
  return { valid: true, error: null, normalized: trimmed };
}

function validatePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  let normalized = digits;
  if ((normalized.length === 12 && normalized.startsWith("91")) || (normalized.length === 11 && normalized.startsWith("0"))) {
    normalized = normalized.slice(-10);
  }
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return { valid: false, error: "Please enter a valid 10-digit mobile number.", normalized: "" };
  }
  if (/^(\d)\1{9}$/.test(normalized) || normalized === "1234567890") {
    return { valid: false, error: "Please enter a valid 10-digit mobile number.", normalized: "" };
  }
  return { valid: true, error: null, normalized };
}

function validateEmail(email) {
  const trimmed = String(email || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return { valid: true, error: null, normalized: "" };
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address.", normalized: trimmed };
  }
  return { valid: true, error: null, normalized: trimmed };
}

function validateContactDetails(data = {}) {
  const nameRes = validateName(data.name);
  const phoneRes = validatePhone(data.phone);
  const emailRes = validateEmail(data.email);
  const company = String(data.company || "").replace(/\s+/g, " ").trim();
  const errors = {};
  if (!nameRes.valid) errors.name = nameRes.error;
  if (!phoneRes.valid) errors.phone = phoneRes.error;
  if (!emailRes.valid) errors.email = emailRes.error;
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      name: nameRes.normalized || "",
      phone: phoneRes.normalized || "",
      email: emailRes.normalized || "",
      company
    }
  };
}

function hasContact() {
  return Boolean(validateName(leadState.name).valid && validatePhone(leadState.phone).valid);
}

function looksLikeContactPrompt(text) {
  return /before we explore spaces|name and best phone|may i get your name/i.test(String(text || ""));
}

function removeInlineContactForm() {
  messages.querySelectorAll(".cha-inline-contact-card").forEach(el => el.remove());
}

function showInlineContactForm() {
  if (hasContact() || enquirySent) return;
  if (messages.querySelector(".cha-inline-contact-card")) return;

  const card = document.createElement("div");
  card.className = "cha-inline-contact-card";
  card.innerHTML = `
    <form class="cha-contact-form" novalidate>
      <div class="cha-field-group">
        <label for="cha-contact-name">Full Name *</label>
        <input id="cha-contact-name" name="name" type="text" autocomplete="name" placeholder="Enter your full name" maxlength="80">
        <div class="cha-field-error" data-error-for="name"></div>
      </div>
      <div class="cha-field-group">
        <label for="cha-contact-phone">Phone Number *</label>
        <input id="cha-contact-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Enter your phone number" maxlength="18">
        <div class="cha-field-error" data-error-for="phone"></div>
      </div>
      <div class="cha-field-group">
        <label for="cha-contact-email">Email Address</label>
        <input id="cha-contact-email" name="email" type="email" autocomplete="email" placeholder="Enter your email address" maxlength="120">
        <div class="cha-field-error" data-error-for="email"></div>
      </div>
      <div class="cha-field-group">
        <label for="cha-contact-company">Company Name</label>
        <input id="cha-contact-company" name="company" type="text" autocomplete="organization" placeholder="Enter company name" maxlength="80">
        <div class="cha-field-error" data-error-for="company"></div>
      </div>
      <button type="submit" class="cha-contact-submit">Continue</button>
    </form>
  `;
  messages.append(card);
  const formEl = card.querySelector("form");
  const nameInput = formEl.querySelector('[name="name"]');
  if (leadState.name) nameInput.value = leadState.name;
  if (leadState.phone) formEl.querySelector('[name="phone"]').value = leadState.phone;
  if (leadState.email) formEl.querySelector('[name="email"]').value = leadState.email;
  if (leadState.company) formEl.querySelector('[name="company"]').value = leadState.company;
  formEl.addEventListener("submit", onInlineContactSubmit);
  nameInput.focus();
  scrollToBottom();
}

function setInlineFieldError(formEl, field, message) {
  const input = formEl.querySelector(`[name="${field}"]`);
  const err = formEl.querySelector(`[data-error-for="${field}"]`);
  if (input) input.classList.toggle("is-invalid", Boolean(message));
  if (err) err.textContent = message || "";
}

function clearInlineFieldErrors(formEl) {
  ["name", "phone", "email", "company"].forEach(field => setInlineFieldError(formEl, field, ""));
}

async function onInlineContactSubmit(event) {
  event.preventDefault();
  if (contactSubmitting || contactContinueLock || busy) return;
  const formEl = event.currentTarget;
  const submitBtn = formEl.querySelector(".cha-contact-submit");
  const raw = {
    name: formEl.querySelector('[name="name"]').value,
    phone: formEl.querySelector('[name="phone"]').value,
    email: formEl.querySelector('[name="email"]').value,
    company: formEl.querySelector('[name="company"]').value
  };
  const result = validateContactDetails(raw);
  clearInlineFieldErrors(formEl);
  if (!result.valid) {
    Object.entries(result.errors).forEach(([field, message]) => setInlineFieldError(formEl, field, message));
    const firstInvalid = formEl.querySelector(".is-invalid");
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  contactSubmitting = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Continuing...";

  try {
    const payload = {
      ...leadState,
      name: result.normalized.name,
      phone: result.normalized.phone,
      email: result.normalized.email,
      company: result.normalized.company,
      sessionId,
      history,
      fullTranscript: history,
      likedProperty: leadState.likedProperty || null,
      rejectedProperties: leadState.rejectedPropertyIds || leadState.rejectedProperties || [],
      sqft: leadState.sqft || leadState.requiredArea || "",
      moveIn: leadState.moveIn || leadState.moveInDate || leadState.timeline || "",
      category: leadState.category || leadState.officeType || "",
      source: "website_ai_assistant",
      intent: "property_inquiry"
    };
    const response = await fetch(`${endpoint}/lead`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errors = data.errors || {};
      if (Object.keys(errors).length) {
        Object.entries(errors).forEach(([field, message]) => setInlineFieldError(formEl, field, message));
      } else {
        setInlineFieldError(formEl, "phone", data.error || "Please check your details and try again.");
      }
      return;
    }

    leadState = {
      ...leadState,
      name: result.normalized.name,
      phone: result.normalized.phone,
      email: result.normalized.email,
      company: result.normalized.company,
      contactCaptured: true
    };
    persist();
    removeInlineContactForm();
    await continueAfterContact();
  } catch (error) {
    console.error("Inline contact save failed", error);
    setInlineFieldError(formEl, "phone", "We could not save your details. Please try again.");
  } finally {
    contactSubmitting = false;
    if (submitBtn.isConnected) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue";
    }
  }
}

async function continueAfterContact() {
  if (contactContinueLock) return;
  contactContinueLock = true;
  const userLine = "I've shared my details.";
  const userId = nextMessageId("user");
  const lastUser = [...messages.querySelectorAll(".cha-message.user")].pop();
  if (!(lastUser && lastUser.textContent.trim() === userLine)) {
    render("user", userLine, [], [], userId);
  }
  if (!history.some(item => item.role === "user" && item.content === userLine)) {
    history.push({ role: "user", content: userLine, messageId: userId });
    persist();
  }

  const botMessageId = nextMessageId("bot");
  setBusy(true);
  typing.hidden = false;
  scrollToBottom();
  let replyRendered = false;
  try {
    const response = await fetch(`${endpoint}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: userLine,
        history,
        sessionId,
        leadState,
        contactContinue: true,
        contactDetails: {
          name: leadState.name,
          phone: leadState.phone,
          email: leadState.email,
          company: leadState.company
        },
        likedProperty: leadState.likedProperty || null,
        rejectedProperties: leadState.rejectedPropertyIds || [],
        stream: false
      })
    });
    typing.hidden = true;
    let reply = "";
    let nextState = null;
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      reply = data.answer || "";
      nextState = data.leadState || null;
    }
    if (!reply) {
      const first = String(leadState.name || "there").trim().split(/\s+/)[0] || "there";
      reply = `Thanks, ${first}. Let's find the right space for you. Which area works best — Mohali, Chandigarh, or a specific corridor?`;
    }
    const last = history[history.length - 1];
    if (last && last.role === "assistant" && last.content === reply) {
      updateChips();
      return;
    }
    render("bot", reply, [], [], botMessageId);
    replyRendered = true;
    history.push({ role: "assistant", content: reply, sources: [], properties: [], messageId: botMessageId });
    if (nextState) leadState = { ...leadState, ...nextState };
    persist();
    updateChips();
  } catch (error) {
    typing.hidden = true;
    console.error("Contact continue failed", error);
    // A response may already have been displayed before a non-network action
    // (such as local persistence) fails. Do not turn that into a second reply.
    if (replyRendered) return;
    const first = String(leadState.name || "there").trim().split(/\s+/)[0] || "there";
    const reply = `Thanks, ${first}. Let's find the right space for you. Which area works best — Mohali, Chandigarh, or a specific corridor?`;
    render("bot", reply, [], [], botMessageId);
    history.push({ role: "assistant", content: reply, sources: [], properties: [], messageId: botMessageId });
    persist();
    updateChips();
  } finally {
    setBusy(false);
    contactContinueLock = false;
    scrollToBottom();
  }
}

function saveDraftLead() {
  if (!hasContact()) return;
  fetch(`${endpoint}/lead`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...leadState,
      sessionId,
      history,
      fullTranscript: history,
      likedProperty: leadState.likedProperty || null,
      rejectedProperties: leadState.rejectedPropertyIds || leadState.rejectedProperties || [],
      sqft: leadState.sqft || leadState.requiredArea || "",
      moveIn: leadState.moveIn || leadState.moveInDate || leadState.timeline || "",
      category: leadState.category || leadState.officeType || "",
      source: "website_ai_assistant"
    })
  }).catch(() => {});
}

function getCategoryListingActions() {
  const cat = String(leadState.category || leadState.officeType || "").toLowerCase();
  if (cat.includes("warehouse")) return LISTING_ACTIONS.Warehouse;
  if (cat.includes("showroom") || cat.includes("retail")) return LISTING_ACTIONS.Showroom;
  return LISTING_ACTIONS.Office;
}

function updateChips() {
  let chips = [];

  if (enquirySent) {
    chips = [
      "Schedule a Site Visit",
      "Talk to a Leasing Expert",
      "Explore Office Spaces",
      "Find a Space for My Team"
    ];
  } else if (leadState.awaitingExpertHandoff) {
    chips = [
      "Talk to a Leasing Expert",
      "Explore Office Spaces",
      "Explore Warehouses"
    ];
  } else if (!leadState.officeType && !leadState.category) {
    chips = [
      "Explore Office Space",
      "Explore Warehouse",
      "Explore Showroom"
    ];
  } else if (!hasContact()) {
    chips = [];
  } else {
    chips = getCategoryListingActions();
  }

  CHIP_INTENTS["5 people"] = "We need space for about 5 people.";
  CHIP_INTENTS["10 people"] = "We need space for about 10 people.";
  CHIP_INTENTS["15 people"] = "We need space for about 15 people.";
  CHIP_INTENTS["20+ people"] = "We need space for about 20+ people.";
  CHIP_INTENTS["Immediate"] = "We need to move in immediately.";
  CHIP_INTENTS["Within 30 days"] =
    "We are looking to move in within 30 days.";

  suggestions.innerHTML = "";

  chips.forEach(chip => {
    const action = typeof chip === "object" && chip !== null ? chip : null;
    const label = action ? action.label : chip;
    const href = action ? action.href : null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.disabled = busy;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (busy) return;

      if (href) {
        window.location.assign(href);
        return;
      }

      if (enquirySent && FRESH_SEARCH_CHIPS[label]) {
        enquirySent = false;
        localStorage.removeItem(sentKey);
        localStorage.removeItem(thanksKey);
        leadState = {};
        history = [];
        resetDislikeTracking();

        sessionId = crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2, 15);

        persist();
        messages.innerHTML = "";
      }

      ask(label);
    });

    suggestions.append(btn);
  });
}

function matchingCategoryKey() {
  return `${leadState.officeType || ""}|${leadState.location || ""}`;
}

function resetDislikeTracking() {
  dislikeAttempts = 0;
  seenPropertyIds = [];
  dislikeCategoryKey = matchingCategoryKey();
}

function ensureDislikeCategory() {
  const key = matchingCategoryKey();
  if (key !== dislikeCategoryKey) resetDislikeTracking();
}

function listingPageFallback() {
  const type = String(leadState.officeType || "").toLowerCase();
  const loc = String(leadState.location || "").toLowerCase();
  if (type.includes("warehouse")) {
    return { href: "warehouse-for-rent.html", label: "Explore all Warehouses for Rent" };
  }
  if (type.includes("showroom")) {
    return { href: "showroom-for-rent.html", label: "Explore all Showrooms for Rent" };
  }
  if (loc.includes("chandigarh")) {
    return { href: "office-space-chandigarh.html", label: "Explore all Office Spaces in Chandigarh" };
  }
  return { href: "office-space-mohali.html", label: "Explore all Office Spaces in Mohali" };
}

function getActiveDeck(existingDeck) {
  if (existingDeck && existingDeck.classList && existingDeck.classList.contains("cha-property-deck")) {
    return existingDeck;
  }
  const found = messages.querySelector(".cha-property-deck");
  if (found) return found;
  const deck = document.createElement("div");
  deck.className = "cha-property-deck";
  messages.append(deck);
  return deck;
}

function renderPageLinkCard(deck) {
  const target = getActiveDeck(deck);
  target.innerHTML = "";
  const page = listingPageFallback();
  const link = document.createElement("a");
  link.className = "cha-page-link";
  link.href = page.href;
  link.textContent = page.label;
  target.append(link);
  scrollToBottom();
}

function renderPropertyCards(properties, existingDeck) {
  ensureDislikeCategory();
  const pair = (properties || []).slice(0, 2);
  const deck = getActiveDeck(existingDeck);
  deck.innerHTML = "";
  deck.classList.remove("cha-deck-refresh");
  void deck.offsetWidth;
  deck.classList.add("cha-deck-refresh");

  if (!pair.length) return;

  pair.forEach(p => {
    if (p.id) seenPropertyIds.push(String(p.id));
    const card = document.createElement("div");
    card.className = "cha-property-card";
    card.dataset.propertyId = p.id || "";
    if (leadState.likedProperty?.id && leadState.likedProperty.id === p.id) {
      card.classList.add("is-liked");
    }

    if (p.imageUrl) {
      const img = document.createElement("img");
      img.src = p.imageUrl;
      img.alt = p.title || "Property";
      img.className = "cha-property-img";
      card.append(img);
    }

    const info = document.createElement("div");
    info.className = "cha-property-info";

    const title = document.createElement("div");
    title.className = "cha-property-title";
    title.textContent = p.title || "Premium Commercial Space";

    const meta = document.createElement("div");
    meta.className = "cha-property-meta";
    meta.textContent = [p.location, p.price].filter(Boolean).join(" • ");

    const extra = document.createElement("div");
    extra.className = "cha-property-meta";
    extra.textContent = [p.size, p.summary].filter(Boolean).join(" • ");

    const actions = document.createElement("div");
    actions.className = "cha-property-vote";

    const likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = "cha-vote-like";
    likeBtn.textContent = "👍 Like It";
    likeBtn.addEventListener("click", () => onLikeProperty(p, card));

    const dislikeBtn = document.createElement("button");
    dislikeBtn.type = "button";
    dislikeBtn.className = "cha-vote-dislike";
    dislikeBtn.textContent = "👎 Not Like";
    dislikeBtn.addEventListener("click", () => onDislikeProperty(deck, pair, p));

    actions.append(likeBtn, dislikeBtn);
    info.append(title, meta, extra, actions);
    card.append(info);
    deck.append(card);
  });
  scrollToBottom();
}

function renderLikedAttachment(property) {
  const box = lead.querySelector(".cha-liked-box");
  if (!box) return;
  if (!property) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <img src="${property.imageUrl || ""}" alt="${property.title || "Liked property"}">
    <div class="cha-liked-copy">
      <em>Liked property</em>
      <strong>${property.title || "Selected space"}</strong>
      <span>${[property.location, property.price].filter(Boolean).join(" • ")}</span>
    </div>
    <button type="button" class="cha-liked-clear">Change</button>
  `;
  box.querySelector(".cha-liked-clear").addEventListener("click", () => {
    leadState.likedProperty = null;
    persist();
    renderLikedAttachment(null);
    document.querySelectorAll(".cha-property-card.is-liked").forEach(el => el.classList.remove("is-liked"));
    updateWhatsAppLink();
  });
}

function onLikeProperty(property, card) {
  leadState.likedProperty = {
    id: property.id || "",
    title: property.title || "",
    location: property.location || "",
    price: property.price || "",
    imageUrl: property.imageUrl || "",
    size: property.size || "",
    summary: property.summary || ""
  };
  persist();
  document.querySelectorAll(".cha-property-card.is-liked").forEach(el => el.classList.remove("is-liked"));
  if (card) card.classList.add("is-liked");
  lead.classList.add("show");
  fillLeadForm();
  renderLikedAttachment(leadState.likedProperty);
  updateWhatsAppLink();
}

function renderExpertHandoffPrompt(messageId) {
  const id = messageId || nextMessageId("bot");
  render("bot", NO_CATEGORY_MATCH_REPLY, [], [], id);
  const last = history[history.length - 1];
  if (!last || last.role !== "assistant" || last.content !== NO_CATEGORY_MATCH_REPLY) {
    history.push({ role: "assistant", content: NO_CATEGORY_MATCH_REPLY, sources: [], properties: [], messageId: id });
  }
  leadState.awaitingExpertHandoff = true;
  persist();
  updateChips();
}

async function onDislikeProperty(deck, currentProperties, rejectedProperty) {
  ensureDislikeCategory();
  dislikeAttempts += 1;
  const activeDeck = getActiveDeck(deck);
  const rejectedId = rejectedProperty?.id || (currentProperties || []).map(p => p.id).filter(Boolean)[0];
  const excludeIds = [...new Set([
    ...(leadState.rejectedPropertyIds || []),
    ...seenPropertyIds,
    ...(currentProperties || []).map(p => p.id).filter(Boolean),
    rejectedId
  ].filter(Boolean).map(String))];
  leadState.rejectedPropertyIds = excludeIds;
  leadState.rejectedProperties = excludeIds;
  persist();
  saveDraftLead();
  activeDeck.innerHTML = "";

  try {
    const response = await fetch(`${endpoint}/search-properties`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: {
          category: leadState.category || leadState.officeType,
          officeType: leadState.officeType,
          location: leadState.location,
          budget: leadState.budget,
          teamSize: leadState.teamSize
        },
        excludeIds
      })
    });
    const data = response.ok ? await response.json() : { properties: [] };
    const next = (Array.isArray(data.properties) ? data.properties : []).slice(0, 2);
    if (!next.length) {
      renderExpertHandoffPrompt();
      return;
    }
    renderPropertyCards(next, activeDeck);
  } catch (error) {
    console.error("Property refresh failed", error);
    renderExpertHandoffPrompt();
  }
}

function renderSources(sources) {
  if (!sources || !sources.length) return;
  const list = document.createElement("div");
  list.className = "cha-sources";
  list.append("Sources: ");
  sources.forEach((source, index) => {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = source.title;
    list.append(link);
    if (index < sources.length - 1) list.append(" | ");
  });
  messages.append(list);
}

function render(role, text, sources = [], properties = [], messageId = null) {
  const cleanText = String(text || "").trim();
  const id = messageId || nextMessageId(role);

  const existing = messages.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
  if (existing) {
    if (cleanText) existing.textContent = cleanText;
    return existing;
  }

  if (role === "user") {
    const lastMsg = messages.lastElementChild;
    if (lastMsg && lastMsg.classList.contains("user") && lastMsg.textContent.trim() === cleanText && cleanText) {
      return lastMsg;
    }
  } else if (role === "bot" && cleanText) {
    const lastMsg = messages.lastElementChild;
    if (lastMsg && lastMsg.classList.contains("bot") && lastMsg.dataset.msgId === id) {
      lastMsg.textContent = cleanText;
      return lastMsg;
    }
  }

  const message = document.createElement("div");
  message.className = `cha-message ${role}`;
  message.dataset.msgId = id;
  message.textContent = text;
  messages.append(message);
  if (properties && properties.length) renderPropertyCards(properties);
  renderSources(sources);
  scrollToBottom();
  return message;
}

function fillLeadForm() {
  if (leadState.name) lead.querySelector('[name="name"]').value = leadState.name;
  if (leadState.phone) lead.querySelector('[name="phone"]').value = leadState.phone;
  if (leadState.email) lead.querySelector('[name="email"]').value = leadState.email;
  if (leadState.company) lead.querySelector('[name="company"]').value = leadState.company;
  if (leadState.officeType) lead.querySelector('[name="officeType"]').value = leadState.officeType;
  if (leadState.location) lead.querySelector('[name="location"]').value = leadState.location;
  if (leadState.teamSize) lead.querySelector('[name="teamSize"]').value = leadState.teamSize;
  if (leadState.budget) lead.querySelector('[name="budget"]').value = leadState.budget;
  if (leadState.timeline || leadState.moveInDate) lead.querySelector('[name="timeline"]').value = leadState.timeline || leadState.moveInDate;
  renderLikedAttachment(leadState.likedProperty || null);
}

if (enquirySent) {
  render("bot", localStorage.getItem(thanksKey) || "Thank you. Your enquiry is booked — our leasing team will take it from here.");
} else {
  const cleanHistory = [];
  history.forEach(item => {
    const last = cleanHistory[cleanHistory.length - 1];
    if (!last || last.role !== item.role || String(last.content || "").trim() !== String(item.content || "").trim()) {
      cleanHistory.push(item);
    }
  });
  history = cleanHistory;
  persist();
  history.forEach(item => render(item.role, item.content, item.sources || [], item.properties || [], item.messageId || nextMessageId(item.role)));
  if (!history.length) {
    render("bot", "Hi, I’m Ava — I can help you find the right commercial space. What would you like to explore?");
  }
}
updateChips();
if (!enquirySent && leadState.officeType && !hasContact()) {
  showInlineContactForm();
}
if (leadState.likedProperty && !enquirySent) {
  lead.classList.add("show");
  fillLeadForm();
}

function enquiryMessage(state = leadState) {
  const summary = [
    state.officeType || "commercial space",
    state.location ? `in ${state.location}` : "",
    state.teamSize || state.requiredArea ? `for ${state.teamSize || state.requiredArea}` : ""
  ].filter(Boolean).join(" ");
  const extras = [
    state.budget ? `Budget: ${state.budget}` : "",
    state.timeline || state.moveInDate ? `Timeline: ${state.timeline || state.moveInDate}` : "",
    state.company ? `Company: ${state.company}` : ""
  ].filter(Boolean);
  const requirement = [summary, ...extras].filter(Boolean).join(". ");
  const liked = state.likedProperty || {};
  const likedLines = liked.title
    ? [
        `*Liked Property:* ${liked.title}${liked.location ? ` (${liked.location})` : ""}`,
        liked.price ? `*Price:* ${liked.price}` : "",
        liked.imageUrl ? `*Image:* ${liked.imageUrl}` : ""
      ].filter(Boolean)
    : [];
  return [
    "*New Inquiry from CityHub Leasing Website*",
    "",
    `*Name:* ${state.name || "—"}`,
    `*Email:* ${state.email || "—"}`,
    `*Phone:* ${String(state.phone || "").replace(/\D/g, "") || "—"}`,
    `*Message:* ${requirement || "AI website enquiry"}`,
    ...likedLines
  ].join("\n");
}

function updateWhatsAppLink(customText) {
  const msg = customText || enquiryMessage();
  waHandoffBtn.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
}

waHandoffBtn.addEventListener("click", updateWhatsAppLink);

function localReply(question) {
  const isHi = /[\u0900-\u097F]/.test(question) || /\b(namaste|kaise|kya|dhanyawad|shukriya|alvida)\b/i.test(question);
  if (/thank/i.test(question)) return "You're welcome. Happy to help with the next detail whenever you're ready.";
  if (/bye|alvida/i.test(question)) return "Goodbye! I'm here whenever you want to continue your space search.";
  if (isHi) return "Namaste! Main Ava hoon — CityHub ki Leasing Master Agent. Aap kis tarah ka space dhoond rahe hain?";
  return "Hello! I'm Ava, your CityHub Leasing Master Agent. What kind of space are you looking for — Office, Coworking, Warehouse, or Showroom?";
}

async function readAnswer(response, messageId) {
  const contentType = response.headers.get("content-type") || "";
  const id = messageId || nextMessageId("bot");

  if (contentType.includes("application/json")) {
    const data = await response.json();
    return {
      text: data.answer || fallback,
      leadState: data.leadState || null,
      properties: data.properties || [],
      sources: data.sources || [],
      messageId: id
    };
  }

  const headerState = parseHeaderJson(response.headers.get("X-Lead-State"), null);
  const properties = parseHeaderJson(response.headers.get("X-Properties"), []);
  const sources = parseHeaderJson(response.headers.get("X-Sources"), []);

  const existing = messages.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
  const msgEl = existing || render("bot", "", [], [], id);
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullText = existing && existing.textContent.trim() ? existing.textContent : "";
  let buffer = "";
  const isSse = contentType.includes("text/event-stream");

  const flushSse = () => {
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const block of parts) {
      const data = block
        .split("\n")
        .filter(line => line.startsWith("data:"))
        .map(line => line.replace(/^data:\s?/, ""))
        .join("\n");
      if (!data || data === "[DONE]") continue;
      fullText += data;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      if (value) {
        buffer += decoder.decode(value, { stream: true });
        if (isSse) {
          flushSse();
        } else if (buffer) {
          fullText += buffer;
          buffer = "";
        }
        msgEl.textContent = fullText;
        scrollToBottom();
      }
    }

    buffer += decoder.decode();
    if (isSse) {
      if (buffer.trim()) {
        buffer += "\n\n";
        flushSse();
      }
    } else if (buffer) {
      fullText += buffer;
    }

    if (!fullText.trim()) {
      msgEl.textContent = fallback;
      fullText = fallback;
    } else {
      msgEl.textContent = fullText;
    }
    scrollToBottom();

    return {
      text: fullText,
      leadState: headerState,
      properties,
      sources,
      msgEl,
      messageId: id
    };
  } catch (err) {
    console.error("Stream reading error:", err);
    if (!msgEl.textContent.trim()) msgEl.textContent = fallback;
    return {
      text: msgEl.textContent.trim() || fallback,
      leadState: headerState,
      properties,
      sources,
      msgEl,
      messageId: id
    };
  }
}

async function ask(rawQuestion) {
  const displayQuestion = String(rawQuestion || "").trim();
  const question = resolveMessage(displayQuestion);
  if (!question || busy) return;

  // One action → one in-flight request
  if (abortController) {
    try { abortController.abort(); } catch {}
  }
  const requestId = ++activeRequestId;
  const botMessageId = nextMessageId("bot");
  const userMessageId = nextMessageId("user");
  abortController = new AbortController();

  render("user", displayQuestion, [], [], userMessageId);
  history.push({ role: "user", content: question, messageId: userMessageId });
  persist();
  setBusy(true);
  typing.hidden = false;
  scrollToBottom();

  try {
    const timeoutId = setTimeout(() => abortController.abort(), 45000);

    const response = await fetch(`${endpoint}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        history,
        sessionId,
        leadState,
        likedProperty: leadState.likedProperty || null,
        rejectedProperties: leadState.rejectedPropertyIds || leadState.rejectedProperties || [],
        stream: true
      }),
      signal: abortController.signal
    });

    clearTimeout(timeoutId);
    if (requestId !== activeRequestId) return;
    typing.hidden = true;

    if (!response.ok) {
      let errorMsg = busyFallback;
      try {
        const errorData = await response.json();
        if (response.status === 429) {
          errorMsg = errorData.error || "I'm getting a lot of messages right now. Please wait a few seconds and try again.";
        } else if (errorData.error) {
          errorMsg = /too many requests/i.test(errorData.error) ? busyFallback : errorData.error;
        }
      } catch {}
      if (response.status === 404) {
        errorMsg = "Ava's backend is not running. In VS Code terminal run: npm run dev — then open http://localhost:8888";
      }
      throw new Error(errorMsg);
    }

    const result = await readAnswer(response, botMessageId);
    if (requestId !== activeRequestId) return;

    if ((!result.text || result.text === fallback) && response.ok) {
      const retry = await fetch(`${endpoint}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, history, sessionId, leadState, likedProperty: leadState.likedProperty || null, rejectedProperties: leadState.rejectedPropertyIds || [], stream: false }),
        signal: abortController.signal
      });
      if (retry.ok) {
        const jsonRetry = await retry.json().catch(() => null);
        if (jsonRetry?.answer) {
          if (result.msgEl) result.msgEl.textContent = jsonRetry.answer;
          result.text = jsonRetry.answer;
          result.leadState = jsonRetry.leadState || result.leadState;
          result.properties = jsonRetry.properties || result.properties;
          result.sources = jsonRetry.sources || result.sources;
        }
      }
    }

    if (result.leadState) {
      leadState = result.leadState;
      if (/leasing expert/i.test(question)) leadState.awaitingExpertHandoff = false;
      updateWhatsAppLink();
      persist();
      if (leadState.name && leadState.phone) saveDraftLead();
    }

    const existingBot = messages.querySelector(`[data-msg-id="${CSS.escape(botMessageId)}"]`);
    if (result.msgEl || existingBot) {
      const target = result.msgEl || existingBot;
      if (result.text && !target.textContent.trim()) target.textContent = result.text;
      if (result.properties && result.properties.length) {
        renderPropertyCards(result.properties);
      }
      if (result.sources && result.sources.length) {
        renderSources(result.sources);
      }
    } else {
      render("bot", result.text, result.sources, result.properties, botMessageId);
    }

    const last = history[history.length - 1];
    if (!last || last.role !== "assistant" || last.content !== result.text) {
      history.push({
        role: "assistant",
        content: result.text,
        sources: result.sources || [],
        properties: result.properties || [],
        messageId: botMessageId
      });
    }
    persist();

    updateChips();
    if (!hasContact() && (looksLikeContactPrompt(result.text) || leadState.officeType)) {
      showInlineContactForm();
    }
  } catch (err) {
    if (requestId !== activeRequestId) return;
    typing.hidden = true;
    if (err.name === "AbortError") return;
    console.error("Chat error:", err);
    const existingBot = messages.querySelector(`[data-msg-id="${CSS.escape(botMessageId)}"]`);
    if (existingBot && existingBot.textContent.trim() && existingBot.textContent.trim() !== fallback) {
      const last = history[history.length - 1];
      if (!last || last.role !== "assistant") {
        history.push({ role: "assistant", content: existingBot.textContent, sources: [], properties: [], messageId: botMessageId });
        persist();
      }
    } else {
      await recoverConversation(question, botMessageId);
    }
  } finally {
    if (requestId === activeRequestId) {
      setBusy(false);
      abortController = null;
      scrollToBottom();
    }
  }
}

function applyLocalSlots(question) {
  const q = String(question || "").toLowerCase();
  const mentionsWarehouse = /warehouse/.test(q);
  const mentionsShowroom = /showroom|retail/.test(q);
  if (mentionsWarehouse && mentionsShowroom) {
    leadState.exploreTrack = "warehouse_showroom";
  } else if (/cowork/.test(q)) { leadState.officeType = "Coworking"; leadState.category = "Coworking"; }
  else if (/meeting room/.test(q)) { leadState.officeType = "Meeting Room"; leadState.category = "Office"; }
  else if (/warehouse/.test(q) || /^warehouses?$/.test(q.trim())) { leadState.officeType = "Warehouse"; leadState.category = "Warehouse"; }
  else if (/showroom|retail/.test(q) || /^showrooms?$/.test(q.trim())) { leadState.officeType = "Showroom"; leadState.category = "Showroom"; }
  else if (/office/.test(q)) { leadState.officeType = "Private Office"; leadState.category = "Office"; }
  if (leadState.officeType && !leadState.category) {
    if (/warehouse/i.test(leadState.officeType)) leadState.category = "Warehouse";
    else if (/showroom/i.test(leadState.officeType)) leadState.category = "Showroom";
    else if (/cowork/i.test(leadState.officeType)) leadState.category = "Coworking";
    else leadState.category = "Office";
  }
  if (/mohali/.test(q)) leadState.location = "Mohali";
  else if (/chandigarh/.test(q)) leadState.location = "Chandigarh";
  else if (/airport road/.test(q)) leadState.location = "Airport Road";
  else if (/it city|it park/.test(q)) leadState.location = "IT City";
  else if (/zirakpur/.test(q)) leadState.location = "Zirakpur";
  else if (/panchkula/.test(q)) leadState.location = "Panchkula";
  if (/20\+|20 or more/.test(q)) leadState.teamSize = "20+ people";
  else if (/15 people/.test(q)) leadState.teamSize = "15 people";
  else if (/10 people/.test(q)) leadState.teamSize = "10 people";
  else if (/5 people/.test(q)) leadState.teamSize = "5 people";
  if (/under\s*₹?\s*50\s*k/.test(q)) leadState.budget = "Under ₹50K";
  else if (/₹?\s*50\s*k\s*[–\-to]+\s*₹?\s*1\s*l/.test(q)) leadState.budget = "₹50K–₹1L";
  else if (/₹?\s*1\s*l\s*[–\-to]+\s*₹?\s*3\s*l/.test(q)) leadState.budget = "₹1L–₹3L";
  else if (/₹?\s*3\s*l\s*[–\-to]+\s*₹?\s*5\s*l/.test(q)) leadState.budget = "₹3L–₹5L";
  else if (/₹?\s*5\s*l\+/.test(q)) leadState.budget = "₹5L+";
  if (/under 500 sq/.test(q)) leadState.requiredArea = "Under 500 sq ft";
  else if (/10,?\s*000\+\s*sq/.test(q)) leadState.requiredArea = "10,000+ sq ft";
  else if (/5,?\s*000\s*[–\-to]+\s*10,?\s*000\s*sq/.test(q)) leadState.requiredArea = "5,000–10,000 sq ft";
  else if (/2,?\s*000\s*[–\-to]+\s*5,?\s*000\s*sq/.test(q)) leadState.requiredArea = "2,000–5,000 sq ft";
  else if (/1,?\s*000\s*[–\-to]+\s*2,?\s*000\s*sq/.test(q)) leadState.requiredArea = "1,000–2,000 sq ft";
  else if (/500\s*[–\-to]+\s*1,?\s*000\s*sq/.test(q)) leadState.requiredArea = "500–1,000 sq ft";
  if (leadState.requiredArea) leadState.sqft = leadState.requiredArea;
  if (/not sure/.test(q)) {
    if (!leadState.requiredArea && (leadState.officeType === "Warehouse" || leadState.officeType === "Showroom")) {
      leadState.requiredArea = "Not Sure";
      leadState.sqft = "Not Sure";
    } else if (!leadState.budget) leadState.budget = "Not Sure";
  }
  const phoneMatch = String(question || "").match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
  if (phoneMatch && !leadState.phone) {
    const phoneRes = validatePhone(phoneMatch[0]);
    if (phoneRes.valid) leadState.phone = phoneRes.normalized;
  }
  if (!leadState.name && leadState.officeType) {
    const leftover = String(question || "")
      .replace(phoneMatch ? phoneMatch[0] : "", " ")
      .replace(/\b(my name is|i am|i'm|this is|name is|phone|number|and|please|hi|hello)\b/gi, " ")
      .replace(/[,\-:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const nameRes = validateName(leftover);
    if (nameRes.valid && !/\b(mohali|chandigarh|office|warehouse|showroom|cowork|budget|people|space|immediate|sure|visit)\b/i.test(leftover)) {
      leadState.name = nameRes.normalized;
    }
  }
  if (/immediately/.test(q)) {
    leadState.timeline = "Immediate";
    leadState.moveInDate = "Immediate";
  } else if (/30 days/.test(q)) {
    leadState.timeline = "Within 30 days";
    leadState.moveInDate = "Within 30 days";
  }
}

function localNextReply() {
  if (!leadState.officeType) {
    return leadState.exploreTrack === "warehouse_showroom"
      ? "Would you like to explore warehouses or showrooms?"
      : "I can help you find an office, coworking desk, warehouse, or showroom. What would you like to explore?";
  }
  if (!hasContact()) {
    return CONTACT_PROMPT;
  }
  if (!leadState.location) return `Lovely — ${leadState.officeType.toLowerCase()} it is. Which area works best: Mohali, Chandigarh, or a specific corridor?`;
  if (!leadState.teamSize && leadState.officeType !== "Warehouse" && leadState.officeType !== "Showroom") {
    return `${leadState.location} works well. How many people should we plan for?`;
  }
  if (!leadState.requiredArea && (leadState.officeType === "Warehouse" || leadState.officeType === "Showroom")) {
    return `${leadState.location} is a strong fit. Roughly how many square feet do you need?`;
  }
  if (!leadState.budget) return `Got it${leadState.teamSize ? ` — ${leadState.teamSize}` : ""} in ${leadState.location}. What monthly budget should I work with?`;
  if (!leadState.timeline && !leadState.moveInDate) return "That budget is helpful. When would you like to move in?";
  return `Perfect — ${leadState.officeType.toLowerCase()} in ${leadState.location}. I can connect our leasing team and arrange a site visit whenever you're ready.`;
}

async function recoverConversation(question, messageId) {
  applyLocalSlots(question);
  persist();
  if (leadState.name && leadState.phone) saveDraftLead();
  const reply = localNextReply();
  const id = messageId || nextMessageId("bot");
  const existing = messages.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
  if (existing) {
    if (!existing.textContent.trim()) existing.textContent = reply;
  } else {
    const lastMsg = messages.lastElementChild;
    if (!(lastMsg && lastMsg.classList.contains("bot") && lastMsg.textContent.trim() === reply)) {
      render("bot", reply, [], [], id);
    }
  }
  const last = history[history.length - 1];
  if (!last || last.role !== "assistant" || last.content !== reply) {
    history.push({ role: "assistant", content: reply, sources: [], properties: [], messageId: id });
    persist();
  }
  updateChips();
  if (!hasContact() && looksLikeContactPrompt(reply)) {
    showInlineContactForm();
  }
  if (hasContact() && (leadState.officeType || leadState.location)) {
    try {
      const res = await fetch(`${endpoint}/search-properties`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: {
            category: leadState.category || leadState.officeType,
            officeType: leadState.officeType,
            location: leadState.location,
            budget: leadState.budget,
            teamSize: leadState.teamSize
          },
          excludeIds: leadState.rejectedPropertyIds || []
        })
      });
      const data = res.ok ? await res.json() : {};
      if (Array.isArray(data.properties) && data.properties.length) {
        renderPropertyCards(data.properties);
      }
    } catch {}
  }
}

launcher.addEventListener("click", () => {
  panel.classList.toggle("open");
  updateWhatsAppLink();
});
document.querySelector("[data-close]").addEventListener("click", () => panel.classList.remove("open"));
document.querySelector("[data-clear]").addEventListener("click", () => {
  activeRequestId += 1;
  if (abortController) {
    try { abortController.abort(); } catch {}
    abortController = null;
  }
  enquirySent = false;
  localStorage.removeItem(sentKey);
  localStorage.removeItem(thanksKey);
  history = [];
  leadState = {};
  resetDislikeTracking();
  sessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  persist();
  messages.innerHTML = "";
  lead.classList.remove("show");
  renderLikedAttachment(null);
  setBusy(false);
  render("bot", "Hi, I’m Ava — I can help you find the right commercial space. What would you like to explore?");
  updateChips();
  updateWhatsAppLink();
});

if (form) {
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (busy) return;
    const input = event.currentTarget.querySelector("input");
    const question = input.value.trim();
    if (question) {
      input.value = "";
      ask(question);
    }
  });
}

lead.addEventListener("submit", async event => {
  event.preventDefault();
  if (enquirySent) return;
  const submitData = Object.fromEntries(new FormData(lead));
  submitData.sessionId = sessionId;
  submitData.history = history;
  submitData.fullTranscript = history;
  submitData.likedProperty = leadState.likedProperty || null;
  submitData.rejectedProperties = leadState.rejectedPropertyIds || [];
  submitData.category = leadState.category || submitData.officeType || "";
  submitData.sqft = leadState.sqft || leadState.requiredArea || "";
  submitData.moveIn = leadState.moveInDate || leadState.timeline || "";

  const submitBtn = lead.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";

  try {
    const response = await fetch(`${endpoint}/lead`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submitData)
    });

    let message = "Thank you. Our leasing team has received your details and will contact you shortly.";
    let result = {};
    if (!response.ok) {
      message = "We could not save your request. Please call +91 76965 10579.";
    } else {
      result = await response.json().catch(() => ({}));
      if (result?.lead?.name) {
        message = `Thank you ${result.lead.name}. Your enquiry is booked.`;
      }
    }
    if (!response.ok) {
      render("bot", message);
      return;
    }

    enquirySent = true;
    lead.reset();
    lead.classList.remove("show");
    leadState = { ...leadState, ...submitData };
    const enquiryText = result.message || enquiryMessage(leadState);
    updateWhatsAppLink(enquiryText);
    if (!result.alreadyNotified) {
      window.open(result.whatsappUrl || `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(enquiryText)}`, "_blank", "noopener");
    }
    history = [];
    persist();
    localStorage.setItem(thanksKey, message);
    messages.innerHTML = "";
    render("bot", message);
    updateChips();
  } catch (err) {
    console.error("Lead submission error:", err);
    render("bot", "We could not save your request. Please call +91 76965 10579.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send request";
  }
});

window.CityHubAva = {
  open() { panel.classList.add("open"); },
  ask(question) {
    panel.classList.add("open");
    ask(question);
  }
};

}
