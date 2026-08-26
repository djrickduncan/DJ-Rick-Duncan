/*
 * RICK DUNCAN / JUST:DJ — main.js
 * Progressive enhancement only. The site is fully usable with this file
 * absent (nav uses native <details>/<summary>, forms are plain HTML, the
 * header is solid by default, and content is visible without motion).
 * Keep this file small — target well under 15KB uncompressed.
 */
(function () {
  "use strict";

  /* Flag JS availability for optional CSS hooks (e.g. reveal-on-scroll) */
  document.documentElement.classList.add("js");

  var reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

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

  /* Header goes solid once the page scrolls past the hero threshold.
     Only relevant on pages with a transparent-over-hero header
     (body.has-hero); other pages are solid by default via CSS alone. */
  var header = document.querySelector(".site-header");
  if (header && document.body.classList.contains("has-hero")) {
    var setHeaderState = function () {
      if (window.scrollY > 60) {
        header.classList.add("is-solid");
      } else {
        header.classList.remove("is-solid");
      }
    };
    setHeaderState();
    window.addEventListener("scroll", setHeaderState, { passive: true });
  }

  /* Subtle reveal-on-scroll for elements marked .reveal. Respects
     prefers-reduced-motion (skipped entirely) and degrades gracefully if
     IntersectionObserver is unavailable (reveal immediately). */
  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    if (reducedMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach(function (el) {
        el.classList.add("is-visible");
      });
    } else {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
      );
      revealEls.forEach(function (el) {
        observer.observe(el);
      });
    }
  }

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
