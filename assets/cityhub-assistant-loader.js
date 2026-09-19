(() => {
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    if (!document.getElementById("aria-widget-root")) {
      const root = document.createElement("div");
      root.id = "aria-widget-root";
      document.body.append(root);
    }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/assets/css/chat-widget.css";
    document.head.append(css);
    const script = document.createElement("script");
    script.src = "/assets/js/chat-widget.js";
    script.defer = true;
    (document.body || document.documentElement).append(script);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }
})();
