/* Shared helpers: theme toggle, scroll reveal, toast. */
(function () {
  var KEY = 'jcet-theme';

  window.Theme = {
    init: function () {
      var btn = document.querySelector('.theme-toggle');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme');
        if (!cur) cur = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        var next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem(KEY, next); } catch (e) { /* storage may be unavailable */ }
        document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
      });
    }
  };

  /* Adds .in to .reveal elements as they enter the viewport. */
  window.Reveal = {
    io: null,
    observe: function (root) {
      var els = (root || document).querySelectorAll('.reveal:not(.in)');
      if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
      if (!this.io) {
        this.io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { en.target.classList.add('in'); Reveal.io.unobserve(en.target); }
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      }
      els.forEach(function (e) { Reveal.io.observe(e); });
    }
  };

  window.toast = function (msg, kind) {
    var host = document.querySelector('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    var t = document.createElement('div');
    t.className = 'toast' + (kind === 'error' ? ' error' : '');
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.classList.add('leaving'); setTimeout(function () { t.remove(); }, 380); }, 3600);
  };

  window.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };

  document.addEventListener('DOMContentLoaded', function () { Theme.init(); });
})();
