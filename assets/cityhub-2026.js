(() => {
  if (window.__cityhub2026) return;
  window.__cityhub2026 = true;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isAdmin = /admin/i.test(location.pathname);

  const openAria = (propertyContext) => {
    if (propertyContext && window.CityHubAria?.setContext) {
      window.CityHubAria.setContext(propertyContext);
    }
    if (window.CityHubAria?.open) {
      window.CityHubAria.open();
      return;
    }
    if (window.CityHubAva?.open) {
      window.CityHubAva.open();
      return;
    }
    const launcher = document.querySelector(".aria-launcher, .cha-launcher");
    const panel = document.querySelector(".aria-panel, .cha-panel");
    if (panel && !panel.classList.contains("open") && launcher) launcher.click();
  };

  const openAva = (prompt) => {
    if (window.CityHubAria?.ask && prompt) {
      window.CityHubAria.ask(prompt);
      return;
    }
    if (window.CityHubAva?.ask && prompt) {
      window.CityHubAva.ask(prompt);
      return;
    }
    openAria();
    if (prompt && window.CityHubAria?.ask) window.CityHubAria.ask(prompt);
  };

  const insights = [
    { icon: "ph-sparkle", title: "Find a private office", sub: "Mohali & Chandigarh", prompt: "I'm interested in office space." },
    { icon: "ph-users-three", title: "Coworking for teams", sub: "Desks & cabins", prompt: "I'm interested in coworking space." },
    { icon: "ph-warehouse", title: "Warehouse near IT City", sub: "Industrial storage", prompt: "I'm looking for a warehouse." },
    { icon: "ph-storefront", title: "Showroom on a main road", sub: "Retail-ready", prompt: "I'm looking for a showroom / retail space." },
    { icon: "ph-calendar", title: "Schedule a visit", sub: "Usually within 24 hours", prompt: "I want to book a site visit." }
  ];

  function mesh() {
    if (reduced || isAdmin) return;
    const canvas = document.createElement("canvas");
    canvas.id = "ch26-mesh";
    document.body.prepend(canvas);
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, mx = 0.5, my = 0.35, t = 0;
    const resize = () => {
      w = canvas.width = innerWidth;
      h = canvas.height = innerHeight;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", (e) => {
      mx = e.clientX / w;
      my = e.clientY / h;
    }, { passive: true });
    const blobs = [
      { x: 0.2, y: 0.2, r: 280, c: "212,168,83" },
      { x: 0.8, y: 0.15, r: 240, c: "18,24,36" },
      { x: 0.55, y: 0.75, r: 260, c: "184,134,58" }
    ];
    const draw = () => {
      t += 0.004;
      ctx.clearRect(0, 0, w, h);
      blobs.forEach((b, i) => {
        const x = (b.x + Math.sin(t + i) * 0.06 + (mx - 0.5) * 0.08) * w;
        const y = (b.y + Math.cos(t * 0.9 + i) * 0.05 + (my - 0.5) * 0.08) * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
        g.addColorStop(0, `rgba(${b.c},0.28)`);
        g.addColorStop(1, "rgba(7,7,10,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(draw);
    };
    draw();
  }

  function injectInsights() {
    if (isAdmin || document.querySelector(".ch26-insights")) return;
    const host = document.querySelector(".ticker-section") || document.querySelector("header.hero") || document.querySelector("nav");
    if (!host) return;
    const wrap = document.createElement("div");
    wrap.className = "ch26-insights";
    wrap.innerHTML = `<div class="ch26-insights-inner">${insights.map((item) =>
      `<button type="button" class="ch26-chip" data-prompt="${item.prompt}"><i class="ph ${item.icon}"></i><span>${item.title}<small>${item.sub}</small></span></button>`
    ).join("")}</div>`;
    host.insertAdjacentElement("afterend", wrap);
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-prompt]");
      if (btn) openAva(btn.getAttribute("data-prompt"));
    });
  }

  function injectDock() {
    if (isAdmin || document.querySelector(".ch26-dock")) return;
    const dock = document.createElement("div");
    dock.className = "ch26-dock";
    dock.setAttribute("role", "navigation");
    dock.setAttribute("aria-label", "Quick conversions");
    dock.innerHTML = `
      <a href="${document.getElementById("spaces") ? "#spaces" : "index.html#spaces"}">Explore</a>
      <a class="primary" href="contact.html">Enquire</a>
      <a href="tel:+917696510579">Call</a>
      <a href="https://wa.me/917696510579?text=Hi%20CityHub%2C%20I%20want%20to%20enquire%20about%20a%20space." target="_blank" rel="noopener">WhatsApp</a>
      <a href="#" data-aria data-ava>AI ARIA ⚡</a>
    `;
    dock.addEventListener("click", (e) => {
      const a = e.target.closest("[data-aria], [data-ava]");
      if (!a) return;
      e.preventDefault();
      openAria();
    });
    document.body.appendChild(dock);
  }

  function tiltCards() {
    if (reduced || innerWidth < 900) return;
    document.querySelectorAll(".space-card, .location-card, .property-card").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.transform = `perspective(1000px) rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 10}deg)`;
        card.style.setProperty("--gx", `${x * 100}%`);
        card.style.setProperty("--gy", `${y * 100}%`);
        card.style.boxShadow = `0 0 0 1px rgba(139,92,246,0.45), ${(x - 0.5) * 40}px ${(y - 0.5) * 40}px 50px rgba(6,182,212,0.18)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
        card.style.boxShadow = "";
      });
    });
  }

  function magnetic() {
    if (reduced || innerWidth < 900) return;
    document.querySelectorAll(".btn-primary, .btn-gold, .nav-cta").forEach((btn) => {
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * 0.18}px, ${y * 0.18}px)`;
      });
      btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });
    });
  }

  function cursor() {
    if (reduced || innerWidth < 900 || isAdmin) return;
    const el = document.createElement("div");
    el.className = "ch26-cursor";
    document.body.appendChild(el);
    window.addEventListener("pointermove", (e) => {
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
    }, { passive: true });
    document.addEventListener("pointerover", (e) => {
      if (e.target.closest("a, button, .space-card, .location-card, .property-card")) el.classList.add("hot");
    });
    document.addEventListener("pointerout", (e) => {
      if (e.target.closest("a, button, .space-card, .location-card, .property-card")) el.classList.remove("hot");
    });
  }

  function parallax() {
    if (reduced) return;
    const bg = document.getElementById("heroBg");
    if (!bg) return;
    window.addEventListener("scroll", () => {
      bg.style.transform = `translate3d(0, ${window.scrollY * 0.12}px, 0) scale(1.06)`;
    }, { passive: true });
  }

  function initCreInventory() {
    const form = document.getElementById("heroSpaceSearch");
    const cards = [...document.querySelectorAll(".property-card")];
    const empty = document.getElementById("propertyEmpty");
    const category = document.getElementById("filterCategory");
    const submarket = document.getElementById("filterSubmarket");
    const size = document.getElementById("filterSize");
    if (!form || !cards.length) return;

    const params = new URLSearchParams(location.search);
    ["category", "submarket", "size"].forEach((key) => {
      const el = document.getElementById(`filter${key[0].toUpperCase()}${key.slice(1)}`);
      if (el && params.get(key)) el.value = params.get(key);
    });

    const apply = () => {
      const cat = category.value;
      const sub = submarket.value;
      const sz = size.value;
      let shown = 0;
      cards.forEach((card) => {
        const ok =
          (!cat || card.dataset.category === cat) &&
          (!sub || card.dataset.submarket === sub) &&
          (!sz || card.dataset.size === sz);
        card.classList.toggle("is-hidden", !ok);
        if (ok) shown += 1;
      });
      if (empty) empty.classList.toggle("is-visible", shown === 0);
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      apply();
      document.getElementById("spaces")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    apply();
  }

  document.addEventListener("DOMContentLoaded", () => {
    mesh();
    injectInsights();
    injectDock();
    cursor();
    parallax();
    tiltCards();
    magnetic();
    initCreInventory();
  });
  window.addEventListener("load", () => document.body.classList.add("ch26-ready"));
})();
