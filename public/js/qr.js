/*
 * Thin wrapper over the vendored qrcode-generator library.
 * QR.svg(text)  -> self-contained SVG string (crisp at any size, good for print)
 * QR.png(text, px, cb) -> PNG data URL via canvas
 */
(function () {
  var DARK = '#14164f';   // deep indigo from the logo: high contrast on white
  var LIGHT = '#ffffff';

  // URLs must be ASCII inside a QR byte block: URL() percent-encodes / punycodes anything else.
  function normalise(text) {
    try { return new URL(String(text)).href; } catch (e) { return String(text); }
  }

  function build(text, ec) {
    text = normalise(text);
    var qr = qrcode(0, ec || 'Q');   // type 0 = auto-pick the smallest version that fits
    qr.addData(text);
    qr.make();
    return qr;
  }

  window.QR = {
    // margin = quiet zone in modules (the QR spec asks for 4)
    svg: function (text, opts) {
      opts = opts || {};
      var qr = build(text, opts.ec);
      var n = qr.getModuleCount(), m = opts.margin == null ? 4 : opts.margin, size = n + m * 2;
      var d = '';
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (qr.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
        }
      }
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR code for ' + String(text).replace(/[&<>"]/g, '') + '">' +
        '<rect width="' + size + '" height="' + size + '" fill="' + (opts.light || LIGHT) + '"/><path fill="' + (opts.dark || DARK) + '" d="' + d + '"/></svg>';
    },
    png: function (text, px, cb, opts) {
      opts = opts || {};
      var qr = build(text, opts.ec);
      var n = qr.getModuleCount(), m = 4, total = n + m * 2;
      var cell = Math.max(1, Math.floor((px || 1024) / total));
      var side = cell * total;
      var cv = document.createElement('canvas');
      cv.width = cv.height = side;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = LIGHT; ctx.fillRect(0, 0, side, side);
      ctx.fillStyle = DARK;
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + m) * cell, (r + m) * cell, cell, cell);
      cb(cv.toDataURL('image/png'));
    },
    modules: function (text, ec) { return build(text, ec).getModuleCount(); }
  };
})();
