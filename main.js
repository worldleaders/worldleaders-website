/* WorldLeaders — shared site behaviour (nav, mobile menu, scroll reveals, gentle parallax) */
(function () {
  "use strict";

  // Nav solidifies on scroll
  var header = document.querySelector(".site-header");
  if (header) {
    var solidify = function () { header.classList.toggle("solid", window.scrollY > 40); };
    solidify();
    window.addEventListener("scroll", solidify, { passive: true });
  }

  // Mobile menu toggle
  var menuBtn = document.querySelector(".menu-btn");
  var navlinks = document.querySelector(".nav-links");
  if (menuBtn && navlinks) {
    menuBtn.addEventListener("click", function () {
      var open = navlinks.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    navlinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        navlinks.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Scroll reveal, staggered within each group
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });

    reveals.forEach(function (el) {
      var sibs = Array.prototype.slice.call(el.parentElement.querySelectorAll(":scope > .reveal"));
      el.style.transitionDelay = (sibs.indexOf(el) * 90) + "ms";
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // Gentle scroll parallax on hero blobs (motion-safe, rAF-throttled)
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    var blobs = document.querySelectorAll(".hero .blob, .page-hero .blob");
    if (blobs.length) {
      var ticking = false;
      window.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var y = window.scrollY;
          blobs.forEach(function (b, i) { b.style.transform = "translateY(" + (y * (0.04 + i * 0.02)) + "px)"; });
          ticking = false;
        });
      }, { passive: true });
    }
  }

  // Auto-fill current year
  var yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();
})();
