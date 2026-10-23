/* Admin dashboard: login, filters, aggregation and chart rendering (no external libraries). */
(function () {
  var S = window.SURVEY;
  var Q = S.byId;
  var ALL = [];
  var VIEW = [];
  var F = { range: 'all', cls: '', prog: '', dest: '' };
  var voiceState = { qid: 29, search: '', shown: 8 };
  var tableState = { search: '', page: 0 };
  var PAGE = 12;
  var DAY = 864e5;
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var nf = function (n) { return Number(n).toLocaleString('en-IN'); };
  var fmtDate = function (t) { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var fmtDT = function (t) { return fmtDate(t) + ', ' + new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };

  /* ------------------------------------------------------------------ api */
  function api(path, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = Object.assign({ 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' }, opts.headers);
    return fetch(path, opts).then(function (r) {
      if (r.status === 401 && path !== '/api/admin/login') { showLogin(); throw new Error('auth'); }
      return r;
    });
  }

  /* ---------------------------------------------------------------- login */
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    setTimeout(function () { $('#pw').focus(); }, 50);
  }
  function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
  }

  function initLogin() {
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#login-err'), btn = $('#login-btn');
      err.hidden = true; btn.disabled = true;
      api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (!res.ok) { err.textContent = res.j.error || 'Sign in failed.'; err.hidden = false; return; }
          $('#pw').value = '';
          load(true);
        })
        .catch(function () { btn.disabled = false; err.textContent = 'Network problem. Please try again.'; err.hidden = false; });
    });
    $('#logout').addEventListener('click', function () {
      api('/api/admin/logout', { method: 'POST' }).then(function () { ALL = []; showLogin(); });
    });
  }

  /* ----------------------------------------------------------------- data */
  function load(first) {
    return api('/api/admin/responses').then(function (r) { return r.json(); }).then(function (j) {
      var changed = j.responses.length !== ALL.length;
      ALL = j.responses;
      showApp();
      if (first) buildFilters();
      if (first || changed) { applyFilters(); render(); }
      $('#demo-note').hidden = $('#demo-clear').hidden = !ALL.some(function (r) { return r.demo; });
    }).catch(function (e) { if (e.message !== 'auth') toast('Could not load responses.', 'error'); });
  }

  function buildFilters() {
    var fill = function (id, qid) {
      var sel = $(id);
      sel.innerHTML = '<option value="">All</option>' + Q[qid].options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('');
    };
    fill('#f-cls', 1); fill('#f-prog', 3); fill('#f-dest', 4);
  }

  function applyFilters() {
    var days = { '7': 7, '30': 30 }[F.range];
    var now = Date.now();
    VIEW = ALL.filter(function (r) {
      return (!days || r.ts >= now - days * DAY) &&
        (!F.cls || r.answers[1] === F.cls) &&
        (!F.prog || r.answers[3] === F.prog) &&
        (!F.dest || r.answers[4] === F.dest);
    });
    var active = F.range !== 'all' || F.cls || F.prog || F.dest;
    $('#f-reset').hidden = !active;
    $('#f-range').classList.toggle('active', F.range !== 'all');
    $('#f-cls').classList.toggle('active', !!F.cls);
    $('#f-prog').classList.toggle('active', !!F.prog);
    $('#f-dest').classList.toggle('active', !!F.dest);
  }

  /* ---------------------------------------------------------- aggregation (shared with the report) */
  var A = window.Analytics;
  var answered = A.answered, tally = A.tally, byValue = A.byValue, ratingStats = A.ratingStats, keywords = A.keywords;

  /* ------------------------------------------------------------ components */
  var tipEl = null;
  function showTip(html, x, y) {
    tipEl = tipEl || $('#tip');
    tipEl.innerHTML = html; tipEl.hidden = false;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var nx = Math.min(x + 14, window.innerWidth - w - 8);
    var ny = y - h - 14 < 8 ? y + 18 : y - h - 14;
    tipEl.style.left = Math.max(8, nx) + 'px'; tipEl.style.top = ny + 'px';
  }
  function hideTip() { (tipEl = tipEl || $('#tip')).hidden = true; }
  function initTips() {
    document.addEventListener('mousemove', function (e) {
      var t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (t) showTip(t.getAttribute('data-tip'), e.clientX, e.clientY); else if (!e.target.closest || !e.target.closest('.trend')) hideTip();
    });
    document.addEventListener('scroll', hideTip, { passive: true });
  }

  function card(o) {
    return '<article class="card reveal ' + (o.cls || '') + '"' + (o.delay ? ' style="--d:' + o.delay + 'ms"' : '') + '>' +
      '<header class="card-h"><div><h3>' + esc(o.title) + '</h3>' + (o.sub ? '<p>' + o.sub + '</p>' : '') + '</div>' +
      (o.table ? '<button class="tbl-btn" type="button" aria-pressed="false">Table</button>' : '') + '</header>' +
      '<div class="viz">' + o.viz + '</div>' + (o.table ? '<div class="tbl-wrap" hidden>' + o.table + '</div>' : '') + '</article>';
  }

  var hbars = A.hbars, optTable = A.optTable;

  function optionCard(q, opts) {
    opts = opts || {};
    var t = tally(q, VIEW);
    var items = opts.keepOrder ? t.items : byValue(t.items);
    var hint = q.type === 'multi' ? ' &middot; up to ' + q.max + ' choices' : '';
    return card({ title: q.short, sub: 'Q' + q.id + ' &middot; ' + nf(t.n) + ' respondent' + (t.n === 1 ? '' : 's') + hint, viz: hbars(items, 'respondents'), table: optTable(items, 'respondents'), cls: opts.cls });
  }

  function ratingSingleCard(q) {
    var st = ratingStats(q, VIEW);
    var items = [5, 4, 3, 2, 1].map(function (n) {
      return { label: n + ' · ' + S.ratingLabels[n - 1], value: st.d[n - 1], pct: st.n ? st.d[n - 1] / st.n * 100 : 0 };
    });
    var viz = '<div class="avg-fig"><b>' + (st.n ? st.avg.toFixed(2) : '–') + '</b><span>average out of 5</span></div>' + hbars(items, 'respondents');
    return card({ title: q.short, sub: 'Q' + q.id + ' &middot; ' + nf(st.n) + ' rating' + (st.n === 1 ? '' : 's') + ' &middot; 1 = not important, 5 = extremely', viz: viz, table: optTable(items, 'respondents') });
  }

  function ratingGroupCard(qs, title, sub) {
    var rb = A.ratingBars(qs, VIEW);
    return card({ title: title, sub: sub, viz: rb.viz, table: rb.table, cls: 'wide' });
  }

  function heatmap() {
    var h = A.heatmap(VIEW);
    var viz = '<div class="hm-scroll"><table class="hm"><thead>' + h.head + '</thead><tbody>' + h.body + '</tbody></table></div>' + h.ramp +
      '<p class="note">Faded rows have fewer than 5 respondents, so read them as directional only. <span class="swipe-hint">Swipe sideways to see every factor.</span></p>';
    return card({ title: 'Average importance by planned programme', sub: 'Q5–Q14 &middot; how each factor scores for different student groups', viz: viz, table: h.table, cls: 'wide' });
  }

  /* ------------------------------------------------------------ trend chart */
  var trendData = A.trendData;
  function drawTrend(el, rows) {
    var W = Math.max(el.clientWidth, 280), H = 220;
    var t = A.trendSvg(rows, W, H);
    el.innerHTML = t.svg;
    var g = t.geom, d = g.d, m = g.m, n = g.n;
    var svg = $('svg', el), cross = $('.cross', el), hov = $('.hov', el), hit = $('.hit', el);
    hit.addEventListener('mousemove', function (e) {
      var box = svg.getBoundingClientRect();
      var px = (e.clientX - box.left) * (W / box.width);
      var i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / g.pw * (n - 1))));
      cross.setAttribute('x1', g.x(i)); cross.setAttribute('x2', g.x(i)); cross.setAttribute('visibility', 'visible');
      hov.setAttribute('cx', g.x(i)); hov.setAttribute('cy', g.y(d.counts[i])); hov.setAttribute('visibility', 'visible');
      showTip('<b>' + fmtDate(d.start + i * DAY) + '</b><br>' + d.counts[i] + ' response' + (d.counts[i] === 1 ? '' : 's'), e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); hov.setAttribute('visibility', 'hidden'); hideTip(); });
    return t.table;
  }

  /* ---------------------------------------------------------------- sections */
  function pageHead(kicker, title, text) {
    return '<header class="page-h reveal"><p class="kicker">' + kicker + '</p><h2>' + title + '</h2>' + (text ? '<p>' + text + '</p>' : '') + '</header>';
  }
  function sec(id, head, body) { return '<section class="sec-a" id="' + id + '" data-nav-sec="' + id + '">' + head + body + '</section>'; }

  function topOf(qid) {
    var t = tally(Q[qid], VIEW);
    var top = byValue(t.items)[0];
    return { n: t.n, top: top && top.value ? top : null };
  }

  function overview() {
    var now = Date.now();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayN = VIEW.filter(function (r) { return r.ts >= today.getTime(); }).length;
    var weekN = VIEW.filter(function (r) { return r.ts >= now - 7 * DAY; }).length;
    var withVoice = VIEW.filter(function (r) { return answered(r.answers[29]) || answered(r.answers[30]); }).length;

    var rated = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(function (id) { var s = ratingStats(Q[id], VIEW); s.q = Q[id]; return s; }).sort(function (a, b) { return b.avg - a.avg; });
    var tile = function (label, val, sub, d) { return '<article class="tile reveal" style="--d:' + d + 'ms"><div class="t-l">' + label + '</div><div class="t-v">' + val + '</div><div class="t-s">' + sub + '</div></article>'; };
    var pick = function (qid, label, d) {
      var t = topOf(qid);
      return t.top ? tile(label, esc(t.top.label), '<b>' + Math.round(t.top.pct) + '%</b> of ' + nf(t.n) + ' respondents', d) : tile(label, '–', 'No data yet', d);
    };
    var hero = '<article class="hero-card reveal zoom"><div><div class="lbl">Total responses</div><div class="hero-n" data-count="' + VIEW.length + '">' + (reduceMotion ? nf(VIEW.length) : '0') + '</div></div>' +
      '<div class="hero-meta"><span class="pill"><b>' + nf(todayN) + '</b> today</span><span class="pill"><b>' + nf(weekN) + '</b> last 7 days</span><span class="pill"><b>' + nf(withVoice) + '</b> with written feedback</span>' +
      (VIEW.length !== ALL.length ? '<span class="pill">filtered from <b>' + nf(ALL.length) + '</b></span>' : '') + '</div></article>';
    var trend = '<article class="card trend-card reveal" style="--d:120ms"><header class="card-h"><div><h3>Responses over time</h3><p>Daily submissions &middot; last ' + trendData(VIEW).counts.length + ' days</p></div><button class="tbl-btn" type="button" aria-pressed="false">Table</button></header><div class="viz"><div class="trend" id="trend"></div></div><div class="tbl-wrap" id="trend-table" hidden></div></article>';

    var tiles = '<div class="tiles">' +
      (rated[0] && rated[0].n ? tile('Highest-rated decision factor', esc(rated[0].q.short), '<b>' + rated[0].avg.toFixed(2) + '</b> / 5 average importance', 0) : tile('Highest-rated decision factor', '–', 'No data yet', 0)) +
      pick(15, 'Most-cited deciding factor', 80) + pick(16, 'Preferred way of learning', 160) +
      pick(24, 'Top post-programme goal', 240) + pick(20, 'Facility students want most', 320) + pick(27, 'Service to strengthen first', 400) + '</div>';

    return sec('overview',
      pageHead('Overview', 'Survey <em>analytics</em>', 'Live results from the Student Expectations &amp; College Experience Survey. Use the filters above to compare student groups.'),
      '<div class="ov-grid">' + hero + trend + '</div>' + tiles);
  }

  function profile() {
    return sec('profile', pageHead('Section A', 'Student <em>profile</em>', 'Who is answering: class, stream, intended programme and where they plan to study.'),
      '<div class="grid-2">' + optionCard(Q[1], { keepOrder: true }) + optionCard(Q[2]) + optionCard(Q[3]) + optionCard(Q[4]) + '</div>');
  }
  function drivers() {
    var qs = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(function (id) { return Q[id]; });
    return sec('drivers', pageHead('Section B', 'Decision <em>drivers</em>', 'How strongly each factor shapes the choice of a college, ranked by average importance.'),
      '<div class="grid-1">' + ratingGroupCard(qs, 'How important is each factor?', 'Q5–Q14 &middot; ranked by average rating (right) &middot; stacked bar shows the 1–5 spread') + heatmap() + '</div>');
  }
  function wants() {
    return sec('wants', pageHead('Section C', 'What students <em>actually want</em>', 'Final decision factors, learning style, skills and the industry exposure they value.'),
      '<div class="grid-2">' + optionCard(Q[15]) + optionCard(Q[17]) + optionCard(Q[16]) + ratingSingleCard(Q[18]) + optionCard(Q[19]) + '</div>');
  }
  function campus() {
    return sec('campus', pageHead('Section D', 'Campus &amp; student <em>experience</em>', 'Facilities, hostel expectations and the activities that make campus life.'),
      '<div class="grid-2">' + optionCard(Q[20]) + optionCard(Q[21]) + ratingSingleCard(Q[22]) + optionCard(Q[23]) + '</div>');
  }
  function career() {
    return sec('career', pageHead('Section E', 'Career &amp; <em>future</em>', 'Where students want to be after the programme, and what proves a college prepared them.'),
      '<div class="grid-2">' + optionCard(Q[24]) + ratingSingleCard(Q[25]) + optionCard(Q[26]) + '</div>');
  }
  function support() {
    return sec('support', pageHead('Section F', 'Management &amp; student <em>support</em>', 'The student services to invest in, and how much easy access to faculty matters.'),
      '<div class="grid-2">' + optionCard(Q[27]) + ratingSingleCard(Q[28]) + '</div>');
  }

  function voices() {
    var kw = keywords(VIEW);
    var kwItems = kw.map(function (k) { return { label: k.label, value: k.value, pct: VIEW.length ? k.value / VIEW.length * 100 : 0 }; });
    var kwCard = kw.length
      ? card({ title: 'Most-mentioned words', sub: 'Q29 &amp; Q30 combined &middot; share of respondents mentioning the word', viz: hbars(kwItems, 'mentions'), table: optTable(kwItems, 'mentions') })
      : '';
    var tools = '<div class="voice-tools"><div class="seg-tabs" id="voice-tabs"><button type="button" data-q="29" class="on">Three improvements</button><button type="button" data-q="30">What tips the choice</button></div>' +
      '<input class="search" id="voice-search" type="search" placeholder="Search comments…" aria-label="Search comments" /></div>';
    return sec('voices', pageHead('Section G', 'Student <em>voices</em>', 'Open-ended answers, in the students’ own words.'),
      '<div class="grid-1">' + kwCard + '<div class="reveal">' + tools + '<p class="voice-q" id="voice-q"></p><div class="quotes" id="quotes"></div><div class="more-wrap" id="voice-more"></div></div></div>');
  }

  function renderQuotes() {
    var q = Q[voiceState.qid];
    $('#voice-q').textContent = 'Q' + q.id + '. ' + q.text;
    var term = voiceState.search.trim().toLowerCase();
    var list = VIEW.filter(function (r) { return answered(r.answers[q.id]) && (!term || String(r.answers[q.id]).toLowerCase().indexOf(term) > -1); })
      .sort(function (a, b) { return b.ts - a.ts; });
    var shown = list.slice(0, voiceState.shown);
    $('#quotes').innerHTML = shown.length ? shown.map(function (r, i) {
      var a = r.answers;
      return '<blockquote class="quote" style="--i:' + (i % 8) + '"><p>' + esc(a[q.id]) + '</p><footer>' + (r.name ? '<span><b>' + esc(r.name) + '</b></span>' : '') + '<span>' + fmtDate(r.ts) + '</span><span>' + esc(a[1]) + '</span><span>' + esc(a[3]) + '</span></footer></blockquote>';
    }).join('') : '<p class="muted">No written responses match.</p>';
    $('#voice-more').innerHTML = list.length > shown.length ? '<button class="btn btn-ghost btn-sm" id="more-btn" type="button">Show more (' + (list.length - shown.length) + ' left)</button>' : (list.length ? '<span class="note">' + nf(list.length) + ' comment' + (list.length === 1 ? '' : 's') + '</span>' : '');
  }

  function responsesSection() {
    return sec('responses', pageHead('Raw data', 'All <em>responses</em>', 'Browse, inspect or delete individual submissions. Use Export CSV for the full dataset.'),
      '<article class="card reveal"><div class="voice-tools"><input class="search" id="tbl-search" type="search" placeholder="Search all answers…" aria-label="Search responses" /></div><div class="tbl-wrap" id="resp-table"></div><div class="pager" id="pager"></div></article>');
  }

  function renderTable() {
    var term = tableState.search.trim().toLowerCase();
    var rows = VIEW.slice().sort(function (a, b) { return b.ts - a.ts; }).filter(function (r) {
      return !term || (JSON.stringify(r.answers) + ' ' + (r.name || '') + ' ' + (r.email || '')).toLowerCase().indexOf(term) > -1;
    });
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    tableState.page = Math.min(tableState.page, pages - 1);
    var slice = rows.slice(tableState.page * PAGE, tableState.page * PAGE + PAGE);
    $('#resp-table').innerHTML = '<table class="tbl"><thead><tr><th>Student</th><th>Submitted</th><th>Class</th><th>Programme</th><th>Studying in</th><th>Primary goal</th><th></th></tr></thead><tbody>' +
      (slice.length ? slice.map(function (r) {
        var a = r.answers;
        return '<tr><td class="who"><b>' + esc(r.name || '—') + '</b>' + (r.demo ? '<span class="tag demo-tag">demo</span>' : '') + '<small>' + (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : 'No email') + '</small></td><td data-label="Submitted">' + fmtDT(r.ts) + '</td><td data-label="Class"><span class="tag">' + esc(a[1]) + '</span></td><td data-label="Programme">' + esc(a[3]) + '</td><td data-label="Studying in">' + esc(a[4]) + '</td><td data-label="Primary goal">' + esc(a[24]) + '</td>' +
          '<td><div class="row-actions"><button class="mini" data-view="' + r.id + '" type="button">View</button><button class="mini danger" data-del="' + r.id + '" type="button">Delete</button></div></td></tr>';
      }).join('') : '<tr><td colspan="7" class="muted">No responses match.</td></tr>') + '</tbody></table>';
    $('#pager').innerHTML = '<span>' + nf(rows.length) + ' response' + (rows.length === 1 ? '' : 's') + ' &middot; page ' + (tableState.page + 1) + ' of ' + pages + '</span>' +
      '<div><button class="mini" id="pg-prev" type="button"' + (tableState.page === 0 ? ' disabled' : '') + '>Previous</button><button class="mini" id="pg-next" type="button"' + (tableState.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>';
  }

  function showDetail(id) {
    var r = ALL.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    $('#detail-kicker').textContent = fmtDT(r.ts) + (r.demo ? ' · demo' : '');
    var who = '<div class="d-sec"><h4>Student</h4><dl style="margin:0"><div class="d-q"><dt>Name</dt><dd>' + esc(r.name || '—') + '</dd></div>' +
      '<div class="d-q"><dt>Email</dt><dd>' + (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : '—') + '</dd></div></dl></div>';
    $('#detail-body').innerHTML = who + S.sections.map(function (sec) {
      return '<div class="d-sec"><h4>' + sec.id + '. ' + esc(sec.title) + '</h4><dl style="margin:0">' + sec.questions.map(function (q) {
        var v = r.answers[q.id];
        var out = !answered(v) ? '<span class="muted">No answer</span>' : Array.isArray(v) ? v.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('')
          : q.type === 'rating' ? '<span class="tag">' + v + ' / 5</span> ' + S.ratingLabels[v - 1] : esc(v);
        return '<div class="d-q"><dt>Q' + q.id + '. ' + esc(q.text) + '</dt><dd>' + out + '</dd></div>';
      }).join('') + '</dl></div>';
    }).join('');
    var dlg = $('#detail');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    $('#detail-body').scrollTop = 0;
  }

  /* ---------------------------------------------------------------- render */
  function emptyState() {
    return sec('overview', pageHead('Overview', 'Survey <em>analytics</em>', ''),
      '<div class="empty reveal zoom"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg></div>' +
      '<h3>No responses yet</h3><p>Once students start submitting the survey, analytics will appear here automatically. Want to see how the dashboard looks first?</p>' +
      '<div class="row"><button class="btn btn-gold" id="demo-load" type="button">Load demo data</button><a class="btn btn-ghost" href="/" target="_blank" rel="noopener">Open the survey</a></div></div>');
  }
  function noMatch() {
    return sec('overview', pageHead('Overview', 'Survey <em>analytics</em>', ''),
      '<div class="empty reveal zoom"><h3>No responses match these filters</h3><p>Try widening the period or clearing a filter.</p><div class="row"><button class="btn btn-gold" id="empty-reset" type="button">Reset filters</button></div></div>');
  }

  /* ------------------------------------------------------------ share survey */
  var SHARE_KEY = 'jcet-share-url';
  var shareState = { addrs: [], url: '', pick: 'origin' };

  function isLocalHost(h) { return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1'; }
  function isPrivateHost(h) { return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h); }
  function parseUrl(v) { try { var u = new URL(String(v).trim()); return /^https?:$/.test(u.protocol) ? u : null; } catch (e) { return null; } }

  function shareSection() {
    return sec('share', pageHead('Share', 'Share the <em>survey</em>', 'Send students the link, or let them scan the QR code with their phone camera.'),
      '<div class="share-grid">' +
      '<article class="card reveal"><header class="card-h"><div><h3>Survey link</h3><p>Choose the address students will use to reach the survey</p></div></header>' +
      '<label class="share-lbl" for="share-pick">Address</label><select id="share-pick" class="share-select"></select>' +
      '<label class="share-lbl" for="share-url">Link</label>' +
      '<div class="copy-row"><input id="share-url" class="share-input" type="url" inputmode="url" spellcheck="false" autocomplete="off" readonly /><button class="btn btn-primary btn-sm" id="share-copy" type="button">Copy link</button></div>' +
      '<p class="share-note" id="share-note" hidden></p>' +
      '<div class="share-actions">' +
      '<a class="btn btn-ghost btn-sm" id="share-wa" target="_blank" rel="noopener">WhatsApp</a>' +
      '<a class="btn btn-ghost btn-sm" id="share-mail">Email</a>' +
      '<button class="btn btn-ghost btn-sm" id="share-native" type="button" hidden>Share…</button>' +
      '<a class="btn btn-ghost btn-sm" id="share-open" target="_blank" rel="noopener">Open survey</a></div>' +
      '<details class="share-help"><summary>Which address should I use?</summary><ul>' +
      '<li><b>Same Wi-Fi / campus network:</b> pick the network address (starts with 192.168 or 10.). Students must be connected to the same network, and this computer has to stay on with the survey running. If Windows asks, allow access through the firewall.</li>' +
      '<li><b>Anyone, anywhere:</b> put the survey online (see the README), then choose &ldquo;Custom address&rdquo; and paste your public web address.</li>' +
      '<li><b>localhost</b> only works on this computer, so it is no use for a QR code.</li></ul></details></article>' +
      '<article class="card reveal qr-card" style="--d:120ms"><div class="qr-frame"><div class="qr-box" id="qr-box" aria-live="polite"></div></div>' +
      '<p class="qr-cap">Scan to take the survey</p><p class="qr-url" id="qr-url"></p>' +
      '<div class="share-actions center"><button class="btn btn-primary btn-sm" id="qr-png" type="button">Download PNG</button>' +
      '<button class="btn btn-ghost btn-sm" id="qr-svg" type="button">Download SVG</button>' +
      '<button class="btn btn-gold btn-sm" id="qr-poster" type="button">Print poster</button></div></article></div>');
  }

  function renderShare() {
    var sel = $('#share-pick'), input = $('#share-url');
    if (!sel) return;
    var origin = location.origin + '/';
    var saved = ''; try { saved = localStorage.getItem(SHARE_KEY) || ''; } catch (e) { /* ignore */ }
    var opts = [{ id: 'origin', label: 'This address: ' + location.host, url: origin }];
    shareState.addrs.forEach(function (a, i) { opts.push({ id: 'net' + i, label: 'Same Wi-Fi: ' + a.url.replace(/^http:\/\//, '').replace(/\/$/, '') + ' (' + a.name + ')', url: a.url }); });
    opts.push({ id: 'custom', label: 'Custom address…', url: '' });
    sel.innerHTML = opts.map(function (o) { return '<option value="' + o.id + '">' + esc(o.label) + '</option>'; }).join('');

    var startId = 'origin';
    if (saved) startId = 'custom';
    else if (isLocalHost(location.hostname) && shareState.addrs.length) startId = 'net0';
    sel.value = startId;
    shareState.opts = opts;
    input.value = startId === 'custom' ? saved : (opts.filter(function (o) { return o.id === startId; })[0] || opts[0]).url;
    input.readOnly = startId !== 'custom';
    updateShare();
  }

  function updateShare() {
    var sel = $('#share-pick'), input = $('#share-url');
    var u = parseUrl(input.value);
    var note = $('#share-note');
    var ok = !!u;
    $('#share-copy').disabled = !ok;
    ['#qr-png', '#qr-svg', '#qr-poster'].forEach(function (id) { $(id).disabled = !ok; });
    input.classList.toggle('bad', !ok && input.value.trim() !== '');
    if (!ok) {
      $('#qr-box').innerHTML = '<div class="qr-empty">Enter a full web address, for example https://survey.yourcollege.edu.in/</div>';
      $('#qr-url').textContent = '';
      note.hidden = false; note.className = 'share-note warn';
      note.textContent = input.value.trim() ? 'That does not look like a full web address. Start it with http:// or https://' : 'Type your public web address above.';
      return;
    }
    var url = u.href;
    shareState.url = url;
    if (sel.value === 'custom') { try { localStorage.setItem(SHARE_KEY, url); } catch (e) { /* ignore */ } }
    $('#qr-box').innerHTML = QR.svg(url, { ec: 'Q' });
    $('#qr-url').textContent = url;
    var host = u.hostname;
    if (isLocalHost(host)) {
      note.hidden = false; note.className = 'share-note warn';
      note.textContent = 'This link only works on this computer. Pick the Wi-Fi address (or your public address) so students’ phones can reach it.';
    } else if (isPrivateHost(host)) {
      note.hidden = false; note.className = 'share-note info';
      note.textContent = 'This works for phones on the same Wi-Fi / network as this computer, and only while it is running. To reach everyone, put the survey online.';
    } else { note.hidden = true; }
    var msg = 'Please share your views in the JCET Student Expectations Survey (about 6 minutes): ' + url;
    $('#share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    $('#share-mail').href = 'mailto:?subject=' + encodeURIComponent('JCET Student Expectations Survey') + '&body=' + encodeURIComponent(msg);
    $('#share-open').href = url;
    $('#share-native').hidden = !navigator.share;
  }

  function download(name, href) {
    var a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  function initShare() {
    // fetch addresses once; re-render the section when they arrive
    if (!shareState.loaded) {
      shareState.loaded = true;
      api('/api/admin/network').then(function (r) { return r.json(); }).then(function (j) { shareState.addrs = j.addresses || []; renderShare(); }).catch(function () { /* origin only */ });
    }
    renderShare();
  }

  function render() {
    var c = $('#content');
    $$('#side-nav a').forEach(function (a) { a.style.display = ALL.length || a.dataset.nav === 'overview' || a.dataset.nav === 'share' ? '' : 'none'; });
    $('#report-btn').hidden = !ALL.length;
    if (!ALL.length) { c.innerHTML = emptyState() + shareSection(); initShare(); }
    else if (!VIEW.length) { c.innerHTML = noMatch() + shareSection(); initShare(); }
    else {
      c.innerHTML = overview() + profile() + drivers() + wants() + campus() + career() + support() + voices() + responsesSection() + shareSection();
      initShare();
      var tbl = drawTrend($('#trend'), VIEW);
      $('#trend-table').innerHTML = tbl;
      renderQuotes();
      renderTable();
      countUp();
    }
    Reveal.observe(c);
    watchNav();
  }

  function countUp() {
    var el = $('.hero-n');
    if (!el || reduceMotion) return;
    var to = Number(el.getAttribute('data-count')), t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / 1100);
      el.textContent = nf(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* --------------------------------------------------------------- nav spy */
  var spy = null;
  function watchNav() {
    if (!('IntersectionObserver' in window)) return;
    if (spy) spy.disconnect();
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        $$('#side-nav a').forEach(function (a) {
          var on = a.dataset.nav === en.target.dataset.navSec;
          a.classList.toggle('active', on);
          // on phones the nav is a horizontal strip: keep the current section centred in it
          if (on && window.innerWidth <= 1100 && a.scrollIntoView) a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    $$('[data-nav-sec]').forEach(function (s) { spy.observe(s); });
  }

  function initScrollBar() {
    var bar = $('.scroll-progress i'), t = false;
    window.addEventListener('scroll', function () {
      if (t) return; t = true;
      requestAnimationFrame(function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
        t = false;
      });
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- events */
  function resetFilters() {
    F = { range: 'all', cls: '', prog: '', dest: '' };
    $('#f-range').value = 'all'; $('#f-cls').value = ''; $('#f-prog').value = ''; $('#f-dest').value = '';
    applyFilters(); render();
  }
  function initEvents() {
    [['#f-range', 'range'], ['#f-cls', 'cls'], ['#f-prog', 'prog'], ['#f-dest', 'dest']].forEach(function (p) {
      $(p[0]).addEventListener('change', function (e) { F[p[1]] = e.target.value; tableState.page = 0; voiceState.shown = 8; applyFilters(); render(); });
    });
    $('#f-reset').addEventListener('click', resetFilters);

    // One-click printable report of exactly what is being viewed (same filters)
    $('#report-btn').addEventListener('click', function () {
      var p = new URLSearchParams();
      if (F.range !== 'all') p.set('range', F.range);
      if (F.cls) p.set('cls', F.cls);
      if (F.prog) p.set('prog', F.prog);
      if (F.dest) p.set('dest', F.dest);
      p.set('print', '1');
      window.open('/admin/report.html?' + p.toString(), '_blank');
    });

    // Share section
    document.addEventListener('change', function (e) {
      if (e.target.id !== 'share-pick') return;
      var input = $('#share-url'), id = e.target.value;
      var o = (shareState.opts || []).filter(function (x) { return x.id === id; })[0];
      if (id === 'custom') {
        var saved = ''; try { saved = localStorage.getItem(SHARE_KEY) || ''; } catch (err) { /* ignore */ }
        input.readOnly = false; input.value = saved || 'https://';
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
      } else {
        input.readOnly = true; input.value = o ? o.url : '';
        try { localStorage.removeItem(SHARE_KEY); } catch (err) { /* ignore */ }
      }
      updateShare();
    });
    document.addEventListener('click', function (e) {
      var id = e.target.id;
      if (id === 'share-copy') {
        var done = function () { toast('Link copied'); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(shareState.url).then(done, function () { toast('Could not copy. Select the link and copy it manually.', 'error'); });
        else { var i = $('#share-url'); i.readOnly = false; i.select(); try { document.execCommand('copy'); done(); } catch (err) { toast('Select the link and copy it manually.', 'error'); } i.readOnly = $('#share-pick').value !== 'custom'; }
      } else if (id === 'qr-png') {
        QR.png(shareState.url, 1024, function (data) { download('jcet-survey-qr.png', data); });
      } else if (id === 'qr-svg') {
        var blobUrl = URL.createObjectURL(new Blob([QR.svg(shareState.url)], { type: 'image/svg+xml' }));
        download('jcet-survey-qr.svg', blobUrl); setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 2000);
      } else if (id === 'qr-poster') {
        window.open('/admin/poster.html?url=' + encodeURIComponent(shareState.url), '_blank');
      } else if (id === 'share-native' && navigator.share) {
        navigator.share({ title: 'JCET Student Expectations Survey', text: 'Please share your views in the JCET Student Expectations Survey.', url: shareState.url }).catch(function () { /* cancelled */ });
      }
    });
    $('#refresh').addEventListener('click', function () {
      var b = $('#refresh'); b.classList.add('spin'); setTimeout(function () { b.classList.remove('spin'); }, 800);
      load(false).then(function () { toast('Data refreshed'); });
    });
    $('#demo-clear').addEventListener('click', function () {
      if (!confirm('Remove all demo responses? Real responses are not affected.')) return;
      api('/api/admin/demo', { method: 'DELETE' }).then(function () { toast('Demo data removed'); return load(false).then(function () { applyFilters(); render(); }); });
    });

    document.addEventListener('click', function (e) {
      var t = e.target;
      var tb = t.closest && t.closest('.tbl-btn');
      if (tb) {
        var cardEl = tb.closest('.card'); var on = tb.getAttribute('aria-pressed') !== 'true';
        tb.setAttribute('aria-pressed', on); tb.textContent = on ? 'Chart' : 'Table';
        $('.viz', cardEl).hidden = on; $('.tbl-wrap', cardEl).hidden = !on;
        return;
      }
      if (t.id === 'demo-load') {
        t.disabled = true;
        api('/api/admin/demo', { method: 'POST' }).then(function () { return load(false); }).then(function () { applyFilters(); render(); toast('Demo data loaded'); });
      }
      if (t.id === 'empty-reset') resetFilters();
      if (t.id === 'more-btn') { voiceState.shown += 8; renderQuotes(); }
      if (t.id === 'pg-prev') { tableState.page--; renderTable(); }
      if (t.id === 'pg-next') { tableState.page++; renderTable(); }
      var vt = t.closest && t.closest('#voice-tabs button');
      if (vt) { voiceState.qid = Number(vt.dataset.q); voiceState.shown = 8; $$('#voice-tabs button').forEach(function (b) { b.classList.toggle('on', b === vt); }); renderQuotes(); }
      if (t.dataset && t.dataset.view) showDetail(t.dataset.view);
      if (t.dataset && t.dataset.del) {
        if (!confirm('Delete this response permanently? This cannot be undone.')) return;
        api('/api/admin/responses/' + t.dataset.del, { method: 'DELETE' }).then(function (r) {
          if (!r.ok) throw new Error();
          ALL = ALL.filter(function (x) { return x.id !== t.dataset.del; });
          applyFilters(); render(); toast('Response deleted');
        }).catch(function (err) { if (!err || err.message !== 'auth') toast('Could not delete response.', 'error'); });
      }
    });
    document.addEventListener('input', function (e) {
      if (e.target.id === 'share-url' && !e.target.readOnly) updateShare();
      if (e.target.id === 'voice-search') { voiceState.search = e.target.value; voiceState.shown = 8; renderQuotes(); }
      if (e.target.id === 'tbl-search') { tableState.search = e.target.value; tableState.page = 0; renderTable(); }
    });
    $('#detail-close').addEventListener('click', function () { $('#detail').close(); });
    $('#detail').addEventListener('click', function (e) { if (e.target === this) this.close(); });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { var t = $('#trend'); if (t && VIEW.length) drawTrend(t, VIEW); }, 180);
    });
    // Pick up new submissions without a manual refresh.
    setInterval(function () { if (!document.hidden && !$('#app').hidden) load(false); }, 30000);
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    initLogin(); initTips(); initEvents(); initScrollBar();
    api('/api/admin/session').then(function (r) { return r.json(); }).then(function (j) {
      if (j.authenticated) load(true); else showLogin();
    }).catch(function () { showLogin(); });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
