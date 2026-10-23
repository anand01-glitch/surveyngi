/*
 * Shared analytics: aggregation + chart markup used by BOTH the admin dashboard and the printable report.
 * Pure functions: they take rows (responses) and return numbers or HTML strings.
 */
(function () {
  var S = window.SURVEY;
  var Q = S.byId;
  var DAY = 864e5;

  var nf = function (n) { return Number(n).toLocaleString('en-IN'); };
  var fmtDate = function (t) { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

  function answered(v) { return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length); }

  /* ------------------------------------------------------------ aggregation */
  // Works for single-choice and multi-choice questions. pct = share of respondents who answered.
  function tally(q, rows) {
    var c = {}; var n = 0;
    q.options.forEach(function (o) { c[o] = 0; });
    rows.forEach(function (r) {
      var v = r.answers[q.id];
      if (!answered(v)) return;
      n++;
      (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x in c) c[x]++; });
    });
    return { n: n, items: q.options.map(function (o) { return { label: o, value: c[o], pct: n ? c[o] / n * 100 : 0 }; }) };
  }
  var byValue = function (items) { return items.slice().sort(function (a, b) { return b.value - a.value; }); };

  function ratingStats(q, rows) {
    var d = [0, 0, 0, 0, 0]; var n = 0; var sum = 0;
    rows.forEach(function (r) {
      var v = Number(r.answers[q.id]);
      if (v >= 1 && v <= 5) { d[v - 1]++; n++; sum += v; }
    });
    return { n: n, d: d, avg: n ? sum / n : 0 };
  }

  var STOP = new Set(('a an and are as at be been but by can could do for from get good had has have i if in into is it its more most my of on or our so than that the their them then there these they this those to too very want was we were what when which who will with would you your better need needs like make many much also should about all any some such just only own same other out up over how why not no yes one two three first second third things thing college colleges students student campus please etc').split(' '));
  function keywords(rows) {
    var c = {};
    rows.forEach(function (r) {
      var seen = {};
      [29, 30].forEach(function (id) {
        String(r.answers[id] || '').toLowerCase().replace(/[^a-z\s\-]/g, ' ').split(/\s+/).forEach(function (w) {
          w = w.replace(/^-+|-+$/g, '');
          if (w.length < 4 || STOP.has(w) || seen[w]) return;
          seen[w] = 1; c[w] = (c[w] || 0) + 1;
        });
      });
    });
    return Object.keys(c).map(function (k) { return { label: k.charAt(0).toUpperCase() + k.slice(1), value: c[k] }; })
      .filter(function (x) { return x.value > 1; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 12);
  }

  function trendData(rows) {
    var sod = function (t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    var today = sod(Date.now());
    var first = rows.length ? sod(Math.min.apply(null, rows.map(function (r) { return r.ts; }))) : today;
    var start = Math.max(Math.min(first, today - 13 * DAY), today - 59 * DAY);
    var n = Math.round((today - start) / DAY) + 1;
    var counts = []; for (var i = 0; i < n; i++) counts.push(0);
    rows.forEach(function (r) { var k = Math.round((sod(r.ts) - start) / DAY); if (k >= 0 && k < n) counts[k]++; });
    return { start: start, counts: counts };
  }
  function niceMax(m) {
    var pow = Math.pow(10, Math.floor(Math.log10(Math.max(m, 1))));
    var c = [2, 4, 6, 8, 10];
    for (var i = 0; i < c.length; i++) if (c[i] * pow >= m) return c[i] * pow;
    return 10 * pow;
  }

  /* ----------------------------------------------------------- chart markup */
  function hbars(items, unit) {
    return '<ul class="hbs">' + items.map(function (it, i) {
      return '<li class="hb" style="--i:' + i + '" data-tip="<b>' + esc(it.label) + '</b><br>' + nf(it.value) + ' ' + unit + ' &middot; ' + it.pct.toFixed(1) + '%">' +
        '<span class="hb-l">' + esc(it.label) + '</span><span class="hb-t"><i style="--w:' + it.pct.toFixed(2) + '%"></i></span>' +
        '<span class="hb-v">' + Math.round(it.pct) + '%<small>' + nf(it.value) + '</small></span></li>';
    }).join('') + '</ul>';
  }
  function optTable(items, unit) {
    return '<table class="tbl"><thead><tr><th>Option</th><th class="num">' + unit.charAt(0).toUpperCase() + unit.slice(1) + '</th><th class="num">% of respondents</th></tr></thead><tbody>' +
      items.map(function (it) { return '<tr><td>' + esc(it.label) + '</td><td class="num">' + nf(it.value) + '</td><td class="num">' + it.pct.toFixed(1) + '%</td></tr>'; }).join('') + '</tbody></table>';
  }

  // Stacked 1-5 distribution per question, ranked by average. Returns { viz, table, ranked }.
  function ratingBars(qs, rows) {
    var ranked = qs.map(function (q) { var s = ratingStats(q, rows); s.q = q; return s; }).sort(function (a, b) { return b.avg - a.avg; });
    var legend = '<div class="legend">' + [1, 2, 3, 4, 5].map(function (n) { return '<span><i class="c' + n + '"></i>' + n + ' &middot; ' + S.ratingLabels[n - 1] + '</span>'; }).join('') + '</div>';
    var body = ranked.map(function (s, i) {
      var segs = s.d.map(function (c, k) {
        if (!c) return '';
        var p = s.n ? c / s.n * 100 : 0;
        return '<b class="c' + (k + 1) + '" style="--c:' + c + '" data-tip="<b>' + esc(s.q.short) + '</b><br>Rated ' + (k + 1) + ' (' + S.ratingLabels[k] + '): ' + nf(c) + ' &middot; ' + p.toFixed(1) + '%">' + (p >= 9 ? Math.round(p) + '%' : '') + '</b>';
      }).join('');
      return '<div class="rs" style="--i:' + i + '"><span class="rs-l"><em>Q' + s.q.id + '</em>' + esc(s.q.short) + '</span><span class="rs-t">' + segs + '</span><span class="rs-v">' + (s.n ? s.avg.toFixed(1) : '–') + '</span></div>';
    }).join('');
    var table = '<table class="tbl"><thead><tr><th>Factor</th><th class="num">Avg</th><th class="num">n</th>' + [1, 2, 3, 4, 5].map(function (n) { return '<th class="num">' + n + '</th>'; }).join('') + '</tr></thead><tbody>' +
      ranked.map(function (s) { return '<tr><td>' + esc(s.q.short) + '</td><td class="num">' + (s.n ? s.avg.toFixed(2) : '–') + '</td><td class="num">' + nf(s.n) + '</td>' + s.d.map(function (c) { return '<td class="num">' + nf(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    return { viz: legend + body, table: table, ranked: ranked };
  }

  // Average importance (Q5-Q14) by planned programme. Colour is scaled to the lowest..highest value shown.
  var HM_COLS = { 5: 'Teaching', 6: 'Placements', 7: 'Internships', 8: 'Infra', 9: 'Reputation', 10: 'Fees', 11: 'Hostel', 12: 'Campus life', 13: 'Global', 14: 'Location' };
  function heatmap(rows) {
    var qs = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(function (id) { return Q[id]; });
    var progs = Q[3].options.map(function (p) { return { p: p, rows: rows.filter(function (r) { return r.answers[3] === p; }) }; })
      .filter(function (x) { return x.rows.length; }).sort(function (a, b) { return b.rows.length - a.rows.length; });
    var groups = [{ p: 'All students', rows: rows }].concat(progs);
    var all = [];
    groups.forEach(function (g) { qs.forEach(function (q) { var s = ratingStats(q, g.rows); if (s.n) all.push(s.avg); }); });
    var lo = all.length ? Math.min.apply(null, all) : 1, hi = all.length ? Math.max.apply(null, all) : 5;
    var bucket = function (avg) { return hi - lo < 0.05 ? 4 : Math.max(1, Math.min(7, Math.floor((avg - lo) / (hi - lo) * 6.999) + 1)); };
    var head = '<tr><th>Planned programme</th><th>n</th>' + qs.map(function (q) { return '<th title="' + esc(q.short) + '">' + HM_COLS[q.id] + '</th>'; }).join('') + '</tr>';
    var body = groups.map(function (g) {
      var low = g.rows.length < 5 && g.p !== 'All students';
      return '<tr><td class="rowh">' + esc(g.p) + '</td><td class="n">' + g.rows.length + '</td>' + qs.map(function (q) {
        var s = ratingStats(q, g.rows);
        if (!s.n) return '<td>–</td>';
        return '<td class="' + (low ? 'low' : '') + '" data-b="' + bucket(s.avg) + '" data-tip="<b>' + esc(g.p) + '</b> &middot; ' + esc(q.short) + '<br>Average ' + s.avg.toFixed(2) + ' / 5 (n=' + s.n + ')' + (low ? '<br>Small sample' : '') + '">' + s.avg.toFixed(1) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var ramp = '<div class="hm-legend"><span>Lowest shown (' + lo.toFixed(1) + ')</span><span class="ramp">' + [1, 2, 3, 4, 5, 6, 7].map(function (b) { return '<i style="background:var(--s' + b + ')"></i>'; }).join('') + '</span><span>Highest shown (' + hi.toFixed(1) + ')</span></div>';
    var table = '<table class="tbl"><thead>' + head + '</thead><tbody>' + groups.map(function (g) {
      return '<tr><td>' + esc(g.p) + '</td><td class="num">' + g.rows.length + '</td>' + qs.map(function (q) { var s = ratingStats(q, g.rows); return '<td class="num">' + (s.n ? s.avg.toFixed(2) : '–') + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
    return { head: head, body: body, ramp: ramp, table: table, lo: lo, hi: hi };
  }

  // Line chart of responses per day as an SVG string (no event handlers). geom lets callers add hover behaviour.
  function trendSvg(rows, W, H) {
    var d = trendData(rows);
    var m = { l: 34, r: 16, t: 14, b: 28 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b, n = d.counts.length;
    var ymax = niceMax(Math.max.apply(null, d.counts));
    var x = function (i) { return m.l + (n > 1 ? i / (n - 1) : 0.5) * pw; };
    var y = function (v) { return m.t + ph - (v / ymax) * ph; };
    var pts = d.counts.map(function (v, i) { return [x(i), y(v)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = line + ' L' + x(n - 1).toFixed(1) + ' ' + (m.t + ph) + ' L' + x(0).toFixed(1) + ' ' + (m.t + ph) + ' Z';
    var grid = [0, ymax / 2, ymax].map(function (v) {
      return '<line class="' + (v === 0 ? 'ax' : 'gl') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    }).join('');
    var step = Math.max(1, Math.round(n / (W < 480 ? 4 : 7)));
    var xl = '';
    for (var i = 0; i < n; i += step) {
      xl += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + new Date(d.start + i * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</text>';
    }
    var last = pts[n - 1];
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Responses per day">' + grid + xl +
      '<path class="area" d="' + area + '"/><path class="line" d="' + line + '"/>' +
      '<line class="cross" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ph) + '" visibility="hidden"/>' +
      '<circle class="dot hov" r="4" visibility="hidden"/><circle class="dot end" r="4" cx="' + last[0] + '" cy="' + last[1] + '"/>' +
      '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '" fill="transparent"/></svg>';
    var table = '<table class="tbl"><thead><tr><th>Date</th><th class="num">Responses</th></tr></thead><tbody>' +
      d.counts.map(function (c, i) { return [fmtDate(d.start + i * DAY), c]; }).reverse().filter(function (r) { return r[1] > 0; })
        .map(function (r) { return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>'; }).join('') + '</tbody></table>';
    return { svg: svg, table: table, geom: { d: d, m: m, W: W, pw: pw, n: n, x: x, y: y } };
  }

  window.Analytics = {
    DAY: DAY, nf: nf, fmtDate: fmtDate, answered: answered,
    tally: tally, byValue: byValue, ratingStats: ratingStats, keywords: keywords,
    trendData: trendData, trendSvg: trendSvg,
    hbars: hbars, optTable: optTable, ratingBars: ratingBars, heatmap: heatmap
  };
})();
