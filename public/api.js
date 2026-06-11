/* Villa Cash — shared auth + API helper.
   Include with <script src="api.js"></script> BEFORE any page script
   that talks to the API. */
(function () {
  const STORAGE_KEYS = ["user"];

  function readRaw() {
    return localStorage.getItem("user") || sessionStorage.getItem("user") || null;
  }

  function usingSession() {
    return !localStorage.getItem("user") && !!sessionStorage.getItem("user");
  }

  const VillaAuth = {
    getToken() {
      return localStorage.getItem("token") || sessionStorage.getItem("token") || null;
    },

    getUser() {
      try {
        const raw = readRaw();
        if (!raw) return null;
        const u = JSON.parse(raw);
        if (u && u._id && !u.id) u.id = u._id;
        return u;
      } catch {
        VillaAuth.clear();
        return null;
      }
    },

    isLoggedIn() {
      const u = VillaAuth.getUser();
      return !!(u && u.id && VillaAuth.getToken());
    },

    // persist=true → localStorage (remember me); false → sessionStorage
    save(token, user, persist) {
      VillaAuth.clear();
      const store = persist ? localStorage : sessionStorage;
      store.setItem("token", token);
      store.setItem("user", JSON.stringify(user));
    },

    // Update the stored user object while keeping it in the same storage
    updateUser(user) {
      const store = usingSession() ? sessionStorage : localStorage;
      store.setItem("user", JSON.stringify(user));
    },

    clear() {
      [localStorage, sessionStorage].forEach((s) => {
        s.removeItem("token");
        s.removeItem("user");
      });
    },

    logout() {
      VillaAuth.clear();
      window.location.href = "login.html";
    },

    requireLogin() {
      if (!VillaAuth.isLoggedIn()) {
        window.location.href = "login.html";
        return false;
      }
      return true;
    },

    // Call from a <head> script on protected pages. Runs before the body
    // is parsed, so protected content is never painted for logged-out
    // visitors — the page is hidden instantly and replaced with login.
    guard() {
      if (!VillaAuth.isLoggedIn()) {
        document.documentElement.style.display = "none";
        window.location.replace("login.html");
        return false;
      }
      return true;
    },

    // Inverse guard for login/signup pages: bounce logged-in users home.
    guardGuestOnly() {
      if (VillaAuth.isLoggedIn()) {
        document.documentElement.style.display = "none";
        window.location.replace("index.html");
        return false;
      }
      return true;
    },

    // fetch wrapper that injects the bearer token and handles expiry
    async fetch(url, options = {}) {
      const opts = { ...options };
      opts.headers = { ...(options.headers || {}) };
      const token = VillaAuth.getToken();
      if (token) opts.headers["Authorization"] = "Bearer " + token;

      const res = await fetch(url, opts);
      if (res.status === 401) {
        VillaAuth.clear();
        window.location.href = "login.html";
        throw new Error("Unauthorized");
      }
      return res;
    },

    // convenience JSON POST
    async postJSON(url, body) {
      const res = await VillaAuth.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      return res.json();
    },

    // HTML-escape helper to prevent XSS when injecting user data
    esc(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },
  };

  window.VillaAuth = VillaAuth;
})();
