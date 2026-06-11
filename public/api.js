/* Villa Cash — shared auth + API helper.
   Include with <script src="api.js"></script> BEFORE any page script
   that talks to the API. */
(function () {
  const AUTH_KEY = "vc_auth";       // "local" | "session"
  const REMEMBER_KEY = "vc_remember"; // "1" when user chose remember me
  const EMAIL_KEY = "vc_email";     // last remembered email (login form only)

  function activeStorage() {
    if (localStorage.getItem(AUTH_KEY) === "local") return localStorage;
    if (sessionStorage.getItem(AUTH_KEY) === "session") return sessionStorage;

    // Legacy sessions created before vc_auth marker
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

    // persist=true → localStorage (survives browser restart)
    // persist=false → sessionStorage (cleared when tab/window closes)
    save(token, user, persist) {
      VillaAuth.clear();
      const store = persist ? localStorage : sessionStorage;
      store.setItem(AUTH_KEY, persist ? "local" : "session");
      store.setItem("token", token);
      store.setItem("user", JSON.stringify(user));

      // Login-form prefs live in localStorage regardless of session type
      if (persist && user && user.email) {
        localStorage.setItem(REMEMBER_KEY, "1");
        localStorage.setItem(EMAIL_KEY, user.email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(EMAIL_KEY);
      }
    },

    // Restore saved email + remember-me checkbox on the login page
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

    // Update cached user in whichever storage holds the active session
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
      // Keep vc_remember + vc_email — they're login-form prefs, not session data
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
        window.location.href = "login.html";
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
