/*
 * Printable insights report. Reads the same data as the dashboard (and the same filters,
 * passed in the query string), then lays it out as an A4 document. No names or emails are included.
 */
(function () {
  var S = window.SURVEY;
  var Q = S.byId;
  var A = window.Analytics;
  var nf = A.nf, fmtDate = A.fmtDate, answered = A.answered;
  var $ = function (s) { return document.querySelector(s); };
  var pct = function (v) { return Math.round(v) + '%'; };
  var P = new URLSearchParams(location.search);
  var F = { range: P.get('range') || 'all', cls: P.get('cls') || '', prog: P.get('prog') || '', dest: P.get('dest') || '' };

  /* -------------------------------------------------------------- load */
  function setState(msg, html) {
    var s = $('#state'); s.hidden = false;
    if (html) s.innerHTML = msg; else s.textContent = msg;
    $('#tb-sub').textContent = 'Unavailable';
  }

  fetch('/api/admin/responses', { credentials: 'same-origin' }).then(function (r) {
    if (r.status === 401) { setState('Please <a href="/admin">sign in to the admin dashboard</a> first, then open the report again.', true); return null; }
    if (!r.ok) throw new Error('load');
    return r.json();
  }).then(function (j) {
    if (!j) return;
    var days = { '7': 7, '30': 30 }[F.range];
    var now = Date.now();
    var rows = j.responses.filter(function (r) {
      return (!days || r.ts >= now - days * A.DAY) &&
        (!F.cls || r.answers[1] === F.cls) && (!F.prog || r.answers[3] === F.prog) && (!F.dest || r.answers[4] === F.dest);
    });
    if (!rows.length) {
      setState(j.responses.length ? 'No responses match these filters, so there is nothing to report. Go back to the dashboard and widen the filters.' : 'There are no responses yet, so there is nothing to report.');
      return;
    }
    build(rows, j.responses.length);
  }).catch(function () { setState('Could not load the data. Please go back to the dashboard and try again.'); });

  /* ---------------------------------------------------------- helpers */
  function top(qid, rows, k) {
    var t = A.tally(Q[qid], rows);
    return { n: t.n, list: A.byValue(t.items).filter(function (x) { return x.value > 0; }).slice(0, k || 1) };
  }
  function avgOf(qid, rows) { return A.ratingStats(Q[qid], rows); }
  function names(list) {
    return list.map(function (x) { return '<b>' + esc(x.label) + '</b> (' + pct(x.pct) + ')'; });
  }
  function joinAnd(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1]; }

  function filterText() {
    var parts = [];
    if (F.range !== 'all') parts.push('Last ' + F.range + ' days');
    if (F.cls) parts.push('Class: ' + F.cls);
    if (F.prog) parts.push('Programme: ' + F.prog);
    if (F.dest) parts.push('Studying: ' + F.dest);
    return parts.length ? parts.join(' · ') : 'All responses';
  }

  /* ------------------------------------------------------ building blocks */
  function rcard(title, sub, body, cls) {
    return '<section class="rcard ' + (cls || '') + '"><h3>' + esc(title) + '</h3>' + (sub ? '<p class="rsub">' + sub + '</p>' : '') + body + '</section>';
  }
  function optionCard(q, rows, keepOrder) {
    var t = A.tally(q, rows);
    var items = keepOrder ? t.items : A.byValue(t.items);
    var hint = q.type === 'multi' ? ' · up to ' + q.max + ' choices' : '';
    return rcard(q.short, 'Q' + q.id + ' · ' + nf(t.n) + ' respondent' + (t.n === 1 ? '' : 's') + hint, A.hbars(items, 'respondents'));
  }
  function ratingCard(q, rows) {
    var st = A.ratingStats(q, rows);
    var items = [5, 4, 3, 2, 1].map(function (n) {
      return { label: n + ' · ' + S.ratingLabels[n - 1], value: st.d[n - 1], pct: st.n ? st.d[n - 1] / st.n * 100 : 0 };
    });
    return rcard(q.short, 'Q' + q.id + ' · ' + nf(st.n) + ' rating' + (st.n === 1 ? '' : 's') + ' · 1 = not important, 5 = extremely',
      '<div class="avg-fig"><b>' + (st.n ? st.avg.toFixed(2) : '–') + '</b><span>average out of 5</span></div>' + A.hbars(items, 'respondents'));
  }
  function rsec(id, kicker, title, intro, inner) {
    return '<section class="rsec" id="' + id + '"><header class="rsec-h"><p class="kicker">' + kicker + '</p><h2>' + title + '</h2>' + (intro ? '<p class="rintro">' + intro + '</p>' : '') + '</header>' + inner + '</section>';
  }

  /* -------------------------------------------------------- the findings */
  function findings(rows) {
    var f = [];
    var ranked = A.ratingBars([5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(function (id) { return Q[id]; }), rows).ranked.filter(function (s) { return s.n; });
    if (ranked.length > 1) {
      var hi = ranked[0], lo = ranked[ranked.length - 1];
      f.push('<b>' + esc(hi.q.short) + '</b> is the most important factor when choosing a college (average <b>' + hi.avg.toFixed(1) + '/5</b>); <b>' + esc(lo.q.short) + '</b> matters least (<b>' + lo.avg.toFixed(1) + '/5</b>).');
    }
    var t15 = top(15, rows, 3);
    if (t15.list.length) f.push('Asked to pick the five things that decide their final choice, students most often chose ' + joinAnd(names(t15.list)) + '.');
    var t3 = top(3, rows), t4 = top(4, rows);
    if (t3.list.length) f.push('The most popular planned programme is <b>' + esc(t3.list[0].label) + '</b> (' + pct(t3.list[0].pct) + ' of respondents).' + (t4.list.length ? ' The most common plan is to study in <b>' + esc(t4.list[0].label) + '</b> (' + pct(t4.list[0].pct) + ').' : ''));
    var t16 = top(16, rows);
    if (t16.list.length) f.push('The preferred learning experience is &ldquo;' + esc(t16.list[0].label) + '&rdquo; (' + pct(t16.list[0].pct) + ').');
    var t17 = top(17, rows, 3);
    if (t17.list.length) f.push('The skills students most expect to gain are ' + joinAnd(names(t17.list)) + '.');
    var a18 = avgOf(18, rows);
    if (a18.n) f.push('AI and emerging technology is rated <b>' + a18.avg.toFixed(1) + '/5</b> in importance for their college education.');
    var t24 = top(24, rows), a25 = avgOf(25, rows);
    if (t24.list.length) f.push('The most common expectation after the programme is <b>' + esc(t24.list[0].label) + '</b> (' + pct(t24.list[0].pct) + ')' + (a25.n ? '; a college&rsquo;s placement record scores <b>' + a25.avg.toFixed(1) + '/5</b> in admission decisions.' : '.'));
    var t20 = top(20, rows, 3), t21 = top(21, rows, 3);
    if (t20.list.length) f.push('The campus facilities students say would most improve their experience are ' + joinAnd(names(t20.list)) + '.');
    if (t21.list.length) f.push('From a hostel they expect most: ' + joinAnd(names(t21.list)) + '.');
    var t27 = top(27, rows, 3), a28 = avgOf(28, rows);
    if (t27.list.length) f.push('The student services they want strengthened first are ' + joinAnd(names(t27.list)) + (a28.n ? '; easy access to faculty and management rates <b>' + a28.avg.toFixed(1) + '/5</b>.' : '.'));
    return f;
  }

  function priorities(rows) {
    var col = function (title, qid) {
      var t = top(qid, rows, 5);
      return '<div class="r-prio"><h4>' + title + '</h4><ol>' + (t.list.length ? t.list.map(function (x) {
        return '<li><span>' + esc(x.label) + '</span><b>' + pct(x.pct) + '</b></li>';
      }).join('') : '<li><span>No data</span></li>') + '</ol></div>';
    };
    return '<div class="r-prios">' + col('What decides the choice', 15) + col('Facilities to invest in', 20) + col('Support to strengthen', 27) + '</div>';
  }

  /* ----------------------------------------------------------- the report */
  function build(rows, totalAll) {
    var sorted = rows.map(function (r) { return r.ts; }).sort(function (a, b) { return a - b; });
    var from = fmtDate(sorted[0]), to = fmtDate(sorted[sorted.length - 1]);
    var generated = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    var ranked = A.ratingBars([5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(function (id) { return Q[id]; }), rows).ranked;
    var t15 = top(15, rows), t24 = top(24, rows);

    var kpi = function (label, value, sub) { return '<div class="r-kpi"><span>' + label + '</span><b>' + value + '</b><em>' + sub + '</em></div>'; };
    var kpis = '<div class="r-kpis">' +
      kpi('Responses analysed', nf(rows.length), rows.length !== totalAll ? 'of ' + nf(totalAll) + ' (filtered)' : 'all responses') +
      kpi('Highest-rated factor', ranked[0] && ranked[0].n ? esc(ranked[0].q.short) : '–', ranked[0] && ranked[0].n ? ranked[0].avg.toFixed(2) + ' / 5 average' : '') +
      kpi('Top deciding factor', t15.list[0] ? esc(t15.list[0].label) : '–', t15.list[0] ? pct(t15.list[0].pct) + ' of respondents' : '') +
      kpi('Top goal after programme', t24.list[0] ? esc(t24.list[0].label) : '–', t24.list[0] ? pct(t24.list[0].pct) + ' of respondents' : '') + '</div>';

    var small = rows.length < 30 ? '<p class="r-warn"><b>Small sample.</b> This report is based on ' + rows.length + ' response' + (rows.length === 1 ? '' : 's') + '. Treat percentages as indicative rather than conclusive.</p>' : '';

    var cover = '<header class="r-cover">' +
      '<div class="r-brand"><img src="/assets/logo.jpg" width="400" height="400" alt="Nehru Group of Institutions" /><div><b>Jawaharlal College of Engineering &amp; Technology</b><span>Nehru Group of Institutions</span></div></div>' +
      '<p class="kicker">Insights report</p><h1>Student Expectations &amp; College Experience Survey</h1>' +
      '<dl class="r-meta"><div><dt>Generated</dt><dd>' + generated + '</dd></div><div><dt>Responses collected</dt><dd>' + from + (from !== to ? ' – ' + to : '') + '</dd></div>' +
      '<div><dt>Showing</dt><dd>' + esc(filterText()) + '</dd></div></dl></header>' +
      kpis + small +
      '<section class="r-find"><h2>Key findings</h2><ol>' + findings(rows).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol></section>' +
      '<section class="r-find"><h2>Priorities at a glance</h2>' + priorities(rows) + '</section>';

    // Page 2: trend + profile
    var tr = A.trendSvg(rows, 700, 190);
    var profile = rsec('p-profile', 'Section A', 'Who responded', 'Class, stream, planned programme and where students want to study.',
      rcard('Responses over time', 'Daily submissions', '<div class="trend">' + tr.svg + '</div>', 'wide') +
      '<div class="rgrid">' + optionCard(Q[1], rows, true) + optionCard(Q[2], rows) + optionCard(Q[3], rows) + optionCard(Q[4], rows) + '</div>');

    // Page 3: drivers
    var rb = A.ratingBars([5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(function (id) { return Q[id]; }), rows);
    var hm = A.heatmap(rows);
    var drivers = rsec('p-drivers', 'Section B', 'What drives the decision', 'How strongly each factor shapes the choice of a college. Ranked by average importance (1 = not important, 5 = extremely important).',
      rcard('How important is each factor?', 'Q5–Q14 · stacked bar shows the 1–5 spread · average on the right', rb.viz, 'wide') +
      rcard('Average importance by planned programme', 'Q5–Q14 · colour scaled between the lowest and highest value shown',
        '<div class="hm-scroll"><table class="hm"><thead>' + hm.head + '</thead><tbody>' + hm.body + '</tbody></table></div>' + hm.ramp +
        '<p class="rnote">Faded rows have fewer than 5 respondents, so read them as directional only.</p>', 'wide'));

    var wants = rsec('p-wants', 'Section C', 'What students actually want', 'Final decision factors, preferred learning style, skills and industry exposure.',
      '<div class="rgrid">' + optionCard(Q[15], rows) + '<div class="rstack">' + optionCard(Q[17], rows) + '</div>' +
      optionCard(Q[16], rows) + ratingCard(Q[18], rows) + optionCard(Q[19], rows) + '</div>');

    var campus = rsec('p-campus', 'Section D', 'Campus &amp; student experience', 'Facilities, hostel expectations and the activities that make campus life.',
      '<div class="rgrid">' + optionCard(Q[20], rows) + optionCard(Q[21], rows) + ratingCard(Q[22], rows) + optionCard(Q[23], rows) + '</div>');

    var career = rsec('p-career', 'Sections E &amp; F', 'Career, future &amp; student support', 'Where students want to be after the programme, and the support they expect from management.',
      '<div class="rgrid">' + optionCard(Q[24], rows) + ratingCard(Q[25], rows) + optionCard(Q[26], rows) + optionCard(Q[27], rows) + ratingCard(Q[28], rows) + '</div>');

    // Voices (anonymous)
    var kw = A.keywords(rows).map(function (k) { return { label: k.label, value: k.value, pct: k.value / rows.length * 100 }; });
    var quotes = function (qid, n) {
      var list = rows.filter(function (r) { return answered(r.answers[qid]); }).sort(function (a, b) { return b.ts - a.ts; });
      var shown = list.slice(0, n);
      if (!shown.length) return '<p class="rnote">No written responses.</p>';
      return shown.map(function (r) {
        return '<blockquote class="rquote"><p>' + esc(r.answers[qid]) + '</p><footer>' + esc(r.answers[1]) + ' · ' + esc(r.answers[3]) + '</footer></blockquote>';
      }).join('') + (list.length > n ? '<p class="rnote">Showing the ' + n + ' most recent of ' + nf(list.length) + ' comments.</p>' : '');
    };
    var voices = rsec('p-voices', 'Section G', 'In their own words', 'Open-ended answers. Names and email addresses are not shown.',
      (kw.length ? rcard('Most-mentioned words', 'Q29 and Q30 combined · share of respondents mentioning the word', A.hbars(kw, 'mentions'), 'wide') : '') +
      '<div class="r-comments"><h3 class="rh3">If you could ask management to improve three things&hellip;</h3><p class="rsub">Q29</p>' + quotes(29, 8) +
      '<h3 class="rh3">What would make you choose one college over another&hellip;</h3><p class="rsub">Q30</p>' + quotes(30, 8) + '</div>' +
      '<section class="r-about"><h3>About this report</h3><ul>' +
      '<li>Percentages on multiple-choice questions are the share of respondents who selected each option, so a question that allows several choices can add up to more than 100%.</li>' +
      '<li>Ratings use a 1–5 scale: 1 = Not important, 2 = Slightly important, 3 = Moderately important, 4 = Very important, 5 = Extremely important.</li>' +
      '<li>Survey responses are self-reported and reflect the students who chose to take part.</li></ul></section>');

    $('#sheet').innerHTML = '<div class="rpage first">' + cover + '</div>' + profile + drivers + wants + campus + career + voices;
    $('#sheet').hidden = false;
    $('#state').hidden = true;
    $('#tb-sub').textContent = nf(rows.length) + ' responses · ' + filterText();
    document.title = 'Insights report · ' + generated;
    $('#print-btn').disabled = false;

    if (P.get('print') === '1') {
      var go = function () { setTimeout(function () { window.print(); }, 500); };
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go, go);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#print-btn').addEventListener('click', function () { window.print(); });
    $('#opt-comments').addEventListener('change', function (e) { document.body.classList.toggle('no-comments', !e.target.checked); });
  });
})();
