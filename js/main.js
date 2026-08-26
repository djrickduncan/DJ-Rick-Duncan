/*
 * RICK DUNCAN / JUST:DJ — main.js
 * Progressive enhancement only. The site is fully usable with this file
 * absent (nav uses native <details>/<summary>, forms are plain HTML).
 * Keep this file small — target well under 15KB uncommpressed.
 */
(function () {
  "use strict";

  /* Flag JS availability for optional CSS hooks */
  document.documentElement.classList.add("js");

  /* Auto-update footer copyright year (falls back to static text in HTML) */
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* Close the mobile nav disclosure after a link is chosen, and on outside
     click / Escape. Desktop layout forces the nav open via CSS, so this
     only affects the collapsed (mobile/tablet) menu. */
  var navDisclosures = document.querySelectorAll(".nav-disclosure");

  navDisclosures.forEach(function (details) {
    var nav = details.querySelector(".site-nav");
    if (!nav) return;

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        details.removeAttribute("open");
      }
    });

    document.addEventListener("click", function (event) {
      if (details.hasAttribute("open") && !details.contains(event.target)) {
        details.removeAttribute("open");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && details.hasAttribute("open")) {
        details.removeAttribute("open");
        var summary = details.querySelector("summary");
        if (summary) summary.focus();
      }
    });
  });

  /* --------------------------------------------------------------------
   * PRIVACY-FRIENDLY ANALYTICS PLACEHOLDER
   * No analytics are loaded by default. If/when analytics are added,
   * prefer a privacy-friendly, cookie-free service (e.g. Plausible,
   * Fathom, Simple Analytics) and disclose it on privacy.html.
   * Example (uncomment and configure only when ready):
   *
   * var s = document.createElement("script");
   * s.defer = true;
   * s.dataset.domain = "example.com";
   * s.src = "https://plausible.io/js/script.js";
   * document.head.appendChild(s);
   * ------------------------------------------------------------------ */
})();
