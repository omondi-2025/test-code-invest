(function () {
  if (!("serviceWorker" in navigator)) return;

  window.__villaDeferredPrompt = null;

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    window.__villaDeferredPrompt = event;
    window.dispatchEvent(new CustomEvent("villa-install-available"));
  });

  window.addEventListener("appinstalled", function () {
    window.__villaDeferredPrompt = null;
    window.dispatchEvent(new CustomEvent("villa-app-installed"));
  });

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function (err) {
      console.error("Service worker registration failed", err);
    });
  });
})();
