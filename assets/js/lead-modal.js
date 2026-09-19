(function () {
  const WHATSAPP = "917696510579";
  const ENDPOINT = "/.netlify/functions/lead";
  const SLOTS = [
    { id: "Morning", hint: "9:00 AM – 12:00 PM" },
    { id: "Afternoon", hint: "12:00 PM – 4:00 PM" },
    { id: "Evening", hint: "4:00 PM – 7:00 PM" }
  ];
  const CATALOG = [
    { id: "mohali-8b-furnished-office", title: "Furnished 28-Desk Corporate Office — Phase 8B" },
    { id: "chd-itpark-furnished-office", title: "IT Park Glass-Cabin Tech Office" },
    { id: "mohali-8b-cowork", title: "Phase 8B Dedicated Desk Coworking" },
    { id: "chd-ind1-bareshell-office", title: "Bare-shell Business Floor — Industrial Area Phase 1" },
    { id: "chd-ind2-warehouse", title: "Fulfilment Warehouse — Industrial Area Phase 2" },
    { id: "mohali-sec82-showroom", title: "Highway Frontage Showroom — Sector 82 / Aerocity" },
    { id: "mohali-sec82-furnished-office", title: "Furnished Cabin Office — Sector 82" },
    { id: "mohali-sec82-warehouse", title: "Dock-Enabled Warehouse — Sector 82" },
    { id: "mohali-8b-warehouse", title: "Covered Warehouse — Phase 8B" }
  ];

  const state = {
    step: 1,
    propertyId: "",
    propertyTitle: "",
    visitDate: "",
    timeSlot: "Morning",
    submitting: false,
    lastLead: null
  };

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  function digitsPhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(-10);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(-10);
    return digits.slice(0, 10);
  }

  function validPhone(value) {
    return /^[6-9]\d{9}$/.test(digitsPhone(value));
  }

  function validEmail(value) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(String(value || "").trim());
  }

  function validName(value) {
    return /^[A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s.'-]{1,60}$/.test(String(value || "").trim());
  }

  function catalogFromPage() {
    const seen = new Map();
    document.querySelectorAll("[data-property-id]").forEach((el) => {
      const id = el.getAttribute("data-property-id");
      if (!id || seen.has(id)) return;
      const card = el.closest("[data-title]") || el;
      seen.set(id, { id, title: card.getAttribute("data-title") || el.getAttribute("data-property-title") || id });
    });
    CATALOG.forEach((item) => {
      if (!seen.has(item.id)) seen.set(item.id, item);
    });
    return [...seen.values()];
  }

  function injectStyles() {
    if (document.getElementById("ch-lead-modal-css")) return;
    const style = document.createElement("style");
    style.id = "ch-lead-modal-css";
    style.textContent = `
      .ch-lead[hidden]{display:none!important}
      .ch-lead{position:fixed;inset:0;z-index:13000;display:grid;place-items:center;padding:16px;background:rgba(8,10,16,.78);backdrop-filter:blur(10px)}
      .ch-lead__panel{width:min(520px,100%);max-height:min(92vh,760px);overflow:auto;padding:26px 24px 22px;border-radius:22px;background:rgba(13,14,21,.92);border:1px solid rgba(255,255,255,.08);color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55);backdrop-filter:blur(16px)}
      .ch-lead__kicker{color:#ccff00;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
      .ch-lead__panel h2{font-family:Syne,sans-serif;font-size:1.45rem;margin:6px 0 8px;letter-spacing:-.03em}
      .ch-lead__copy{color:#94a3b8;font-size:.95rem;margin-bottom:18px}
      .ch-lead__steps{display:flex;gap:8px;margin-bottom:18px}
      .ch-lead__steps span{flex:1;height:4px;border-radius:99px;background:rgba(255,255,255,.1)}
      .ch-lead__steps span.is-on{background:#ccff00}
      .ch-lead label{display:block;margin:12px 0 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#ccff00;font-weight:700}
      .ch-lead input,.ch-lead select{width:100%;min-height:48px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(3,3,5,.85);color:#fff;font:500 15px/1.3 "Plus Jakarta Sans",sans-serif}
      .ch-lead input:focus,.ch-lead select:focus{outline:2px solid rgba(204,255,0,.55);outline-offset:1px}
      .ch-lead__phone{display:flex;align-items:stretch}
      .ch-lead__cc{display:inline-flex;align-items:center;justify-content:center;min-width:64px;min-height:48px;padding:0 10px;border:1px solid rgba(255,255,255,.12);border-right:0;border-radius:12px 0 0 12px;background:rgba(204,255,0,.12);color:#ccff00;font-weight:700}
      .ch-lead__phone input{border-radius:0 12px 12px 0}
      .ch-lead__slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .ch-lead__slot{min-height:52px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#fff;cursor:pointer;font-weight:650;font-size:13px}
      .ch-lead__slot small{display:block;font-weight:500;opacity:.65;font-size:10px;margin-top:2px}
      .ch-lead__slot.is-on{border-color:#ccff00;background:rgba(204,255,0,.16);color:#ccff00}
      .ch-lead__err{min-height:18px;margin:10px 0 0;color:#ff8a8a;font-size:13px}
      .ch-lead__actions{display:flex;gap:8px;margin-top:18px}
      .ch-lead__actions button,.ch-lead__actions a{flex:1;min-height:48px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-weight:700;cursor:pointer;text-decoration:none;padding:10px 12px}
      .ch-lead__primary{border:0;background:#ccff00;color:#000}
      .ch-lead__ghost{border:1px solid rgba(204,255,0,.35);background:transparent;color:#fff}
      .ch-lead__success{text-align:center;padding:12px 4px 4px}
      .ch-lead__success code{display:inline-block;margin:10px 0 16px;padding:8px 12px;border-radius:10px;background:rgba(204,255,0,.12);color:#ccff00;letter-spacing:.08em;font-family:"JetBrains Mono",monospace}
      .ch-lead__wa{background:#1fad5a!important;color:#fff!important;border:0}
      @media (max-width:560px){.ch-lead__slots{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function el() {
    return document.getElementById("chLeadModal");
  }

  function render() {
    const root = el();
    if (!root) return;
    const options = catalogFromPage()
      .map((item) => `<option value="${item.id}" ${item.id === state.propertyId ? "selected" : ""}>${item.title}</option>`)
      .join("");
    const slots = SLOTS.map((slot) => `
      <button type="button" class="ch-lead__slot${state.timeSlot === slot.id ? " is-on" : ""}" data-slot="${slot.id}">
        ${slot.id}<small>${slot.hint}</small>
      </button>`).join("");

    if (state.lastLead) {
      root.innerHTML = `
        <div class="ch-lead__panel" role="dialog" aria-modal="true" aria-labelledby="chLeadTitle">
          <div class="ch-lead__success">
            <p class="ch-lead__kicker">Confirmed</p>
            <h2 id="chLeadTitle">Walkthrough requested</h2>
            <p class="ch-lead__copy">Our leasing desk has your preferred slot. Quote this ID if you call us.</p>
            <code>${state.lastLead.leadId}</code>
            <div class="ch-lead__actions">
              <a class="ch-lead__wa" href="${state.lastLead.whatsappUrl}" target="_blank" rel="noopener">Confirm on WhatsApp</a>
              <button type="button" class="ch-lead__ghost" data-close>Done</button>
            </div>
          </div>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="ch-lead__panel" role="dialog" aria-modal="true" aria-labelledby="chLeadTitle">
        <p class="ch-lead__kicker">CityHub Leasing</p>
        <h2 id="chLeadTitle">Schedule a Space Walkthrough</h2>
        <p class="ch-lead__copy">${state.propertyTitle ? `Preferred space: ${state.propertyTitle}.` : "Pick a date, slot, and space. We’ll confirm within 24 hours."}</p>
        <div class="ch-lead__steps" aria-hidden="true"><span class="${state.step >= 1 ? "is-on" : ""}"></span><span class="${state.step >= 2 ? "is-on" : ""}"></span></div>
        <form id="chLeadForm" novalidate>
          <div data-step="1" ${state.step === 1 ? "" : "hidden"}>
            <label for="chVisitDate">Preferred date</label>
            <input id="chVisitDate" name="visitDate" type="date" min="${todayISO()}" value="${state.visitDate || todayISO()}" required>
            <label>Time slot</label>
            <div class="ch-lead__slots">${slots}</div>
            <label for="chPropertyId">Property ID</label>
            <select id="chPropertyId" name="propertyId" required>${options}</select>
          </div>
          <div data-step="2" ${state.step === 2 ? "" : "hidden"}>
            <label for="chName">Full name</label>
            <input id="chName" name="name" autocomplete="name" required>
            <label for="chCompany">Business name</label>
            <input id="chCompany" name="company" autocomplete="organization" required>
            <label for="chEmail">Work email</label>
            <input id="chEmail" name="email" type="email" autocomplete="email" required>
            <label for="chPhone">Phone number</label>
            <div class="ch-lead__phone">
              <span class="ch-lead__cc">+91</span>
              <input id="chPhone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="11" placeholder="XXXXX XXXXX" required>
            </div>
          </div>
          <p class="ch-lead__err" data-err hidden></p>
          <div class="ch-lead__actions">
            ${state.step === 1
              ? `<button type="button" class="ch-lead__ghost" data-close>Cancel</button><button type="button" class="ch-lead__primary" data-next>Continue</button>`
              : `<button type="button" class="ch-lead__ghost" data-back>Back</button><button type="submit" class="ch-lead__primary" data-submit>Confirm walkthrough</button>`}
          </div>
      </form>
    </div>`;
    const phoneEl = root.querySelector("#chPhone");
    phoneEl?.addEventListener("input", () => {
      const d = digitsPhone(phoneEl.value);
      phoneEl.value = d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
    });
  }

  function setError(message) {
    const node = el()?.querySelector("[data-err]");
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || "";
  }

  function close() {
    const root = el();
    if (!root) return;
    root.hidden = true;
    document.body.style.overflow = "";
    state.step = 1;
    state.submitting = false;
    state.lastLead = null;
  }

  function open(opts = {}) {
    injectStyles();
    ensureRoot();
    state.step = 1;
    state.lastLead = null;
    state.submitting = false;
    state.propertyId = opts.propertyId || state.propertyId || catalogFromPage()[0]?.id || "";
    state.propertyTitle = opts.title || opts.propertyTitle || "";
    if (!state.propertyTitle) {
      const match = catalogFromPage().find((item) => item.id === state.propertyId);
      state.propertyTitle = match?.title || "";
    }
    state.visitDate = opts.visitDate || todayISO();
    state.timeSlot = opts.timeSlot || "Morning";
    render();
    const root = el();
    root.hidden = false;
    document.body.style.overflow = "hidden";
    root.querySelector("input, select, button")?.focus();
    const phoneEl = root.querySelector("#chPhone");
    phoneEl?.addEventListener("input", () => {
      const d = digitsPhone(phoneEl.value);
      phoneEl.value = d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
    });
  }

  async function submit(form) {
    if (state.submitting) return;
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const company = String(fd.get("company") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const phone = digitsPhone(fd.get("phone"));
    if (!validName(name)) return setError("Enter your full name.");
    if (company.length < 2) return setError("Enter your business name.");
    if (!validEmail(email)) return setError("Enter a valid work email.");
    if (!validPhone(phone)) return setError("Enter a valid 10-digit Indian mobile number (+91).");

    const payload = {
      source: "walkthrough",
      intent: "site_visit",
      name,
      company,
      email,
      phone,
      propertyId: state.propertyId,
      propertyTitle: state.propertyTitle,
      visitDate: state.visitDate,
      timeSlot: state.timeSlot,
      requirement: `Space walkthrough for ${state.propertyTitle || state.propertyId} on ${state.visitDate} (${state.timeSlot})`
    };

    const button = form.querySelector("[data-submit]");
    state.submitting = true;
    if (button) {
      button.disabled = true;
      button.textContent = "";
      button.innerHTML = '<span class="btn-spinner"></span> Booking…';
    }
    setError("");

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not book this walkthrough. Please try again.");
      }
      const leadId = data.leadId || "CH-PENDING";
      const text = encodeURIComponent(
        `Hi CityHub, walkthrough confirmed. Lead ${leadId}. ${name}, ${company}. ${state.propertyTitle || state.propertyId} on ${state.visitDate}, ${state.timeSlot}. Phone +91${phone}.`
      );
      state.lastLead = {
        leadId,
        whatsappUrl: data.whatsappUrl || `https://wa.me/${WHATSAPP}?text=${text}`
      };
      render();
    } catch (error) {
      setError(error.message || "Could not book this walkthrough.");
      if (button) {
        button.disabled = false;
        button.textContent = "Confirm walkthrough";
      }
    } finally {
      state.submitting = false;
    }
  }

  function onRootClick(event) {
    const root = el();
    if (event.target === root || event.target.closest("[data-close]")) {
      close();
      return;
    }
    const slot = event.target.closest("[data-slot]");
    if (slot) {
      state.timeSlot = slot.getAttribute("data-slot");
      root.querySelectorAll(".ch-lead__slot").forEach((btn) => btn.classList.toggle("is-on", btn === slot));
      return;
    }
    if (event.target.closest("[data-next]")) {
      const date = root.querySelector("#chVisitDate")?.value;
      const propertyId = root.querySelector("#chPropertyId")?.value;
      if (!date) return setError("Select a preferred date.");
      if (!propertyId) return setError("Select a property ID.");
      state.visitDate = date;
      state.propertyId = propertyId;
      const match = catalogFromPage().find((item) => item.id === propertyId);
      if (match) state.propertyTitle = match.title;
      state.step = 2;
      setError("");
      render();
      root.querySelector("#chName")?.focus();
      return;
    }
    if (event.target.closest("[data-back]")) {
      const form = root.querySelector("#chLeadForm");
      if (form) {
        state.visitDate = form.visitDate?.value || state.visitDate;
      }
      state.step = 1;
      render();
    }
  }

  function ensureRoot() {
    if (el()) return;
    const root = document.createElement("div");
    root.id = "chLeadModal";
    root.className = "ch-lead";
    root.hidden = true;
    document.body.appendChild(root);
    root.addEventListener("click", onRootClick);
    root.addEventListener("submit", (event) => {
      event.preventDefault();
      submit(event.target);
    });
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-tour], [data-walkthrough]");
    if (!trigger) return;
    event.preventDefault();
    const card = trigger.closest("[data-property-id], .property-card, .space-card, .listing-card");
    open({
      propertyId: trigger.getAttribute("data-property-id") || card?.getAttribute("data-property-id") || "",
      title: trigger.getAttribute("data-property-title") || card?.getAttribute("data-title") || card?.querySelector("h3")?.textContent || ""
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && el() && !el().hidden) close();
  });

  window.CityHubLeadModal = { open, close };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { injectStyles(); ensureRoot(); });
  } else {
    injectStyles();
    ensureRoot();
  }
})();
