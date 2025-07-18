document.addEventListener("DOMContentLoaded", () => {
  // Parse stored user
  let currentUser = null;
  try {
    const rawUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    currentUser = JSON.parse(rawUser);
  } catch {
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
  }

  // Redirect if already logged in and on auth pages
  if (currentUser?.id && /login\.html|signup\.html/i.test(location.pathname)) {
    location.href = "index.html";
    return;
  }

  // ====== SIGNUP ======
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fullName = document.getElementById("fullname").value.trim();
      const email = document.getElementById("email").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const password = document.getElementById("password").value.trim();
      const message = document.getElementById("signupMessage");

      if (!fullName || !email || !phone || !password) {
        return showMessage(message, "❗ Please fill in all fields.", "red");
      }

      const ref = new URLSearchParams(location.search).get("ref");

      try {
        const res = await fetch("/api/user/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fullName, email, phone, password, ref }),
});

        const data = await res.json();
        if (data?.success && (data?.user?._id || data?.user?.id)) {
  const userData = {
    id: data.user._id || data.user.id,
    fullName: data.user.fullName,
    email: data.user.email,
    phone: data.user.phone,
    wallet: data.user.wallet || 0,
    refCode: data.user.refCode || "",
  };

  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem("user", JSON.stringify(userData));

  showMessage(message, "✅ Login successful! Redirecting...", "green");
  setTimeout(() => location.href = "index.html", 1500);
} else {
          showMessage(message, `⚠️ ${data.message || "Signup failed."}`, "orange");
        }
      } catch (err) {
        console.error("Signup error:", err);
        showMessage(message, "🚫 Signup failed. Please try again later.", "red");
      }
    });
  }

  // ====== LOGIN ======
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      const rememberMe = document.getElementById("rememberMe")?.checked;
      const message = document.getElementById("loginMessage");

      if (!email || !password) {
        return showMessage(message, "❗ Please enter both email and password.", "red");
      }

      const res = await fetch("/api/user/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});

        const data = await res.json();
        if (data?.success && data?.user?.id) {
          const userData = {
            id: data.user.id,
            fullName: data.user.fullName,
            email: data.user.email,
            phone: data.user.phone,
            wallet: data.user.wallet || 0,
            refCode: data.user.refCode || "",
          };

          const storage = rememberMe ? localStorage : sessionStorage;
          storage.setItem("user", JSON.stringify(userData));

          showMessage(message, "✅ Login successful! Redirecting...", "green");
          setTimeout(() => location.href = "index.html", 1500);
        } else {
          showMessage(message, `🚫 ${data.message || "Login failed."}`, "red");
        }
      } catch (err) {
        console.error("Login error:", err);
        showMessage(message, "❌ Login error. Please try again.", "red");
      }
    });
  }

  // Message helper
  function showMessage(el, text, color = "black") {
    if (el) {
      el.textContent = text;
      el.style.color = color;
    }
  }
});