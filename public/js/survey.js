/* Survey form: renders SURVEY, enforces max-selection rules, tracks progress, submits. */
(function () {
  var S = window.SURVEY;
  var DRAFT_KEY = 'jcet-survey-draft-v2';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var answers = {};
  var who = {};
  var startedAt = Date.now();
  var submitted = false; // once true, nothing may re-save a draft (a blur/change can fire as the form hides)
  var required = S.questions.filter(function (q) { return q.required; });
  var detailReq = S.details.filter(function (d) { return d.required; });
  var TOTAL = required.length + detailReq.length;
  var DETAIL_ERR = { name: 'Please enter your full name.', email: 'Please enter a valid email address.' };
  var SECTIONS = [{ id: 'ID', title: 'Your details' }].concat(S.sections);

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var pad = function (n) { return n < 10 ? '0' + n : String(n); };

  /* ----------------------------------------------------------- rendering */
  function hintFor(q) {
    if (q.type === 'single') return 'Choose one';
    if (q.type === 'rating') return 'Rate 1 to 5';
    if (q.type === 'multi') return 'Select up to ' + q.max;
    return 'Optional';
  }

  function renderQuestion(q) {
    var name = 'q' + q.id;
    var body = '';
    if (q.type === 'single') {
      body = '<div class="chips" role="radiogroup" aria-labelledby="' + name + '-t">' + q.options.map(function (o) {
        return '<label class="chip"><input type="radio" name="' + name + '" value="' + esc(o) + '"><span>' + esc(o) + '</span></label>';
      }).join('') + '</div>';
    } else if (q.type === 'multi') {
      body = '<div class="chips multi" role="group" aria-labelledby="' + name + '-t">' + q.options.map(function (o) {
        return '<label class="chip"><input type="checkbox" name="' + name + '" value="' + esc(o) + '"><span>' + esc(o) + '</span></label>';
      }).join('') + '</div>';
    } else if (q.type === 'rating') {
      var btns = [1, 2, 3, 4, 5].map(function (n) {
        return '<label class="rate" title="' + S.ratingLabels[n - 1] + '"><input type="radio" name="' + name + '" value="' + n + '" aria-label="' + n + ' - ' + S.ratingLabels[n - 1] + '"><span>' + n + '</span></label>';
      }).join('');
      body = '<div class="rating" role="radiogroup" aria-labelledby="' + name + '-t">' + btns + '</div>' +
        '<div class="rating-legend"><span>' + S.ratingLabels[0] + '</span><span class="rating-pick" aria-live="polite"></span><span>' + S.ratingLabels[4] + '</span></div>';
    } else {
      var ph = q.id === 29 ? '1. …\n2. …\n3. …' : 'Tell us in your own words…';
      body = '<div class="ta"><textarea name="' + name + '" maxlength="' + q.maxLength + '" placeholder="' + esc(ph) + '" aria-labelledby="' + name + '-t"></textarea><span class="cc">0 / ' + q.maxLength + '</span></div>';
    }
    var count = q.type === 'multi' ? '<span class="count" data-count>0 / ' + q.max + '</span>' : '';
    return '<div class="q" data-q="' + q.id + '" id="q-' + q.id + '">' +
      '<div class="q-head"><span class="q-num">Q' + pad(q.id) + '</span><div>' +
      '<div class="q-text" id="' + name + '-t">' + esc(q.text) + '</div>' +
      '<div class="q-hint"><span>' + hintFor(q) + '</span>' + count + '<span class="err">Please answer this question</span></div>' +
      '</div></div>' + body + '</div>';
  }

  function renderDetails() {
    var fields = S.details.map(function (d) {
      return '<label class="field" data-field="' + d.id + '"><span>' + esc(d.label) + (d.required ? '<i aria-hidden="true">*</i>' : '') + '</span>' +
        '<input type="' + d.type + '" name="' + d.id + '" maxlength="' + d.maxLength + '" placeholder="' + esc(d.placeholder) + '" autocomplete="' + d.autocomplete + '"' + (d.required ? ' required' : '') + ' />' +
        '<em class="ferr">' + esc(DETAIL_ERR[d.id] || 'This field is required.') + '</em></label>';
    }).join('');
    return '<section class="sec reveal" id="sec-ID" data-sec="ID"><div class="sec-head"><div class="sec-letter id">ID</div>' +
      '<div><h3>Your details</h3><p>So the college knows whose feedback this is. Only the admin team can see these details.</p></div>' +
      '<div class="sec-meta"><b data-sec-count>0 / ' + detailReq.length + '</b>Required</div></div><div class="fields">' + fields + '</div></section>';
  }

  function renderSections() {
    var html = renderDetails();
    S.sections.forEach(function (sec) {
      var first = sec.questions[0].id, last = sec.questions[sec.questions.length - 1].id;
      var reqCount = sec.questions.filter(function (q) { return q.required; }).length;
      html += '<section class="sec reveal" id="sec-' + sec.id + '" data-sec="' + sec.id + '">' +
        '<div class="sec-head"><div class="sec-letter">' + sec.id + '</div><div><h3>' + esc(sec.title) + '</h3><p>' + esc(sec.blurb) + '</p></div>' +
        '<div class="sec-meta"><b data-sec-count>' + (reqCount ? '0 / ' + reqCount : 'Optional') + '</b>Q' + first + (last > first ? '–Q' + last : '') + '</div></div>' +
        sec.questions.map(renderQuestion).join('') + '</section>';
    });
    $('#sections').innerHTML = html;

    $('#rail-list').innerHTML = SECTIONS.map(function (sec) {
      var reqCount = sec.id === 'ID' ? detailReq.length : (S.sections.filter(function (s) { return s.id === sec.id; })[0].questions.filter(function (q) { return q.required; }).length);
      return '<li data-rail="' + sec.id + '"><a href="#sec-' + sec.id + '"><span class="lt">' + sec.id + '</span><span class="rt">' +
        esc(sec.title.split(' — ')[0].replace('What Does the Student Actually Want?', 'What You Want')) +
        '</span><span class="rc">' + (reqCount ? '0/' + reqCount : 'Opt.') + '</span></a></li>';
    }).join('');
  }

  /* ---------------------------------------------------------- state sync */
  function isAnswered(q) {
    var v = answers[q.id];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
  }
  function detailOk(d) {
    var v = (who[d.id] || '').replace(/\s+/g, ' ').trim();
    if (d.type === 'email') return EMAIL_RE.test(v);
    return v.length >= (d.minLength || 1);
  }

  function refresh() {
    var done = 0;
    var perSec = {};
    SECTIONS.forEach(function (s) { perSec[s.id] = { done: 0, total: 0 }; });
    detailReq.forEach(function (d) { perSec.ID.total++; if (detailOk(d)) { done++; perSec.ID.done++; } });
    required.forEach(function (q) {
      perSec[q.section].total++;
      if (isAnswered(q)) { done++; perSec[q.section].done++; }
    });

    S.questions.forEach(function (q) {
      var el = $('#q-' + q.id);
      var ok = isAnswered(q);
      el.classList.toggle('done', ok);
      if (ok) el.classList.remove('invalid');
    });

    var pct = Math.round((done / TOTAL) * 100);
    $('#rail-pct').textContent = pct + '%';
    $('#rail-bar').style.transform = 'scaleX(' + pct / 100 + ')';
    $('#nav-progress-text').textContent = done + '/' + TOTAL;
    $('#nav-progress .bar').style.strokeDashoffset = 94.25 * (1 - done / TOTAL);
    $('#nav-progress').hidden = done === 0 && !document.body.classList.contains('started');
    var left = TOTAL - done;
    $('#submit-hint').textContent = left === 0
      ? 'Everything required is answered. Add your thoughts and submit whenever you are ready.'
      : left + ' required item' + (left === 1 ? '' : 's') + ' still to complete.';

    SECTIONS.forEach(function (s) {
      var p = perSec[s.id];
      if (!p.total) return;
      $('[data-sec="' + s.id + '"] [data-sec-count]').textContent = p.done + ' / ' + p.total;
      var li = $('[data-rail="' + s.id + '"]');
      li.classList.toggle('done', p.done === p.total);
      $('.rc', li).textContent = p.done + '/' + p.total;
    });
    saveDraft();
  }

  function saveDraft() {
    if (submitted) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ a: answers, w: who })); } catch (e) { /* ignore */ }
  }

  function restoreDraft() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || typeof saved !== 'object') return false;
    var a = saved.a || {};
    var w = saved.w || {};
    var any = Object.keys(a).length || w.name || w.email;
    if (!any) return false;
    S.details.forEach(function (d) {
      if (typeof w[d.id] === 'string') { who[d.id] = w[d.id]; $('input[name="' + d.id + '"]').value = w[d.id]; }
    });
    S.questions.forEach(function (q) {
      var v = a[q.id];
      if (v === undefined) return;
      answers[q.id] = v;
      var name = 'q' + q.id;
      if (q.type === 'text') {
        var ta = $('textarea[name="' + name + '"]');
        ta.value = v; $('.cc', ta.parentNode).textContent = v.length + ' / ' + q.maxLength;
      } else {
        $$('input[name="' + name + '"]').forEach(function (inp) {
          inp.checked = Array.isArray(v) ? v.indexOf(inp.value) > -1 : String(v) === inp.value;
        });
        if (q.type === 'multi') syncMulti(q);
        if (q.type === 'rating') $('.rating-pick', $('#q-' + q.id)).textContent = S.ratingLabels[v - 1] || '';
      }
    });
    return true;
  }

  /* multi-select: counter + lock the rest once the maximum is reached */
  function syncMulti(q) {
    var wrap = $('#q-' + q.id);
    var boxes = $$('input[type=checkbox]', wrap);
    var n = boxes.filter(function (b) { return b.checked; }).length;
    var counter = $('[data-count]', wrap);
    counter.textContent = n + ' / ' + q.max + (n >= q.max ? ' · untick one to swap' : '');
    counter.classList.toggle('full', n >= q.max);
    boxes.forEach(function (b) { b.disabled = n >= q.max && !b.checked; });
  }

  function setDetail(input) {
    var d = S.details.filter(function (x) { return x.id === input.name; })[0];
    if (!d) return false;
    who[d.id] = input.value;
    var field = input.closest('.field');
    var ok = detailOk(d);
    if (ok) field.classList.remove('invalid');
    field.classList.toggle('ok', ok);
    document.body.classList.add('started');
    refresh();
    return true;
  }

  function onChange(e) {
    var t = e.target;
    if (setDetail(t)) return;
    var m = /^q(\d+)$/.exec(t.name || '');
    if (!m) return;
    var q = S.byId[m[1]];
    if (q.type === 'multi') {
      syncMulti(q);
      answers[q.id] = $$('input[type=checkbox]', $('#q-' + q.id)).filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
      var c = $('[data-count]', $('#q-' + q.id));
      c.classList.add('bump'); setTimeout(function () { c.classList.remove('bump'); }, 220);
    } else if (q.type === 'rating') {
      answers[q.id] = Number(t.value);
      $('.rating-pick', $('#q-' + q.id)).textContent = S.ratingLabels[Number(t.value) - 1];
    } else {
      answers[q.id] = t.value;
    }
    document.body.classList.add('started');
    refresh();
  }

  function onInput(e) {
    var t = e.target;
    if (t.tagName === 'INPUT' && setDetail(t)) return;
    if (t.tagName !== 'TEXTAREA') return;
    var q = S.byId[/^q(\d+)$/.exec(t.name)[1]];
    answers[q.id] = t.value;
    $('.cc', t.parentNode).textContent = t.value.length + ' / ' + q.maxLength;
    document.body.classList.add('started');
    saveDraft();
  }

  /* ------------------------------------------------------------- submit */
  function submit(e) {
    e.preventDefault();
    $$('.q.invalid, .field.invalid').forEach(function (el) { el.classList.remove('invalid'); });

    var badDetails = detailReq.filter(function (d) { return !detailOk(d); });
    var missing = required.filter(function (q) { return !isAnswered(q); });
    badDetails.forEach(function (d) { $('[data-field="' + d.id + '"]').classList.add('invalid'); });
    missing.forEach(function (q) { $('#q-' + q.id).classList.add('invalid'); });

    if (badDetails.length || missing.length) {
      var firstEl, msg;
      if (badDetails.length) {
        firstEl = $('[data-field="' + badDetails[0].id + '"]');
        msg = DETAIL_ERR[badDetails[0].id] || 'Please complete your details.';
        $('input', firstEl).focus({ preventScroll: true });
      } else {
        firstEl = $('#q-' + missing[0].id);
        msg = 'Please answer question ' + missing[0].id;
      }
      var extra = badDetails.length + missing.length - 1;
      firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(msg + (extra > 0 ? ' (and ' + extra + ' more)' : ''), 'error');
      return;
    }

    var btn = $('#submit-btn');
    btn.disabled = true;
    fetch('/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: who.name, email: who.email, answers: answers, website: $('input[name=website]').value, elapsed: Date.now() - startedAt })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (!res.ok) throw new Error(res.j.error || 'Could not submit. Please try again.');
      submitted = true;
      try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
      showThanks();
    }).catch(function (err) {
      btn.disabled = false;
      toast(err.message || 'Network problem. Please try again.', 'error');
    });
  }

  function showThanks() {
    var first = (who.name || '').trim().split(/\s+/)[0];
    $('#thanks-name').textContent = first ? first + '.' : 'truly.';
    document.body.classList.add('done');
    $('#thanks').hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function reset() {
    submitted = false;
    answers = {};
    who = {};
    $$('#survey-form input[type=radio], #survey-form input[type=checkbox]').forEach(function (i) { i.checked = false; i.disabled = false; });
    $$('#survey-form .field input').forEach(function (i) { i.value = ''; i.closest('.field').classList.remove('ok', 'invalid'); });
    $$('#survey-form textarea').forEach(function (t) { t.value = ''; $('.cc', t.parentNode).textContent = '0 / ' + S.byId[/^q(\d+)$/.exec(t.name)[1]].maxLength; });
    $$('.rating-pick').forEach(function (p) { p.textContent = ''; });
    S.questions.filter(function (q) { return q.type === 'multi'; }).forEach(syncMulti);
    document.body.classList.remove('done', 'started');
    $('#thanks').hidden = true;
    $('#submit-btn').disabled = false;
    startedAt = Date.now();
    refresh();
    window.scrollTo({ top: $('#survey').offsetTop - 40, behavior: 'auto' });
  }

  /* ------------------------------------------------------ scroll effects */
  function initScroll() {
    var nav = $('#nav'), bar = $('.scroll-progress i'), hero = $('#hero');
    var ticking = false;
    function frame() {
      var y = window.scrollY;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      nav.classList.toggle('scrolled', y > 24);
      if (y < window.innerHeight * 1.2) hero.style.setProperty('--sy', y);
      ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
    window.addEventListener('resize', frame);
    frame();

    // Highlight the section currently in view in the side rail.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          $$('.rail-list li').forEach(function (li) { li.classList.toggle('active', li.getAttribute('data-rail') === en.target.getAttribute('data-sec')); });
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      $$('.sec').forEach(function (s) { io.observe(s); });
    }
  }

  /* ---------------------------------------------------------------- init */
  function init() {
    renderSections();
    var restored = restoreDraft();
    $('#survey-form').addEventListener('change', onChange);
    $('#survey-form').addEventListener('input', onInput);
    $('#survey-form').addEventListener('submit', submit);
    $('#again-btn').addEventListener('click', reset);
    $('#nav-progress').addEventListener('click', function () {
      var nextDetail = detailReq.filter(function (d) { return !detailOk(d); })[0];
      var nextQ = required.filter(function (q) { return !isAnswered(q); })[0];
      var target = nextDetail ? $('[data-field="' + nextDetail.id + '"]') : nextQ ? $('#q-' + nextQ.id) : $('#submit-card');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (restored) document.body.classList.add('started');
    refresh();
    // Browser autofill can fill details without firing input events until interaction.
    setTimeout(function () { $$('.field input').forEach(function (i) { if (i.value && who[i.name] !== i.value) setDetail(i); }); }, 600);
    initScroll();
    Reveal.observe();
    if (restored) setTimeout(function () { toast('Welcome back. We restored your saved answers.'); }, 900);
  }

  init();
})();
