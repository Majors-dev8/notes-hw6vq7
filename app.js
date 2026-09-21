/* =============================================================
   app.js — navigation, écrans et interactions
   ============================================================= */
(function () {
  'use strict';

  var esc = UI.esc, icon = UI.icon;

  var state = {
    screen: 'home',
    homePlatform: '',
    histFilters: { platform: '', status: '', days: 30 },
    statsTab: 'overview',
    statsDays: 30,
    batch: [],          // paris en cours de vérification / saisie
    batchMode: 'ocr',   // ocr | manual | edit
    detailId: null,
    lastPreview: null,
    job: null          // lecture de capture en cours ou prête à vérifier
  };

  var SPORTS = ['Football', 'Basket', 'Tennis', 'Rugby', 'Hockey', 'Handball',
                'Courses hippiques', 'Volley', 'MMA', 'Autre'];

  /* =========================================================
     Navigation
     ========================================================= */

  function go(hash) {
    if (location.hash === hash) router();
    else location.hash = hash;
  }

  function router() {
    var h = (location.hash || '#home').slice(1);
    var parts = h.split('/');
    var name = parts[0] || 'home';

    if (name === 'detail') {
      state.detailId = parts[1] || null;
      if (!Store.get(state.detailId)) { go('#home'); return; }
    }
    if (name === 'review' && !state.batch.length) { go('#import'); return; }

    var known = ['home', 'import', 'review', 'detail', 'history', 'stats', 'settings'];
    if (known.indexOf(name) < 0) name = 'home';
    state.screen = name;

    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    var el = document.getElementById('s-' + name);
    if (el) el.classList.add('active');

    document.querySelectorAll('#tabbar a[data-nav]').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-nav') === name);
    });
    var hideNav = (name === 'review' || name === 'detail');
    document.getElementById('tabbar').classList.toggle('hidden', hideNav);
    /* pendant la vérification, le bandeau ferait doublon avec la barre d'action */
    var bar = document.getElementById('jobbar');
    if (bar) bar.style.display = (name === 'review' && state.job && state.job.ready) ? 'none' : '';

    window.scrollTo(0, 0);
    render();
  }

  function render() {
    switch (state.screen) {
      case 'home': renderHome(); break;
      case 'history': renderHistory(); break;
      case 'stats': renderStats(); break;
      case 'settings': renderSettings(); maybeAutoDetect(); break;
      case 'review': renderReview(); break;
      case 'detail': renderDetail(); break;
      case 'import': renderImport(); break;
    }
  }

  /* =========================================================
     Bandeau de lecture : la lecture continue quand on navigue,
     encore faut-il le voir.
     ========================================================= */

  function setJob(job) {
    state.job = job;
    var bar = document.getElementById('jobbar');
    if (!job) {
      bar.classList.remove('show', 'ready');
      document.body.classList.remove('has-job');
      return;
    }
    document.getElementById('job-title').textContent = job.title;
    document.getElementById('job-sub').textContent = job.sub || '';
    document.getElementById('job-spin').classList.toggle('hidden', !!job.ready);
    document.getElementById('job-go').classList.toggle('hidden', !job.ready);
    bar.classList.toggle('ready', !!job.ready);
    bar.classList.add('show');
    document.body.classList.add('has-job');
  }

  /* Fermer l'onglet pendant une lecture la perd vraiment : on prévient. */
  function guardUnload(e) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  function holdPage(on) {
    window.removeEventListener('beforeunload', guardUnload);
    if (on) window.addEventListener('beforeunload', guardUnload);
  }

  /* =========================================================
     Accueil
     ========================================================= */

  function renderHome() {
    var all = Store.all();
    var cfg = Store.getSettings();
    var scoped = Stats.filter(all, { days: 30, platform: state.homePlatform });
    var sum = Stats.summary(scoped, cfg.excludeFreebets);

    document.getElementById('home-period').textContent =
      new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    document.getElementById('home-count').textContent =
      sum.settledCount + ' pari' + (sum.settledCount > 1 ? 's' : '') + ' réglé' + (sum.settledCount > 1 ? 's' : '');

    var pEl = document.getElementById('home-profit');
    pEl.textContent = sum.settledCount ? Model.fmtEur(sum.profit, { signed: true }) : '—';
    pEl.className = 'balance num ' + (sum.profit > 0 ? 'pos' : (sum.profit < 0 ? 'neg' : ''));

    document.getElementById('home-spark').innerHTML = UI.sparkline(Stats.curve(scoped));
    document.getElementById('home-staked').textContent = Model.fmtEur(sum.staked);
    var roiEl = document.getElementById('home-roi');
    roiEl.textContent = Model.fmtPct(sum.roi, true);
    roiEl.className = 'v num ' + (sum.roi > 0 ? 'pos' : (sum.roi < 0 ? 'neg' : ''));
    document.getElementById('home-hit').textContent = Model.fmtPct(sum.hitRate);

    /* filtres plateforme */
    var f = document.getElementById('home-filters');
    var chips = [{ id: '', label: 'Tout' }].concat(Model.PLATFORMS.map(function (p) { return { id: p.id, label: p.label }; }));
    f.innerHTML = chips.map(function (c) {
      return '<button type="button" class="chip' + (state.homePlatform === c.id ? ' on' : '') +
        '" data-plat="' + esc(c.id) + '">' + esc(c.label) + '</button>';
    }).join('');

    var pending = all.filter(function (b) { return b.status === 'pending'; })
      .filter(function (b) { return !state.homePlatform || b.platform === state.homePlatform; });
    var recent = scoped.filter(function (b) { return b.status !== 'pending'; }).slice(0, 4);

    var pendStake = pending.reduce(function (a, b) { return a + Model.num(b.stake, 0); }, 0);
    document.getElementById('home-pending-sum').textContent =
      pending.length ? Model.fmtEur(pendStake) + ' engagés' : '';
    document.getElementById('home-pending').innerHTML = pending.map(UI.betRow).join('');
    document.getElementById('home-pending-wrap').classList.toggle('hidden', !pending.length);

    document.getElementById('home-recent').innerHTML = recent.map(UI.betRow).join('');
    document.getElementById('home-recent-wrap').classList.toggle('hidden', !recent.length);
    document.getElementById('home-empty').classList.toggle('hidden', all.length > 0);
  }

  /* =========================================================
     Import
     ========================================================= */

  function renderImport() {
    document.getElementById('ocr-progress').classList.add('hidden');
    var err = document.getElementById('ocr-error');
    err.classList.add('hidden'); err.style.display = 'none';
  }

  function handleFiles(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) {
      return f && /^image\//.test(f.type);
    });
    if (!list.length) { UI.toast('Choisis une image (PNG ou JPG).', 'err'); return; }

    var prog = document.getElementById('ocr-progress');
    var err = document.getElementById('ocr-error');
    err.classList.add('hidden'); err.style.display = 'none';
    prog.classList.remove('hidden');
    document.getElementById('ocr-file').textContent =
      list[0].name + (list.length > 1 ? ' + ' + (list.length - 1) + ' autre(s)' : '');
    document.getElementById('ocr-title').textContent = "Lecture de l'image…";
    document.getElementById('ocr-step').textContent = 'Préparation…';

    var thumb = document.getElementById('ocr-thumb');
    var tUrl = URL.createObjectURL(list[0]);
    thumb.src = tUrl;

    var collected = [];
    var errors = [];

    holdPage(true);
    setJob({
      title: list.length > 1 ? 'Lecture de ' + list.length + ' captures…' : 'Lecture de la capture…',
      sub: 'Tu peux continuer à naviguer'
    });

    var chain = list.reduce(function (p, file, i) {
      return p.then(function () {
        var head = list.length > 1 ? 'Capture ' + (i + 1) + ' sur ' + list.length + '…' : 'Lecture par le modèle…';
        document.getElementById('ocr-step').textContent = head;
        if (state.job && !state.job.ready) {
          setJob({ title: head, sub: 'Tu peux continuer à naviguer' });
        }
        return AI.readScreenshot(file, function (step) {
          document.getElementById('ocr-step').textContent = step;
          if (state.job && !state.job.ready) setJob({ title: step, sub: 'Tu peux continuer à naviguer' });
        }).then(function (res) {
          collected = collected.concat(res.bets);
          state.lastPreview = res.preview;
        }).catch(function (e) {
          errors.push((file.name || 'capture') + ' : ' + e.message);
        });
      });
    }, Promise.resolve());

    chain.then(function () {
      URL.revokeObjectURL(tUrl);
      prog.classList.add('hidden');
      holdPage(false);

      if (!collected.length) {
        setJob(null);
        err.innerHTML = icon('alert', 17) + '<p>' + esc(errors[0] || "Aucun pari reconnu.") + '</p>';
        err.classList.remove('hidden'); err.style.display = 'flex';
        if (state.screen !== 'import') UI.toast(errors[0] || 'Aucun pari reconnu.', 'err');
        return;
      }
      if (errors.length) UI.toast(errors.length + ' capture(s) non lue(s).', 'err');

      var bets = collected.map(markKnown);

      /* si l'écran d'import est toujours affiché, on enchaîne directement ;
         sinon on garde le résultat sous la main sans interrompre l'utilisateur */
      if (state.screen === 'import') {
        setJob(null);
        openEditor(bets, 'ocr');
      } else {
        var nUp = bets.filter(function (b) { return b._update; }).length;
        setJob({
          ready: true,
          pending: bets,
          title: bets.length > 1 ? bets.length + ' paris détectés' : '1 pari détecté',
          sub: nUp ? 'dont ' + nUp + ' déjà enregistré' + (nUp > 1 ? 's' : '') + ' · appuie pour vérifier'
                   : 'Appuie pour vérifier et enregistrer'
        });
        UI.toast(bets.length > 1 ? bets.length + ' paris prêts à vérifier.' : 'Pari prêt à vérifier.');
      }
    });
  }

  /* Le numéro lu sur le ticket sert de clé : si le pari est déjà enregistré,
     la capture ne crée pas de doublon, elle met à jour ce qu'on avait. */
  function markKnown(bet) {
    var known = Store.findByRef(bet.platform, bet.ref);
    if (!known) return bet;
    var merged = Model.mergeCapture(known, bet);
    merged.bet._update = {
      id: known.id,
      before: known.status,
      after: merged.bet.status,
      changes: merged.changes,
      ref: known.ref,
      date: known.date
    };
    return merged.bet;
  }

  /* =========================================================
     Éditeur / vérification
     ========================================================= */

  function openEditor(bets, mode) {
    state.batch = bets;
    state.batchMode = mode || 'manual';
    go('#review');
  }

  function renderReview() {
    var multi = state.batch.length > 1;
    document.getElementById('review-title').textContent =
      state.batchMode === 'ocr' ? 'Vérifier' : (state.batchMode === 'edit' ? 'Modifier' : 'Nouveau pari');
    document.getElementById('review-count').textContent = multi ? state.batch.length + ' paris' : '';

    var body = document.getElementById('review-body');
    body.innerHTML =
      (state.batchMode === 'ocr'
        ? '<div class="card note" style="margin-bottom:10px">' + icon('info', 17) +
          '<p>' + (state.batch.some(function (b) { return b._update; })
            ? 'Certains paris étaient déjà enregistrés : leur numéro a été reconnu, seul leur statut change.'
            : 'Tout est pré-rempli. Vérifie ce qui est signalé en orange, puis enregistre.') +
          '</p></div>'
        : '') +
      state.batch.map(editorCard).join('');

    var nUp = state.batch.filter(function (b) { return b._update; }).length;
    var nNew = state.batch.length - nUp;
    var label;
    if (state.batchMode === 'edit') label = 'Enregistrer';
    else if (nUp && !nNew) label = nUp > 1 ? 'Appliquer les ' + nUp + ' mises à jour' : 'Appliquer la mise à jour';
    else if (nUp) label = 'Enregistrer et mettre à jour';
    else label = multi ? 'Enregistrer les ' + nNew : 'Enregistrer';

    document.getElementById('review-bar').innerHTML =
      '<button type="button" class="btn ghost narrow" id="rev-cancel">Annuler</button>' +
      '<button type="button" class="btn" id="rev-save">' + esc(label) + '</button>';
  }

  function editorCard(bet, idx) {
    if (bet._update) return updateCard(bet, idx);
    return fullEditorCard(bet, idx);
  }

  /* Un pari déjà connu n'a pas besoin d'être ressaisi : on montre seulement
     ce que la nouvelle capture change. */
  function updateCard(bet, idx) {
    var u = bet._update;
    var nothing = !u.changes.length;

    var h = '<section class="card' + (nothing ? '' : ' green') + '" data-idx="' + idx + '" style="margin-top:10px">';
    h += '<div class="row-between" style="margin-bottom:12px">' +
      '<span style="display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.06em;color:' +
      (nothing ? 'var(--muted)' : 'var(--green)') + '">' + icon(nothing ? 'info' : 'check', 14, 2.6) +
      (nothing ? 'DÉJÀ À JOUR' : 'MISE À JOUR') + '</span>' +
      '<button type="button" class="del-btn" data-act="drop">' + icon('trash', 17, 1.8) + '</button>' +
      '</div>';

    h += '<div style="display:flex;gap:12px;align-items:center">' +
      '<span class="badge ' + esc(bet.platform) + '">' + esc(Model.platformLabel(bet.platform).charAt(0)) + '</span>' +
      '<span style="flex:1 1 auto;min-width:0">' +
        '<span style="display:block;font-size:14px;font-weight:700">' + esc(Model.typeLabel(bet)) + '</span>' +
        '<span style="display:block;font-size:12px;color:var(--muted);margin-top:3px">n° ' + esc(u.ref) +
          ' · enregistré le ' + esc(Model.fmtDate(u.date)) + '</span>' +
      '</span></div>';

    if (nothing) {
      h += '<p style="margin:14px 0 0;font-size:12.5px;color:var(--muted);line-height:1.55">' +
        'Ce pari est déjà enregistré et la capture n\'apporte rien de nouveau. ' +
        'Tu peux l\'ignorer sans rien perdre.</p>';
    } else {
      h += '<div style="display:flex;align-items:center;gap:10px;margin-top:14px">' +
        '<span class="pill ' + esc(u.before) + '">' + esc(Model.STATUS_LABEL[u.before]) + '</span>' +
        '<span style="color:var(--muted)">' + icon('chevron', 15, 2.2) + '</span>' +
        '<span class="pill ' + esc(u.after) + '">' + esc(Model.STATUS_LABEL[u.after]) + '</span>' +
        '<span style="flex:1 1 auto"></span>' +
        '<span class="num" style="font-size:15px;font-weight:700;color:' +
        (Model.profit(bet) > 0 ? 'var(--green)' : (Model.profit(bet) < 0 ? 'var(--red)' : 'var(--text)')) + '">' +
        esc(bet.status === 'pending' ? '' : Model.fmtEur(Model.profit(bet), { signed: true })) + '</span>' +
        '</div>';

      h += '<ul style="margin:14px 0 0;padding-left:18px;font-size:12.5px;color:var(--text-2);line-height:1.7">' +
        u.changes.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>';
    }

    h += '</section>';
    return h;
  }

  function fullEditorCard(bet, idx) {
    var issues = Model.checkConsistency(bet);
    var o = Model.outcome(bet);
    var expected = Model.num(bet.stake, 0) && Model.num(bet.oddsTotal, 0)
      ? Model.round2(bet.freebet ? bet.stake * (bet.oddsTotal - 1) : bet.stake * bet.oddsTotal)
      : null;

    var h = '<section class="card" data-idx="' + idx + '" style="margin-top:10px">';

    if (state.batch.length > 1) {
      h += '<div class="row-between" style="margin-bottom:12px">' +
        '<span style="font-size:11px;font-weight:800;color:var(--muted);letter-spacing:.06em">PARI ' + (idx + 1) + '</span>' +
        '<button type="button" class="del-btn" data-act="drop">' + icon('trash', 17, 1.8) + '</button>' +
        '</div>';
    }

    /* plateforme */
    h += '<div class="seg" data-role="platform">' + Model.PLATFORMS.map(function (p) {
      return '<button type="button" data-v="' + p.id + '" aria-pressed="' + (bet.platform === p.id) + '">' + esc(p.label) + '</button>';
    }).join('') + '</div>';

    /* type */
    h += '<div class="seg" style="margin-top:10px" data-role="type">' + Model.TYPES.map(function (t) {
      return '<button type="button" data-v="' + t.id + '" aria-pressed="' + (bet.type === t.id) + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>';

    if (bet.type === 'systeme') {
      var n = bet.selections.length;
      h += '<div class="field"><label for="k' + idx + '">FORMAT DU SYSTÈME</label>' +
        '<select id="k' + idx + '" data-field="systemK">' +
        Array.apply(null, { length: Math.max(1, n) }).map(function (_, i) {
          var k = i + 1;
          return '<option value="' + k + '"' + (Model.comboSize(bet) === k ? ' selected' : '') + '>' +
            k + ' sur ' + n + ' · ' + Model.choose(n, k) + ' combinaison' + (Model.choose(n, k) > 1 ? 's' : '') + '</option>';
        }).join('') + '</select></div>';
    }

    /* mise / cote */
    h += '<div class="two" style="margin-top:14px">' +
      '<div class="field" style="margin:0"><label for="st' + idx + '">MISE (€)</label>' +
      '<input id="st' + idx + '" type="text" inputmode="decimal" data-field="stake" value="' +
      esc(fmtInput(bet.stake)) + '"' + (hasIssue(issues, 'stake') ? ' class="flagged"' : '') + '></div>' +
      '<div class="field" style="margin:0"><label for="od' + idx + '">COTE TOTALE</label>' +
      '<input id="od' + idx + '" type="text" inputmode="decimal" data-field="oddsTotal" value="' +
      esc(fmtInput(bet.oddsTotal)) + '"></div>' +
      '</div>';

    /* date et numéro du ticket */
    h += '<div class="two" style="margin-top:14px">' +
      '<div class="field" style="margin:0"><label for="dt' + idx + '">DATE</label>' +
      '<input id="dt' + idx + '" type="date" data-field="date" value="' + esc(bet.date || '') + '"></div>' +
      '<div class="field" style="margin:0"><label for="rf' + idx + '">N° DE PARI</label>' +
      '<input id="rf' + idx + '" type="text" data-field="ref" placeholder="facultatif" ' +
      'style="font-size:14px" value="' + esc(bet.ref || '') + '"></div>' +
      '</div>';

    /* freebet */
    h += '<div class="opt-row" style="padding:12px 0 0">' +
      '<span class="mid"><span class="t1">Pari gratuit (freebet)</span>' +
      '<span class="t2">La mise n\'est pas comptée comme perdue</span></span>' +
      '<button type="button" class="switch" role="switch" data-field="freebet" aria-checked="' + !!bet.freebet +
      '" aria-label="Pari gratuit"><span></span></button></div>';

    /* gain potentiel */
    var coherent = expected !== null && Model.num(bet.potentialWin, 0)
      ? Math.abs(expected - bet.potentialWin) / expected <= 0.05 : true;
    var shown = bet.type === 'systeme' ? o.potential : (expected !== null ? expected : Model.num(bet.potentialWin, null));
    var empty = !shown;
    var tone = empty ? 'muted' : (coherent ? 'green' : 'amber');
    var bgc = tone === 'muted' ? 'var(--surface-2)' : (tone === 'green' ? 'rgba(52,211,153,.08)' : 'rgba(251,191,36,.08)');
    var brd = tone === 'muted' ? 'var(--border)' : (tone === 'green' ? 'var(--green-border)' : '#5A4A1E');
    var col = tone === 'muted' ? 'var(--muted)' : (tone === 'green' ? 'var(--green)' : 'var(--amber)');
    h += '<div class="row-between" data-role="computed" style="margin-top:14px;padding:12px 14px;border-radius:14px;' +
      'background:' + bgc + ';border:1px solid ' + brd + '">' +
      '<span style="display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:' + col + '">' +
      icon(tone === 'muted' ? 'info' : (tone === 'green' ? 'check' : 'alert'), 15, 2.4) +
      (empty ? 'Renseigne la mise et la cote' : (coherent ? 'Gain potentiel' : 'Chiffres incohérents')) + '</span>' +
      '<span class="num" style="font-size:15px;font-weight:700">' + esc(empty ? '' : Model.fmtEur(shown)) + '</span></div>';

    /* sélections */
    h += '<div style="font-size:11px;font-weight:800;color:var(--muted);letter-spacing:.06em;margin:16px 2px 8px">' +
      bet.selections.length + ' SÉLECTION' + (bet.selections.length > 1 ? 'S' : '') + '</div>';

    h += bet.selections.map(function (s, j) { return selectionEditor(s, idx, j, bet.selections.length); }).join('');
    h += '<button type="button" class="inline-add" data-act="add-sel">' + icon('plus', 16) + 'Ajouter une sélection</button>';

    h += '<div data-role="issues">' + (issues.length
      ? '<div class="note amber" style="margin-top:12px">' + icon('alert', 16) +
        '<p>' + issues.map(function (i) { return esc(i.msg); }).join('<br>') + '</p></div>'
      : '') + '</div>';

    h += '</section>';
    return h;
  }

  function selectionEditor(sel, idx, j, total) {
    var flag = !!sel.flagged;
    return '<div class="sel' + (flag ? ' flag' : '') + '" data-sel="' + j + '">' +
      '<input class="inp" style="margin:0;min-height:42px;font-family:var(--font);font-size:14px" ' +
        'type="text" data-sfield="event" placeholder="Match ou course" value="' + esc(sel.event) + '">' +
      '<div class="two" style="margin-top:8px">' +
        '<input class="inp" style="margin:0;min-height:42px;font-family:var(--font);font-size:13.5px" ' +
          'type="text" data-sfield="market" placeholder="Marché et choix" value="' +
          esc([sel.market, sel.pick].filter(Boolean).join(' · ')) + '">' +
        '<input class="inp" style="margin:0;min-height:42px;max-width:96px;font-size:15px" ' +
          'type="text" inputmode="decimal" data-sfield="odds" placeholder="Cote" value="' + esc(fmtInput(sel.odds)) + '">' +
      '</div>' +
      '<div class="two" style="margin-top:8px;align-items:center">' +
        '<select class="inp" style="margin:0;min-height:42px;font-family:var(--font);font-size:13px;font-weight:600" data-sfield="sport">' +
          '<option value="">Sport…</option>' +
          SPORTS.map(function (sp) {
            return '<option value="' + esc(sp) + '"' + (sel.sport === sp ? ' selected' : '') + '>' + esc(sp) + '</option>';
          }).join('') +
        '</select>' +
        (total > 1
          ? '<button type="button" class="btn ghost sm" style="min-height:42px;max-width:96px" data-act="del-sel">Retirer</button>'
          : '<span></span>') +
      '</div>' +
      (flag ? '<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--amber);font-weight:700;margin-top:8px">' +
        icon('alert', 13, 2.2) + 'À confirmer</div>' : '') +
      '</div>';
  }

  function hasIssue(issues, field) {
    return issues.some(function (i) { return i.field === field; });
  }

  function fmtInput(v) {
    if (v === null || v === undefined || v === '') return '';
    return String(v).replace('.', ',');
  }

  /* --- interactions de l'éditeur --- */

  function batchAt(node) {
    var card = node.closest('[data-idx]');
    if (!card) return null;
    var i = parseInt(card.getAttribute('data-idx'), 10);
    return { bet: state.batch[i], idx: i, card: card };
  }

  function refreshCard(idx) {
    var card = document.querySelector('#review-body [data-idx="' + idx + '"]');
    if (!card) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = editorCard(state.batch[idx], idx);
    card.replaceWith(tmp.firstElementChild);
  }

  function refreshComputed(idx) {
    var card = document.querySelector('#review-body [data-idx="' + idx + '"]');
    if (!card) return;
    var bet = state.batch[idx];
    var tmp = document.createElement('div');
    tmp.innerHTML = editorCard(bet, idx);
    var fresh = tmp.firstElementChild;
    ['computed', 'issues'].forEach(function (role) {
      var a = card.querySelector('[data-role="' + role + '"]');
      var b = fresh.querySelector('[data-role="' + role + '"]');
      if (a && b) a.replaceWith(b);
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;

    /* filtres accueil */
    var plat = t.closest('[data-plat]');
    if (plat && state.screen === 'home') {
      state.homePlatform = plat.getAttribute('data-plat');
      renderHome();
      return;
    }

    /* ouverture d'un pari */
    var row = t.closest('[data-bet]');
    if (row) { go('#detail/' + row.getAttribute('data-bet')); return; }

    if (state.screen !== 'review') return;

    var ctx;

    var seg = t.closest('.seg[data-role] button');
    if (seg) {
      ctx = batchAt(seg);
      if (!ctx) return;
      var role = seg.parentElement.getAttribute('data-role');
      ctx.bet[role] = seg.getAttribute('data-v');
      if (role === 'type') {
        if (ctx.bet.type === 'simple' && ctx.bet.selections.length > 1) {
          ctx.bet.selections = [ctx.bet.selections[0]];
        }
        if (ctx.bet.type === 'systeme' && ctx.bet.selections.length < 3) {
          while (ctx.bet.selections.length < 3) ctx.bet.selections.push(Model.emptySelection());
        }
        ctx.bet.oddsAuto = true;
        syncOdds(ctx.bet);
      }
      refreshCard(ctx.idx);
      return;
    }

    var sw = t.closest('[data-field="freebet"]');
    if (sw) {
      ctx = batchAt(sw);
      if (!ctx) return;
      ctx.bet.freebet = !ctx.bet.freebet;
      refreshCard(ctx.idx);
      return;
    }

    var act = t.closest('[data-act]');
    if (act) {
      ctx = batchAt(act);
      if (!ctx) return;
      var a = act.getAttribute('data-act');
      if (a === 'add-sel') {
        ctx.bet.selections.push(Model.emptySelection());
        if (ctx.bet.type === 'simple') ctx.bet.type = 'combine';
        ctx.bet.oddsAuto = true;
        syncOdds(ctx.bet);
        refreshCard(ctx.idx);
      } else if (a === 'del-sel') {
        var j = parseInt(act.closest('[data-sel]').getAttribute('data-sel'), 10);
        ctx.bet.selections.splice(j, 1);
        if (ctx.bet.selections.length === 1) ctx.bet.type = 'simple';
        ctx.bet.oddsAuto = true;
        syncOdds(ctx.bet);
        refreshCard(ctx.idx);
      } else if (a === 'drop') {
        state.batch.splice(ctx.idx, 1);
        if (!state.batch.length) { go('#home'); return; }
        renderReview();
      }
      return;
    }
  });

  document.addEventListener('input', function (e) {
    if (state.screen !== 'review') return;
    var t = e.target;
    var ctx = batchAt(t);
    if (!ctx) return;

    var f = t.getAttribute('data-field');
    if (f) {
      if (f === 'oddsTotal') { ctx.bet.oddsTotal = Model.num(t.value, null); ctx.bet.oddsAuto = false; }
      else if (f === 'stake') ctx.bet.stake = Model.num(t.value, null);
      else if (f === 'systemK') { ctx.bet.systemK = parseInt(t.value, 10); refreshCard(ctx.idx); return; }
      else ctx.bet[f] = t.value;
      refreshComputed(ctx.idx);
      return;
    }

    var sf = t.getAttribute('data-sfield');
    if (sf) {
      var j = parseInt(t.closest('[data-sel]').getAttribute('data-sel'), 10);
      var sel = ctx.bet.selections[j];
      if (!sel) return;
      if (sf === 'odds') {
        sel.odds = Model.num(t.value, null);
        if (sel.odds) sel.flagged = false;
        if (syncOdds(ctx.bet)) refreshOddsField(ctx.idx);
      } else if (sf === 'market') {
        sel.market = t.value; sel.pick = '';
      } else {
        sel[sf] = t.value;
      }
      refreshComputed(ctx.idx);
    }
  });

  /* Recalcule la cote totale d'un combiné à partir des sélections.
     Une cote saisie à la main ou lue sur le ticket n'est jamais écrasée. */
  function syncOdds(bet) {
    if (bet.type === 'systeme') return false;
    if (bet.oddsAuto === false && Model.num(bet.oddsTotal, 0)) return false;
    var prod = 1, ok = true;
    bet.selections.forEach(function (s) {
      var o = Model.num(s.odds, 0);
      if (!o) ok = false; else prod *= o;
    });
    if (!ok) return false;
    var v = Model.round2(prod);
    if (v === bet.oddsTotal) return false;
    bet.oddsTotal = v;
    bet.oddsAuto = true;
    return true;
  }

  /* met à jour le champ Cote totale sans re-rendre la carte (le focus est ailleurs) */
  function refreshOddsField(idx) {
    var f = document.querySelector('#review-body [data-idx="' + idx + '"] [data-field="oddsTotal"]');
    if (f && document.activeElement !== f) f.value = fmtInput(state.batch[idx].oddsTotal);
  }

  /* =========================================================
     Détail d'un pari
     ========================================================= */

  function renderDetail() {
    var bet = Store.get(state.detailId);
    if (!bet) { go('#home'); return; }

    var o = Model.outcome(bet);
    var st = bet.status;

    document.getElementById('detail-title').textContent = Model.typeLabel(bet);
    document.getElementById('detail-sub').textContent =
      Model.platformLabel(bet.platform) + ' · ' + Model.fmtDate(bet.date) +
      (bet.type === 'systeme' ? ' · ' + Model.comboCount(bet) + ' combis' : '') +
      (bet.freebet ? ' · freebet' : '') +
      (bet.ref ? ' · n° ' + bet.ref : '');
    var pill = document.getElementById('detail-status');
    pill.className = 'pill ' + st;
    pill.textContent = Model.STATUS_LABEL[st] || st;

    var body = document.getElementById('detail-body');
    var h = '';

    /* carte résumé */
    h += '<section class="card">';
    if (st === 'pending') {
      h += '<div class="row-between" style="align-items:flex-end">' +
        '<div><div style="font-size:11.5px;color:var(--muted);font-weight:700">Gain déjà acquis</div>' +
        '<div class="num pos" style="font-size:34px;font-weight:700;letter-spacing:-.03em;line-height:1.1;margin-top:2px">' +
        esc(Model.fmtEur(o.acquired)) + '</div></div>' +
        '<div style="text-align:right"><div style="font-size:11.5px;color:var(--muted);font-weight:700">Encore possible</div>' +
        '<div class="num" style="font-size:19px;font-weight:700;margin-top:4px">' + esc(Model.fmtEur(o.potential)) + '</div></div>' +
        '</div>';
    } else {
      var pf = Model.profit(bet);
      h += '<div class="row-between" style="align-items:flex-end">' +
        '<div><div style="font-size:11.5px;color:var(--muted);font-weight:700">Bénéfice</div>' +
        '<div class="num ' + (pf > 0 ? 'pos' : (pf < 0 ? 'neg' : '')) + '" style="font-size:34px;font-weight:700;letter-spacing:-.03em;line-height:1.1;margin-top:2px">' +
        esc(Model.fmtEur(pf, { signed: true })) + '</div></div>' +
        '<div style="text-align:right"><div style="font-size:11.5px;color:var(--muted);font-weight:700">Retour</div>' +
        '<div class="num" style="font-size:19px;font-weight:700;margin-top:4px">' + esc(Model.fmtEur(Model.payoutOf(bet))) + '</div></div>' +
        '</div>';
    }

    h += '<div class="segbars">' + bet.selections.map(function (s) {
      return '<i class="' + esc(s.status) + '"></i>';
    }).join('') + '</div>';

    h += '<div class="kpis">' +
      '<div><div class="k">Mise' + (bet.type === 'systeme' ? ' totale' : '') + '</div><div class="v num">' + esc(Model.fmtEur(Model.num(bet.stake, 0))) + '</div></div>' +
      (bet.type === 'systeme'
        ? '<div><div class="k">Par combi</div><div class="v num">' + esc(Model.fmtEur(Model.round2(Model.num(bet.stake, 0) / Model.comboCount(bet)))) + '</div></div>' +
          '<div><div class="k">Combis vivantes</div><div class="v num">' + o.live + ' / ' + o.total + '</div></div>'
        : '<div><div class="k">Cote</div><div class="v num">' + esc(Model.fmtOdds(Model.num(bet.oddsTotal, 0))) + '</div></div>' +
          '<div><div class="k">Gain max</div><div class="v num">' + esc(Model.fmtEur(o.potential || Model.num(bet.potentialWin, null))) + '</div></div>') +
      '</div></section>';

    /* sélections */
    h += '<div class="sec-title">SÉLECTIONS · APPUIE POUR RÉGLER</div><div class="list">';
    h += bet.selections.map(function (s, j) {
      var ic = s.status === 'won' ? 'check' : (s.status === 'lost' ? 'cross' : (s.status === 'void' ? 'minus' : 'clock'));
      return '<button type="button" class="selrow ' + esc(s.status) + '" data-cycle="' + j + '">' +
        '<span class="dot ' + esc(s.status) + '">' + icon(ic, 14, 2.6) + '</span>' +
        '<span class="mid">' +
          '<span class="n">' + esc(s.event || 'Sélection ' + (j + 1)) + '</span>' +
          '<span class="m">' + esc([s.sport, s.market, s.pick].filter(Boolean).join(' · ') || '—') + '</span>' +
        '</span>' +
        '<span class="o">' + esc(Model.fmtOdds(Model.num(s.odds, 0))) + '</span>' +
        '</button>';
    }).join('') + '</div>';

    if (bet.type === 'systeme') {
      h += '<div class="card note" style="margin-top:12px">' + icon('info', 17) +
        '<p>Le gain est recalculé à chaque sélection réglée, sur les ' + Model.comboCount(bet) +
        ' combinaisons du système.</p></div>';
    }

    if (bet.manual) {
      h += '<div class="card note amber" style="margin-top:10px">' + icon('info', 17) +
        '<p>Ce pari a été réglé à la main. <button type="button" id="reopen" style="background:none;border:none;color:var(--amber);font-weight:800;text-decoration:underline;cursor:pointer;padding:0;font-size:12.5px">Revenir au calcul automatique</button></p></div>';
    }

    if (bet.updatedAt) {
      h += '<div class="card tight" style="margin-top:10px"><p style="margin:0;font-size:11.5px;color:var(--muted)">' +
        'Statut mis à jour depuis une capture le ' + esc(Model.fmtDate(bet.updatedAt)) + '.</p></div>';
    }

    if (bet.note) {
      h += '<div class="card tight" style="margin-top:10px"><p style="margin:0;font-size:13px;color:var(--text-2);line-height:1.5">' + esc(bet.note) + '</p></div>';
    }

    h += '<div style="padding:16px;display:flex;gap:10px">' +
      '<button type="button" class="btn ghost sm" id="det-edit">Modifier</button>' +
      '<button type="button" class="btn ghost sm" id="det-del" style="color:var(--red)">Supprimer</button>' +
      '</div>';

    body.innerHTML = h;

    document.getElementById('detail-bar').innerHTML = st === 'pending'
      ? '<button type="button" class="btn win sm" data-settle="won">Gagné</button>' +
        '<button type="button" class="btn lose sm" data-settle="lost">Perdu</button>' +
        '<button type="button" class="btn void sm" data-settle="void">Remboursé</button>'
      : '<button type="button" class="btn void sm" data-settle="pending">Rouvrir</button>' +
        '<button type="button" class="btn ghost sm" data-settle="cashout">Cash-out…</button>';
  }

  /* interactions du détail */
  document.addEventListener('click', function (e) {
    if (state.screen !== 'detail') return;
    var bet = Store.get(state.detailId);
    if (!bet) return;

    var cyc = e.target.closest('[data-cycle]');
    if (cyc) {
      var j = parseInt(cyc.getAttribute('data-cycle'), 10);
      var order = ['pending', 'won', 'lost', 'void'];
      var cur = order.indexOf(bet.selections[j].status);
      bet.selections[j].status = order[(cur + 1) % order.length];
      bet.manual = false;
      Store.update(bet);
      renderDetail();
      return;
    }

    var set = e.target.closest('[data-settle]');
    if (set) {
      var v = set.getAttribute('data-settle');
      if (v === 'won') {
        bet.manual = false;
        bet.selections.forEach(function (s) { if (s.status === 'pending') s.status = 'won'; });
      } else if (v === 'lost') {
        bet.manual = true; bet.status = 'lost'; bet.payout = 0;
      } else if (v === 'void') {
        bet.manual = true; bet.status = 'void'; bet.payout = bet.freebet ? 0 : Model.num(bet.stake, 0);
      } else if (v === 'pending') {
        bet.manual = false; bet.payout = null;
        bet.selections.forEach(function (s) { s.status = 'pending'; });
      } else if (v === 'cashout') {
        askCashout(bet);
        return;
      }
      Store.update(bet);
      UI.toast('Pari mis à jour.');
      renderDetail();
      return;
    }

    if (e.target.closest('#reopen')) {
      bet.manual = false; bet.payout = null;
      Store.update(bet); renderDetail(); return;
    }
    if (e.target.closest('#det-edit')) {
      openEditor([JSON.parse(JSON.stringify(bet))], 'edit');
      return;
    }
    if (e.target.closest('#det-del')) {
      UI.confirmSheet('Supprimer ce pari ?', 'Il disparaîtra de ton historique et de tes statistiques.', 'Supprimer', true)
        .then(function (ok) {
          if (!ok) return;
          Store.remove(bet.id);
          UI.toast('Pari supprimé.');
          go('#home');
        });
    }
  });

  function askCashout(bet) {
    var s = UI.sheet(
      '<h2>Cash-out</h2><p class="sub">Montant réellement récupéré, mise comprise.</p>' +
      '<div class="field" style="margin-top:0"><label for="co">MONTANT (€)</label>' +
      '<input id="co" type="text" inputmode="decimal" value="' + esc(fmtInput(Model.num(bet.stake, ''))) + '"></div>' +
      '<div class="btn-row" style="margin-top:16px">' +
      '<button type="button" class="btn ghost" data-close>Annuler</button>' +
      '<button type="button" class="btn" id="co-ok">Valider</button></div>'
    );
    var input = s.el.querySelector('#co');
    input.focus();
    s.el.querySelector('#co-ok').addEventListener('click', function () {
      var v = Model.num(input.value, null);
      if (v === null) { UI.toast('Montant invalide.', 'err'); return; }
      bet.manual = true; bet.status = 'cashout'; bet.payout = v;
      Store.update(bet);
      s.close();
      UI.toast('Cash-out enregistré.');
      renderDetail();
    });
  }

  /* =========================================================
     Historique
     ========================================================= */

  function renderHistory() {
    var f = state.histFilters;
    var cfg = Store.getSettings();
    var list = Stats.filter(Store.all(), f);
    var sum = Stats.summary(list, cfg.excludeFreebets);

    var chips = [];
    chips.push(chipGroup('days', [
      { v: 7, l: '7 j' }, { v: 30, l: '30 j' }, { v: 90, l: '90 j' }, { v: 0, l: 'Tout' }
    ], f.days));
    chips.push(chipGroup('platform', [{ v: '', l: 'Toutes' }].concat(
      Model.PLATFORMS.map(function (p) { return { v: p.id, l: p.label }; })), f.platform));
    chips.push(chipGroup('status', [
      { v: '', l: 'Tous' }, { v: 'pending', l: 'En cours' },
      { v: 'won', l: 'Gagnés' }, { v: 'lost', l: 'Perdus' }
    ], f.status));
    document.getElementById('hist-filters').innerHTML = chips.join('');

    document.getElementById('hist-count').textContent =
      list.length + ' pari' + (list.length > 1 ? 's' : '') + ' · ' + Model.fmtEur(sum.staked) + ' misés';
    var pe = document.getElementById('hist-profit');
    pe.textContent = Model.fmtEur(sum.profit, { signed: true });
    pe.className = 'num ' + (sum.profit > 0 ? 'pos' : (sum.profit < 0 ? 'neg' : ''));

    var days = Stats.byDay(list);
    document.getElementById('hist-list').innerHTML = days.length
      ? days.map(function (d) {
          return '<div class="day-head">' +
            '<span class="d">' + esc(Model.fmtDate(d.date, 'long')) + '</span>' +
            '<span class="s ' + (d.profit > 0 ? 'pos' : (d.profit < 0 ? 'neg' : 'mut')) + '">' +
            esc(Model.fmtEur(d.profit, { signed: true })) + '</span></div>' +
            d.bets.map(UI.betRow).join('');
        }).join('')
      : '<div class="empty"><p>Aucun pari avec ces filtres.</p></div>';
  }

  function chipGroup(key, opts, current) {
    return opts.map(function (o) {
      return '<button type="button" class="chip' + (String(current) === String(o.v) ? ' on' : '') +
        '" data-hf="' + key + '" data-hv="' + esc(o.v) + '">' + esc(o.l) + '</button>';
    }).join('');
  }

  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-hf]');
    if (!c || state.screen !== 'history') return;
    var k = c.getAttribute('data-hf'), v = c.getAttribute('data-hv');
    state.histFilters[k] = (k === 'days') ? parseInt(v, 10) : v;
    renderHistory();
  });

  /* =========================================================
     Statistiques
     ========================================================= */

  function renderStats() {
    var cfg = Store.getSettings();
    var xf = cfg.excludeFreebets;
    var list = Stats.filter(Store.all(), { days: state.statsDays });
    var sum = Stats.summary(list, xf);
    var body = document.getElementById('stats-body');

    document.getElementById('stats-range').textContent =
      state.statsDays === 0 ? 'Tout' : state.statsDays + ' j';
    document.querySelectorAll('#stats-tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === state.statsTab);
    });

    if (!Stats.settled(list).length) {
      body.innerHTML = '<div class="empty"><p>Pas encore de pari réglé sur cette période.<br>Les statistiques apparaîtront dès le premier résultat.</p></div>';
      return;
    }

    var h = '';
    if (state.statsTab === 'overview') {
      h += '<section class="card" style="margin-top:12px">' +
        '<div class="row-between"><span style="font-size:12px;color:var(--muted);font-weight:700">Bénéfice cumulé</span>' +
        '<span class="num ' + (sum.profit >= 0 ? 'pos' : 'neg') + '" style="font-size:17px;font-weight:700">' +
        esc(Model.fmtEur(sum.profit, { signed: true })) + '</span></div>' +
        UI.sparkline(Stats.curve(list), { labels: true }) + '</section>';

      h += '<div class="tiles">' +
        tile('ROI', Model.fmtPct(sum.roi, true), sum.roi > 0 ? 'pos' : (sum.roi < 0 ? 'neg' : '')) +
        tile('Taux de réussite', Model.fmtPct(sum.hitRate)) +
        tile('Cote moyenne jouée', Model.fmtOdds(sum.avgOdds)) +
        tile('Cote moyenne gagnante', Model.fmtOdds(sum.avgWinOdds)) +
        '</div>';

      h += '<section class="card" style="margin-top:10px">' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700">Par plateforme</div>' +
        UI.bars(Stats.byPlatform(list, xf), 'profit') + '</section>';

      h += '<section class="card" style="margin-top:10px">' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700">Par type de pari</div>' +
        UI.bars(Stats.byType(list, xf), 'profit') + '</section>';

      var sk = Stats.streaks(list);
      var dd = Stats.maxDrawdown(list);
      h += '<div class="tiles" style="margin-bottom:0">' +
        tile('Série en cours', (sk.current || 0) + (sk.currentKind === 'won' ? ' gagnés' : (sk.currentKind ? ' perdus' : '')),
             sk.currentKind === 'won' ? 'pos' : (sk.currentKind === 'lost' ? 'neg' : '')) +
        tile('Meilleure série', sk.best + ' gagnés', 'pos') +
        tile('Pire creux traversé', Model.fmtEur(-dd.worst), dd.worst ? 'neg' : '') +
        tile('Sous le dernier sommet', Model.fmtEur(-dd.current), dd.current ? 'neg' : '') +
        '</div>';

      h += '<section class="card" style="margin-top:10px">' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700">35 derniers jours</div>' +
        heatmap(Stats.calendar(list, 35)) + '</section>';

    } else if (state.statsTab === 'leaks') {
      h += renderLeaks(list, xf);

    } else if (state.statsTab === 'sports') {
      h += '<section class="card" style="margin-top:12px">' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700">Bénéfice par sport</div>' +
        UI.bars(Stats.bySport(list, xf), 'profit') + '</section>';
      h += tableCard('Détail par sport', Stats.bySport(list, xf));
    } else {
      h += '<section class="card" style="margin-top:12px">' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700">Bénéfice par tranche de cote</div>' +
        UI.bars(Stats.byOdds(list, xf), 'profit') + '</section>';
      h += tableCard('Détail par tranche', Stats.byOdds(list, xf));
    }

    body.innerHTML = h;
  }

  /* Onglet Fuites : les analyses qui montrent où part l'argent. */
  function renderLeaks(list, xf) {
    var h = '';

    var counts = Stats.bySelectionCount(list, xf);
    if (counts.length > 1) {
      h += '<section class="card" style="margin-top:12px">' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700">Rentabilité selon le nombre de sélections</div>' +
        UI.bars(counts, 'profit') +
        selectionCountVerdict(counts) +
        '</section>';
      h += tableCard('Détail par nombre de sélections', counts);
    }

    var nm = Stats.nearMisses(list);
    if (nm.count) {
      h += '<section class="card amber" style="margin-top:10px;display:flex;gap:12px;align-items:center">' +
        '<span style="width:40px;height:40px;flex:0 0 auto;border-radius:14px;background:var(--amber-dim);color:var(--amber);' +
        'display:flex;align-items:center;justify-content:center;font-family:var(--font-num);font-size:17px;font-weight:700">' +
        nm.count + '</span>' +
        '<span style="flex:1 1 auto;min-width:0">' +
        '<span style="display:block;font-size:13px;font-weight:800">Combinés perdus à une sélection près</span>' +
        '<span style="display:block;font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.5">' +
        esc(Model.fmtEur(nm.missed)) + ' de gains manqués' +
        (nm.worst ? ' · « ' + esc(nm.worst.market) + ' » revient ' + nm.worst.n + ' fois' : '') +
        '</span></span></section>';
    }

    var sim = Stats.singlesSimulation(list);
    if (sim) {
      var better = sim.diff > 0;
      h += '<section class="card" style="margin-top:10px">' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700">Et si tu avais tout joué en simples ?</div>' +
        '<div style="display:flex;gap:10px;margin-top:12px">' +
          '<div style="flex:1 1 0"><div style="font-size:11px;color:var(--muted);font-weight:700">En combinés</div>' +
          '<div class="num ' + (sim.real >= 0 ? 'pos' : 'neg') + '" style="font-size:20px;font-weight:700;margin-top:3px">' +
          esc(Model.fmtEur(sim.real, { signed: true })) + '</div></div>' +
          '<div style="flex:1 1 0"><div style="font-size:11px;color:var(--muted);font-weight:700">En simples</div>' +
          '<div class="num ' + (sim.simulated >= 0 ? 'pos' : 'neg') + '" style="font-size:20px;font-weight:700;margin-top:3px">' +
          esc(Model.fmtEur(sim.simulated, { signed: true })) + '</div></div>' +
        '</div>' +
        '<p style="margin:14px 0 0;font-size:12px;color:var(--text-2);line-height:1.6">' +
        'Sur ' + sim.count + ' pari' + (sim.count > 1 ? 's' : '') + ' à plusieurs sélections, à risque identique. ' +
        (better
          ? 'Les simples auraient rapporté ' + esc(Model.fmtEur(sim.diff)) + ' de plus.'
          : 'Les combinés ont mieux fonctionné, de ' + esc(Model.fmtEur(-sim.diff)) + '.') +
        '</p></section>';
    }

    var al = Stats.afterLoss(list);
    if (al.sample >= 6 && al.afterWin && al.afterLoss) {
      var up = al.ratio > 1.15;
      h += '<section class="card' + (up ? ' amber' : '') + '" style="margin-top:10px">' +
        '<div style="font-size:12px;color:var(--muted);font-weight:700">Ta mise après une défaite</div>' +
        '<div style="display:flex;gap:10px;margin-top:12px">' +
          '<div style="flex:1 1 0"><div style="font-size:11px;color:var(--muted);font-weight:700">Après un gain</div>' +
          '<div class="num" style="font-size:20px;font-weight:700;margin-top:3px">' + esc(Model.fmtEur(al.afterWin)) + '</div></div>' +
          '<div style="flex:1 1 0"><div style="font-size:11px;color:var(--muted);font-weight:700">Après une perte</div>' +
          '<div class="num' + (up ? ' warn' : '') + '" style="font-size:20px;font-weight:700;margin-top:3px">' +
          esc(Model.fmtEur(al.afterLoss)) + '</div></div>' +
        '</div>' +
        '<p style="margin:14px 0 0;font-size:12px;color:var(--text-2);line-height:1.6">' +
        (up
          ? 'Tu mises ' + Math.round((al.ratio - 1) * 100) + ' % de plus après avoir perdu. C\'est le schéma classique de la chasse aux pertes : la mise monte au moment où le jugement est le moins clair.'
          : 'Tes mises restent stables après une défaite. C\'est bon signe : c\'est là que la plupart des parieurs dérapent.') +
        '</p></section>';
    }

    if (!h) {
      h = '<div class="empty"><p>Pas encore assez de paris réglés pour repérer quoi que ce soit.<br>' +
        'Ces analyses deviennent parlantes à partir d\'une vingtaine de paris.</p></div>';
    }
    return h;
  }

  /* Lecture honnête des chiffres : on décrit ce que dit le tableau,
     pas ce qu'on croit savoir des parieurs en général. */
  function selectionCountVerdict(counts) {
    var courts = { p: 0, s: 0, n: 0 }, longs = { p: 0, s: 0, n: 0 };
    counts.forEach(function (g) {
      var k = parseInt(g.key, 10);
      var t = k <= 2 ? courts : longs;
      t.p += g.profit; t.s += g.staked; t.n += g.count;
    });
    if (courts.n < 5 || longs.n < 5 || !courts.s || !longs.s) {
      return '<p style="margin:14px 0 0;font-size:11.5px;color:var(--muted);line-height:1.6">' +
        'Il faut au moins cinq paris de chaque format pour que la comparaison veuille dire quelque chose.</p>';
    }
    var rc = (courts.p / courts.s) * 100;
    var rl = (longs.p / longs.s) * 100;
    var txt;
    if (rl < rc - 5) {
      txt = 'Tes paris à trois sélections et plus rendent ' + Model.fmtPct(rc - rl) +
            ' de moins que tes paris courts. Chaque ligne ajoutée multiplie le risque plus vite que le gain.';
    } else if (rl > rc + 5) {
      txt = 'Tes paris longs rendent ' + Model.fmtPct(rl - rc) + ' de plus que tes paris courts. ' +
            'Garde en tête que les grosses cotes demandent beaucoup de paris avant que le chiffre se stabilise.';
    } else {
      txt = 'Paris courts et paris longs se valent à peu près chez toi, ' +
            Model.fmtPct(rc, true) + ' contre ' + Model.fmtPct(rl, true) + ' de rendement.';
    }
    return '<p style="margin:14px 0 0;font-size:11.5px;color:var(--muted);line-height:1.6">' + esc(txt) + '</p>';
  }

  function tile(k, v, cls) {
    return '<div class="tile"><div class="k">' + esc(k) + '</div>' +
      '<div class="v num ' + (cls || '') + '">' + esc(v) + '</div></div>';
  }

  function tableCard(title, groups) {
    if (!groups.length) return '';
    return '<section class="card" style="margin-top:10px">' +
      '<div style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:6px">' + esc(title) + '</div>' +
      groups.map(function (g) {
        return '<div class="row-between" style="padding:9px 0;border-top:1px solid var(--border)">' +
          '<span style="font-size:13px;font-weight:700">' + esc(g.label) + '</span>' +
          '<span style="display:flex;gap:14px;align-items:baseline">' +
          '<span class="mut" style="font-size:11.5px;font-weight:600">' + g.count + ' pari' + (g.count > 1 ? 's' : '') + '</span>' +
          '<span class="num ' + (g.roi > 0 ? 'pos' : (g.roi < 0 ? 'neg' : 'mut')) + '" style="font-size:13px;font-weight:700;min-width:62px;text-align:right">' +
          esc(Model.fmtPct(g.roi, true)) + '</span></span></div>';
      }).join('') + '</section>';
  }

  function heatmap(days) {
    var max = Math.max.apply(null, days.map(function (d) { return Math.abs(d.profit); }).concat([1]));
    return '<div class="heat">' + days.map(function (d) {
      var bg = 'var(--surface-3)';
      if (d.has && d.profit !== 0) {
        var a = Math.max(.18, Math.min(1, Math.abs(d.profit) / max));
        bg = d.profit > 0 ? 'rgba(52,211,153,' + a.toFixed(2) + ')' : 'rgba(251,113,133,' + a.toFixed(2) + ')';
      }
      return '<i title="' + esc(Model.fmtDate(d.date) + ' · ' + Model.fmtEur(d.profit, { signed: true })) +
        '" style="background:' + bg + '"></i>';
    }).join('') + '</div>';
  }

  document.addEventListener('click', function (e) {
    if (state.screen !== 'stats') return;
    var tab = e.target.closest('#stats-tabs button');
    if (tab) { state.statsTab = tab.getAttribute('data-tab'); renderStats(); return; }
    if (e.target.closest('#stats-range')) {
      var seq = [30, 90, 365, 0, 7];
      var i = seq.indexOf(state.statsDays);
      state.statsDays = seq[(i + 1) % seq.length];
      renderStats();
    }
  });

  /* =========================================================
     Réglages
     ========================================================= */

  function renderSettings() {
    var cfg = Store.getSettings();
    document.getElementById('apikey').value = cfg.apiKey || '';
    document.getElementById('model').value = cfg.model || '';
    document.getElementById('quota-today').textContent = Store.quotaToday();
    document.getElementById('opt-freebet').setAttribute('aria-checked', String(!!cfg.excludeFreebets));
    document.getElementById('opt-privacy').setAttribute('aria-checked', String(!!cfg.privacy));
    document.getElementById('opt-units').setAttribute('aria-checked', String(!!cfg.unitMode));
    document.getElementById('unit-value-row').classList.toggle('hidden', !cfg.unitMode);
    var uv = document.getElementById('unit-value');
    if (document.activeElement !== uv) uv.value = String(cfg.unitValue || 10).replace('.', ',');
    document.getElementById('version-line').textContent =
      'Suivi Paris ' + Store.VERSION + ' · ' + Store.all().length + ' paris enregistrés';

    [['prov-gemini', 'gemini'], ['prov-openrouter', 'openrouter']].forEach(function (p) {
      var el = document.getElementById(p[0]);
      var on = cfg.provider === p[1];
      el.style.background = on ? 'rgba(52,211,153,.1)' : 'transparent';
      var dot = el.querySelector('.dotr');
      dot.style.cssText = 'width:20px;height:20px;flex:0 0 auto;border-radius:999px;box-sizing:border-box;' +
        (on ? 'border:6px solid var(--green);background:var(--bg)' : 'border:2px solid #39424F');
    });
  }

  /* première ouverture des réglages avec une clé mais sans modèle : on détecte */
  /* On n'interroge l'API que si c'est nécessaire : chaque appel compte
     dans la quinzaine de requêtes par minute du palier gratuit. */
  function maybeAutoDetect() {
    var cfg = Store.getSettings();
    if (!cfg.apiKey) return;
    if (!cfg.model && !cfg.modelOk) loadModelList();
    else if (modelCache) paintModelList(modelCache);
  }

  function wireSettings() {
    var keyTimer;
    document.getElementById('apikey').addEventListener('input', function () {
      Store.setSetting('apiKey', this.value.trim());
      var st = document.getElementById('key-state');
      st.textContent = 'Clé enregistrée sur cet appareil.';
      st.className = 'hint'; st.style.color = '';
      modelCache = null;
      Store.setSetting('modelOk', false);
      Store.setSetting('badModels', []);
      clearTimeout(keyTimer);
      keyTimer = setTimeout(function () {
        if (Store.getSettings().apiKey.length > 20) loadModelList(true);
      }, 900);
    });
    document.getElementById('model').addEventListener('input', function () {
      Store.setSetting('model', this.value.trim());
    });
    document.getElementById('prov-gemini').addEventListener('click', function () {
      Store.setSetting('provider', 'gemini');
      Store.setSetting('model', '');
      Store.setSetting('modelOk', false);
      Store.setSetting('badModels', []);
      modelCache = null;
      renderSettings();
      loadModelList();
    });
    document.getElementById('prov-openrouter').addEventListener('click', function () {
      Store.setSetting('provider', 'openrouter');
      Store.setSetting('model', '');
      Store.setSetting('modelOk', false);
      Store.setSetting('badModels', []);
      modelCache = null;
      renderSettings();
      loadModelList();
    });
    document.getElementById('test-key').addEventListener('click', function () {
      var st = document.getElementById('key-state');
      st.textContent = 'Test en cours…'; st.className = 'hint'; st.style.color = '';
      AI.testKey().then(function (r) {
        st.textContent = r.switched
          ? 'Clé valide. Modèle retenu après essai : ' + r.model + '.'
          : 'Clé valide. La lecture des captures est opérationnelle.';
        st.className = 'hint'; st.style.color = 'var(--green)';
        renderSettings();
        if (r.switched) loadModelList();
      }).catch(function (e) {
        st.textContent = e.message;
        st.className = 'hint warn'; st.style.color = '';
      });
    });

    document.getElementById('detect-model').addEventListener('click', function () {
      loadModelList(true);
    });

    document.getElementById('model-list').addEventListener('click', function (e) {
      var c = e.target.closest('[data-model]');
      if (!c) return;
      Store.setSetting('model', c.getAttribute('data-model'));
      Store.setSetting('modelOk', false);
      renderSettings();
      paintModelList(modelCache || []);
      UI.toast('Modèle : ' + c.getAttribute('data-model'));
    });
    document.getElementById('opt-freebet').addEventListener('click', function () {
      var v = this.getAttribute('aria-checked') !== 'true';
      Store.setSetting('excludeFreebets', v);
      renderSettings();
    });
    document.getElementById('opt-units').addEventListener('click', function () {
      Store.setSetting('unitMode', this.getAttribute('aria-checked') !== 'true');
      renderSettings();
    });
    document.getElementById('unit-value').addEventListener('input', function () {
      var v = Model.num(this.value, 0);
      if (v > 0) Store.setSetting('unitValue', v);
    });
    document.getElementById('opt-privacy').addEventListener('click', function () {
      var v = this.getAttribute('aria-checked') !== 'true';
      Store.setSetting('privacy', v);
      renderSettings();
    });
    document.getElementById('exp-json').addEventListener('click', function () {
      Store.download('suivi-paris-' + new Date().toISOString().slice(0, 10) + '.json', Store.exportJson());
      UI.toast('Sauvegarde téléchargée.');
    });
    document.getElementById('exp-csv').addEventListener('click', function () {
      Store.download('suivi-paris-' + new Date().toISOString().slice(0, 10) + '.csv', Store.exportCsv(), 'text/csv');
      UI.toast('CSV téléchargé.');
    });
    document.getElementById('imp-json').addEventListener('click', function () {
      document.getElementById('imp-file').click();
    });
    document.getElementById('imp-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var n = Store.importJson(String(r.result));
          UI.toast(n + ' pari(s) ajouté(s).');
          renderSettings();
        } catch (e) { UI.toast(e.message, 'err'); }
      };
      r.readAsText(f);
      this.value = '';
    });
    document.getElementById('wipe').addEventListener('click', function () {
      UI.confirmSheet('Tout effacer ?', 'Tous les paris enregistrés dans ce navigateur seront supprimés. Pense à exporter avant.', 'Tout effacer', true)
        .then(function (ok) {
          if (!ok) return;
          Store.wipe();
          UI.toast('Historique effacé.');
          renderSettings();
        });
    });
  }

  /* Liste les modèles accessibles avec la clé et les propose en pastilles. */
  var modelCache = null;

  function loadModelList(force) {
    var hint = document.getElementById('model-hint');
    var box = document.getElementById('model-list');
    if (!Store.getSettings().apiKey) {
      box.innerHTML = '';
      hint.textContent = 'Ajoute une clé, puis appuie sur Détecter.';
      hint.className = 'hint';
      return;
    }
    if (modelCache && !force) { paintModelList(modelCache); return; }

    hint.textContent = 'Recherche des modèles disponibles…';
    hint.className = 'hint';
    AI.listModels().then(function (ids) {
      modelCache = ids;
      if (!ids.length) {
        hint.textContent = "Aucun modèle compatible n'est accessible avec cette clé.";
        hint.className = 'hint warn';
        return;
      }
      paintModelList(ids);
      var st = Store.getSettings();
      if (!st.model && !st.modelOk) {
        hint.textContent = 'Recherche du modèle qui fonctionne…';
        AI.pickWorkingModel(function (msg) { hint.textContent = msg; }).then(function (r) {
          renderSettings();
          paintModelList(ids);
          UI.toast('Modèle retenu : ' + r.model);
        }).catch(function (e) {
          hint.textContent = e.message;
          hint.className = 'hint warn';
        });
      }
    }).catch(function (e) {
      box.innerHTML = '';
      hint.textContent = e.message;
      hint.className = 'hint warn';
    });
  }

  function paintModelList(ids) {
    var cur = Store.getSettings().model;
    /* on n'affiche que les candidats sérieux, pour ne pas noyer l'écran */
    var shown = ids.filter(function (id) { return /flash|pro/.test(id); }).slice(0, 8);
    if (cur && shown.indexOf(cur) < 0) shown.unshift(cur);

    document.getElementById('model-list').innerHTML = shown.map(function (id) {
      return '<button type="button" class="chip' + (id === cur ? ' on' : '') +
        '" data-model="' + esc(id) + '">' + esc(id) + '</button>';
    }).join('');

    var hint = document.getElementById('model-hint');
    hint.className = 'hint';
    hint.textContent = ids.length + ' modèles disponibles · appuie sur un nom pour en changer';
  }

  /* =========================================================
     Import : câblage
     ========================================================= */

  function wireJobBar() {
    document.getElementById('jobbar').addEventListener('click', function () {
      if (!state.job) return;
      if (state.job.ready) {
        var bets = state.job.pending;
        setJob(null);
        openEditor(bets, 'ocr');
      } else {
        go('#import');
      }
    });
  }

  function wireImport() {
    var drop = document.getElementById('drop');
    var file = document.getElementById('file');
    drop.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () { handleFiles(this.files); this.value = ''; });

    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });

    document.addEventListener('paste', function (e) {
      if (state.screen !== 'import') return;
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) handleFiles(items);
    });

    document.getElementById('go-manual').addEventListener('click', function () {
      openEditor([Model.emptyBet()], 'manual');
    });
  }

  function wireReview() {
    document.addEventListener('click', function (e) {
      if (e.target.closest('#rev-cancel')) {
        state.batch = [];
        go(state.batchMode === 'edit' ? '#home' : '#import');
        return;
      }
      if (e.target.closest('#rev-save')) saveBatch();
    });
  }

  function saveBatch() {
    var updates = state.batch.filter(function (b) { return b._update; });
    var fresh = state.batch.filter(function (b) { return !b._update; });

    var bad = [];
    fresh.forEach(function (b, i) {
      if (!Model.num(b.stake, 0)) bad.push(i + 1);
    });
    if (bad.length) {
      UI.toast('Mise manquante sur le pari ' + bad.join(', ') + '.', 'err');
      return;
    }
    fresh.forEach(function (b) {
      delete b.issues;
      b.selections.forEach(function (s) { s.flagged = false; });
      syncOdds(b);
    });

    /* les paris déjà connus sont mis à jour, pas recréés */
    if (updates.length) {
      updates.forEach(function (b) {
        var id = b._update.id;
        delete b._update;
        delete b.issues;
        b.id = id;
        Store.update(b);
      });
      if (!fresh.length) {
        state.batch = [];
        UI.toast(updates.length > 1
          ? updates.length + ' paris mis à jour.'
          : 'Pari mis à jour.');
        go('#home');
        return;
      }
    }

    if (state.batchMode === 'edit') {
      Store.update(state.batch[0]);
      var id = state.batch[0].id;
      state.batch = [];
      UI.toast('Modifications enregistrées.');
      go('#detail/' + id);
    } else {
      Store.addMany(fresh);
      var n = fresh.length;
      state.batch = [];
      var msg = (n > 1 ? n + ' paris enregistrés' : 'Pari enregistré');
      if (updates.length) msg += ', ' + updates.length + ' mis à jour';
      UI.toast(msg + '.');
      go('#home');
    }
  }

  /* =========================================================
     Partage d'une capture depuis le téléphone
     ========================================================= */

  function checkSharedImage() {
    if (!/[?&]share=/.test(location.search)) return;
    history.replaceState(null, '', location.pathname + location.hash);
    if (!('caches' in window)) return;
    caches.open('sp-share').then(function (c) {
      return c.match('shared-image').then(function (res) {
        if (!res) return;
        return res.blob().then(function (blob) {
          c.delete('shared-image');
          var file = new File([blob], 'partage.jpg', { type: blob.type || 'image/jpeg' });
          go('#import');
          setTimeout(function () { handleFiles([file]); }, 120);
        });
      });
    }).catch(function () {});
  }

  /* =========================================================
     Démarrage
     ========================================================= */

  function boot() {
    Store.load();
    wireImport();
    wireReview();
    wireJobBar();
    wireSettings();
    Store.onChange(function () { if (state.screen === 'home') renderHome(); });

    window.addEventListener('hashchange', router);
    document.getElementById('hist-reset').addEventListener('click', function () {
      state.histFilters = { platform: '', status: '', days: 30 };
      renderHistory();
    });

    router();
    checkSharedImage();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.__app = { state: state, go: go, openEditor: openEditor };
})();
