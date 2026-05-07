(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setYear() {
    var el = document.getElementById("year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function goPortal() {
    window.location.href = "portal.html";
  }

  function goSystem() {
    window.location.href = "index.html";
  }

  function scrollToAbout() {
    var target = document.getElementById("sobre");
    if (!target) return;
    if (prefersReducedMotion) {
      target.scrollIntoView();
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindNav() {
    var portalBtn = document.querySelector(".js-go-portal");
    var systemBtn = document.querySelector(".js-go-system");
    var aboutBtn = document.querySelector(".js-scroll-about");
    if (portalBtn) portalBtn.addEventListener("click", goPortal);
    if (systemBtn) systemBtn.addEventListener("click", goSystem);
    if (aboutBtn) aboutBtn.addEventListener("click", scrollToAbout);
  }

  /**
   * Parallax muito leve no hero: move estampas e conteúdo em direções opostas
   * (sem arrastar; respeita prefers-reduced-motion).
   */
  function initHeroParallax() {
    if (prefersReducedMotion) return;
    var hero = document.querySelector(".hero");
    if (!hero) return;

    var targetX = 0;
    var targetY = 0;
    var curX = 0;
    var curY = 0;
    var rafId = null;

    function tick() {
      rafId = null;
      curX += (targetX - curX) * 0.09;
      curY += (targetY - curY) * 0.09;
      hero.style.setProperty("--parallax-x", curX.toFixed(5));
      hero.style.setProperty("--parallax-y", curY.toFixed(5));
      if (Math.abs(targetX - curX) > 0.002 || Math.abs(targetY - curY) > 0.002) {
        rafId = requestAnimationFrame(tick);
      }
    }

    function queueTick() {
      if (rafId == null) rafId = requestAnimationFrame(tick);
    }

    function onMove(e) {
      var rect = hero.getBoundingClientRect();
      var nx = (e.clientX - rect.left) / rect.width - 0.5;
      var ny = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = Math.max(-1, Math.min(1, nx * 2));
      targetY = Math.max(-1, Math.min(1, ny * 2));
      queueTick();
    }

    function onLeave() {
      targetX = 0;
      targetY = 0;
      queueTick();
    }

    hero.addEventListener("mousemove", onMove, { passive: true });
    hero.addEventListener("mouseleave", onLeave);
  }

  /**
   * Entrada do hero: após window load, ativa stagger (fade + scale + blur).
   * prefers-reduced-motion: estado final imediato (sem animação).
   */
  function initLandingIntro() {
    var hero = document.querySelector(".landing-hero-intro");
    if (!hero) return;
    if (prefersReducedMotion) {
      hero.classList.add("landing-hero-intro--ready");
      return;
    }
    window.addEventListener("load", function () {
      hero.classList.add("landing-hero-intro--ready");
    });
  }

  function initReveal() {
    if (prefersReducedMotion) {
      document.querySelectorAll(".reveal, [data-reveal]").forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var nodes = document.querySelectorAll(".reveal, [data-reveal]");
    if (!nodes.length || !("IntersectionObserver" in window)) {
      nodes.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    nodes.forEach(function (el) {
      observer.observe(el);
    });
  }

  function run() {
    setYear();
    bindNav();
    initLandingIntro();
    initHeroParallax();
    initReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
