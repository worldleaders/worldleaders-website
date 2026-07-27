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


  // Inject a compact signup into the footer on pages that don't already have one (sitewide capture)
  (function () {
    if (document.querySelector(".wl-subscribe")) return; // page already has a form
    var wrap = document.querySelector(".site-footer .wrap");
    var bottom = document.querySelector(".site-footer .foot-bottom");
    if (!wrap || !bottom) return;
    var box = document.createElement("div");
    box.style.cssText = "max-width:560px;margin:0 auto 30px;text-align:center";
    box.innerHTML =
      '<h4 style="font-family:Fraunces,serif;font-weight:700;font-size:1.3rem;margin:0 0 6px;color:var(--ink)">Get the weekly insight</h4>' +
      '<p style="color:var(--ink-soft);font-weight:600;margin:0 0 14px;font-size:.95rem">A short, practical read each week. Free. Unsubscribe anytime.</p>' +
      '<form class="wl-subscribe" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' +
        '<input type="email" name="email" required placeholder="you@example.com" aria-label="Email address" style="flex:1;min-width:200px;font-family:Nunito,sans-serif;font-size:.95rem;font-weight:600;color:var(--ink);background:var(--white);border:2px solid rgba(42,30,66,.12);border-radius:100px;padding:11px 18px">' +
        '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px" value="">' +
        '<button class="btn btn-primary" type="submit">Subscribe</button>' +
        '<p class="wl-subscribe-msg" role="status" style="width:100%;margin:6px 0 0;font-weight:700;min-height:1.1em;font-size:.9rem"></p>' +
      '</form>';
    wrap.insertBefore(box, bottom);
  })();

  // Newsletter signup (forms with class "wl-subscribe")
  document.querySelectorAll("form.wl-subscribe").forEach(function (form) {
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var msg = form.querySelector(".wl-subscribe-msg");
      var emailEl = form.querySelector('input[name="email"]');
      var hp = form.querySelector('input[name="website"]');
      var email = (emailEl && emailEl.value || "").trim();
      var setMsg = function (t, c) { if (msg) { msg.textContent = t; msg.style.color = c || "var(--ink-soft)"; } };
      if (hp && hp.value) { setMsg("Thanks!"); return; } // bot
      if (!email) { setMsg("Please enter your email.", "#c0392b"); return; }
      setMsg("Subscribing…");
      try {
        var res = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email }) });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok) { form.reset(); setMsg(data.message || "You're subscribed — thank you!", "var(--meadow-deep)"); }
        else { setMsg(data.error || "Something went wrong. Please try again.", "#c0392b"); }
      } catch (e) { setMsg("Network error. Please try again.", "#c0392b"); }
    });
  });

})();
