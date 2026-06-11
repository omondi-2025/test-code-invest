/* Villa Cash — shared auth + API helper.
   Include with <script src="api.js"></script> BEFORE any page script
   that talks to the API. */
(function () {
  const APP_VERSION = "8";
  const AUTH_KEY = "vc_auth";
  const REMEMBER_KEY = "vc_remember";
  const EMAIL_KEY = "vc_email";
  const VERSION_KEY = "vc_ver";

  // ── One-time upgrade: purge stale caches & pre-JWT sessions ─────────────
  (function upgradeApp() {
    if (localStorage.getItem(VERSION_KEY) === APP_VERSION) return;

    localStorage.setItem(VERSION_KEY, APP_VERSION);

    // Pre-JWT sessions stored user without token — clear them
    [localStorage, sessionStorage].forEach(function (s) {
      if (s.getItem("user") && !s.getItem("token")) {
        s.removeItem("user");
        s.removeItem("token");
        s.removeItem(AUTH_KEY);
      }
    });

    if (!("serviceWorker" in navigator)) return;
    if (sessionStorage.getItem("vc_reload_" + APP_VERSION)) return;

    sessionStorage.setItem("vc_reload_" + APP_VERSION, "1");
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) { return r.unregister(); }));
    }).then(function () {
      if (!("caches" in window)) { location.reload(); return; }
      return caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      });
    }).then(function () {
      location.reload();
    }).catch(function () {
      location.reload();
    });
  })();

  function activeStorage() {
    if (localStorage.getItem(AUTH_KEY) === "local") return localStorage;
    if (sessionStorage.getItem(AUTH_KEY) === "session") return sessionStorage;

    if (localStorage.getItem("token") && localStorage.getItem("user")) {
      localStorage.setItem(AUTH_KEY, "local");
      return localStorage;
    }
    if (sessionStorage.getItem("token") && sessionStorage.getItem("user")) {
      sessionStorage.setItem(AUTH_KEY, "session");
      return sessionStorage;
    }
    return null;
  }

  const VillaAuth = {
    getToken() {
      const store = activeStorage();
      return store ? store.getItem("token") : null;
    },

    getUser() {
      try {
        const store = activeStorage();
        if (!store) return null;
        const raw = store.getItem("user");
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

    isPersistent() {
      return localStorage.getItem(AUTH_KEY) === "local";
    },

    save(token, user, persist) {
      VillaAuth.clear();
      const store = persist ? localStorage : sessionStorage;
      store.setItem(AUTH_KEY, persist ? "local" : "session");
      store.setItem("token", token);
      store.setItem("user", JSON.stringify(user));

      if (persist && user && user.email) {
        localStorage.setItem(REMEMBER_KEY, "1");
        localStorage.setItem(EMAIL_KEY, user.email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(EMAIL_KEY);
      }
    },

    getLoginPrefs() {
      return {
        remember: localStorage.getItem(REMEMBER_KEY) === "1",
        email: localStorage.getItem(EMAIL_KEY) || "",
      };
    },

    applyLoginPrefs() {
      const prefs = VillaAuth.getLoginPrefs();
      const emailEl = document.getElementById("email");
      const rememberEl = document.getElementById("rememberMe");
      if (emailEl && prefs.email) emailEl.value = prefs.email;
      if (rememberEl) rememberEl.checked = prefs.remember;
    },

    updateUser(user) {
      const store = activeStorage();
      if (store) store.setItem("user", JSON.stringify(user));
    },

    clear() {
      [localStorage, sessionStorage].forEach(function (s) {
        s.removeItem("token");
        s.removeItem("user");
        s.removeItem(AUTH_KEY);
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

    guard() {
      if (!VillaAuth.isLoggedIn()) {
        document.documentElement.style.display = "none";
        window.location.replace("login.html");
        return false;
      }
      return true;
    },

    guardGuestOnly() {
      if (VillaAuth.isLoggedIn()) {
        document.documentElement.style.display = "none";
        window.location.replace("index.html");
        return false;
      }
      return true;
    },

    async fetch(url, options) {
      const opts = { ...options };
      opts.headers = { ...(options.headers || {}) };
      const token = VillaAuth.getToken();
      if (token) opts.headers["Authorization"] = "Bearer " + token;

      const res = await fetch(url, opts);
      if (res.status === 401) {
        VillaAuth.clear();
        if (!/\/login\.html|\/signup\.html/i.test(location.pathname)) {
          window.location.replace("login.html");
        }
        throw new Error("Unauthorized");
      }
      return res;
    },

    async postJSON(url, body) {
      const res = await VillaAuth.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      return res.json();
    },

    getCachedWallet() {
      const u = VillaAuth.getUser();
      return u ? Number(u.wallet || 0) : 0;
    },

    paintDashboard(u) {
      if (!u) return;
      const hour = new Date().getHours();
      const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      const wallet = parseFloat(u.wallet || 0).toFixed(2);

      const set = function (id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      set("greetingText", greeting + ",");
      set("userName", u.fullName || "Investor");
      set("userWallet", wallet);
      set("balanceStat", wallet);
      set("cashouts", parseFloat(u.cashouts || 0).toFixed(2));
      set("expenses", parseFloat(u.expenses || 0).toFixed(2));
      set("dailyIncome", parseFloat(u.dailyIncome || 0).toFixed(2));
    },

    paintWalletBalance(elId) {
      const el = document.getElementById(elId);
      if (!el) return;
      el.textContent = VillaAuth.getCachedWallet().toFixed(2);
    },

    async getJSON(url) {
      const res = await VillaAuth.fetch(url);
      return res.json();
    },

    fmtDate(value) {
      if (!value) return "—";
      const d = new Date(value);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("en-KE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    },

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
