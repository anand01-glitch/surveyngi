/* Printable A4 poster: QR code + link, scaled to fit the screen, printed at true size. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var raw = new URLSearchParams(location.search).get('url') || '';
  var u = null;
  try { u = new URL(raw); if (!/^https?:$/.test(u.protocol)) u = null; } catch (e) { u = null; }

  if (!u) {
    $('#poster-error').hidden = false;
    $('#stage').hidden = true;
    $('#print-btn').disabled = true;
  } else {
    $('#qr').innerHTML = QR.svg(u.href, { ec: 'Q' });
    $('#url').textContent = u.href.replace(/^https?:\/\//, '').replace(/\/$/, '');
    document.title = 'Survey poster · ' + u.host;
  }

  // Fit the A4 sheet to the screen; print always uses scale 1.
  var A4_PX = 210 * 96 / 25.4;
  function fit() {
    var s = Math.min(1, (window.innerWidth - 32) / A4_PX);
    document.documentElement.style.setProperty('--s', s.toFixed(4));
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('beforeprint', function () { document.documentElement.style.setProperty('--s', '1'); });
  window.addEventListener('afterprint', fit);

  $('#print-btn').addEventListener('click', function () { window.print(); });
  $('#close-btn').addEventListener('click', function () {
    if (window.opener) window.close(); else location.href = '/admin#share';
  });
})();
