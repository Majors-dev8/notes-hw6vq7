/* =============================================================
   ui.js — briques d'interface réutilisables
   ============================================================= */
(function (global) {
  'use strict';

  /* ---------- échappement ---------- */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- icônes ---------- */

  var PATHS = {
    check: '<path d="M5 12.5 9.5 17 19 7"/>',
    cross: '<path d="M7 7l10 10M17 7 7 17"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.4l2.8 1.8"/>',
    minus: '<path d="M6 12h12"/>',
    info:  '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6h.01"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v6M12 17h.01"/>',
    chevron: '<path d="M9 5.5 15.5 12 9 18.5"/>',
    trash: '<path d="M4 7h16M9.5 7V5h5v2M6.5 7l1 13h9l1-13"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    camera: '<path d="M3 8.5h4L8.5 6h7L17 8.5h4v11H3z"/><circle cx="12" cy="13.6" r="3.4"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>'
  };

  function icon(name, size, width) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="' + (width || 2) + '" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PATHS[name] || '') + '</svg>';
  }

  /* ---------- toast ---------- */

  var toastEl, toastTimer;
  function toast(msg, kind) {
    if (!toastEl) toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = (kind === 'err' ? 'err ' : '') + 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ''; }, kind === 'err' ? 5200 : 3000);
  }

  /* ---------- feuille modale ---------- */

  function sheet(html, opts) {
    opts = opts || {};
    var host = document.getElementById('sheet-host');
    var bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    host.appendChild(bg);

    function close() {
      bg.remove();
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.addEventListener('keydown', onKey);

    var box = bg.querySelector('.sheet');
    box.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', close);
    });
    return { el: box, close: close };
  }

  function confirmSheet(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var s = sheet(
        '<h2>' + esc(title) + '</h2>' +
        '<p class="sub">' + esc(text) + '</p>' +
        '<div class="btn-row">' +
        '<button type="button" class="btn ghost" data-no>Annuler</button>' +
        '<button type="button" class="btn' + (danger ? ' lose' : '') + '" data-yes>' + esc(okLabel || 'Confirmer') + '</button>' +
        '</div>',
        { onClose: function () { resolve(false); } }
      );
      s.el.querySelector('[data-no]').addEventListener('click', function () { s.close(); });
      s.el.querySelector('[data-yes]').addEventListener('click', function () {
        s.el.closest('.sheet-bg').remove();
        resolve(true);
      });
    });
  }

  /* ---------- courbe ---------- */

  function sparkline(points, opts) {
    opts = opts || {};
    var w = opts.width || 326, h = opts.height || (opts.labels ? 112 : 62);
    var pad = opts.labels ? 14 : 6;
    if (!points || points.length < 2) {
      return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Pas encore assez de paris pour tracer une courbe">' +
        '<line x1="0" y1="' + (h / 2) + '" x2="' + w + '" y2="' + (h / 2) + '" stroke="#39424F" stroke-width="1" stroke-dasharray="3 4"/>' +
        '</svg>';
    }
    var ys = points.map(function (p) { return p.y; });
    var min = Math.min.apply(null, ys.concat([0]));
    var max = Math.max.apply(null, ys.concat([0]));
    if (max === min) { max = min + 1; }
    var top = pad, bot = h - pad - (opts.labels ? 14 : 0);
    var sx = function (i) { return (i / (points.length - 1)) * w; };
    var sy = function (v) { return bot - ((v - min) / (max - min)) * (bot - top); };

    var last = points[points.length - 1].y;
    var color = last >= 0 ? '#34D399' : '#FB7185';

    var line = points.map(function (p, i) { return (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(p.y).toFixed(1); }).join(' ');
    var area = line + ' L' + w + ' ' + bot + ' L0 ' + bot + ' Z';
    var zeroY = sy(0);

    var labels = '';
    if (opts.labels) {
      var d0 = points.find(function (p) { return p.date; });
      var d1 = points[points.length - 1];
      labels =
        '<text x="0" y="' + (h - 2) + '" fill="#8B94A3" font-family="Manrope, sans-serif" font-size="10" font-weight="600">' +
          esc(d0 && d0.date ? Model.fmtDate(d0.date) : '') + '</text>' +
        '<text x="' + w + '" y="' + (h - 2) + '" fill="#8B94A3" font-family="Manrope, sans-serif" font-size="10" font-weight="600" text-anchor="end">' +
          esc(d1 && d1.date ? Model.fmtDate(d1.date) : '') + '</text>';
    }

    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="Courbe du bénéfice cumulé, actuellement ' + esc(Model.fmtEur(last, { signed: true, force: true })) + '">' +
      '<path d="' + area + '" fill="' + color + '" fill-opacity="0.11"/>' +
      '<path d="' + zeroLine(zeroY, w) + '" stroke="#39424F" stroke-width="1" stroke-dasharray="3 4" fill="none"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + (w - 2) + '" cy="' + sy(last).toFixed(1) + '" r="3.5" fill="' + color + '"/>' +
      labels +
      '</svg>';
  }

  function zeroLine(y, w) { return 'M0 ' + y.toFixed(1) + ' H' + w; }

  /* ---------- ligne de pari ---------- */

  function statusClass(st) { return st || 'pending'; }

  function betRow(bet) {
    var st = bet.status;
    var profit = Model.profit(bet);
    var right, rightCls = '', sub;

    if (st === 'pending') {
      var o = Model.outcome(bet);
      var pot = o.potential || (Model.num(bet.potentialWin, 0));
      right = Model.fmtEur(pot);
      var settledSels = (bet.selections || []).filter(function (s) { return s.status !== 'pending'; }).length;
      var totalSels = (bet.selections || []).length;
      sub = totalSels > 1 && settledSels
        ? '<span class="warn">' + settledSels + '/' + totalSels + ' réglées</span>'
        : '<span class="mut">à venir</span>';
    } else {
      right = Model.fmtEur(profit, { signed: true });
      rightCls = profit > 0 ? 'pos' : (profit < 0 ? 'neg' : 'mut');
      sub = '<span class="' + rightCls + '">' + esc(Model.STATUS_LABEL[st] || st) + '</span>';
    }

    var p = bet.platform || 'autre';
    return '' +
      '<button type="button" class="bet" data-bet="' + esc(bet.id) + '">' +
        '<span class="badge ' + esc(p) + '">' + esc(Model.platformLabel(p).charAt(0)) + '</span>' +
        '<span class="mid">' +
          '<span class="t1">' + esc(Model.typeLabel(bet)) + '</span>' +
          '<span class="t2">' + esc(Model.fmtEur(Model.num(bet.stake, 0))) +
            ' · ' + esc(oddsLabel(bet)) +
            (bet.freebet ? ' · freebet' : '') +
            ' · ' + esc(Model.relDay(bet.date)) +
          '</span>' +
        '</span>' +
        '<span class="right">' +
          '<span class="amount ' + rightCls + '">' + esc(right) + '</span>' +
          '<span class="status">' + sub + '</span>' +
        '</span>' +
      '</button>';
  }

  /* libellé de cote : un système n'a pas de cote unique */
  function oddsLabel(bet) {
    if (bet.type === 'systeme') {
      var n = Model.comboCount(bet);
      return n + ' combinaison' + (n > 1 ? 's' : '');
    }
    var o = Model.num(bet.oddsTotal, 0);
    return o ? 'cote ' + Model.fmtOdds(o) : 'cote à compléter';
  }

  /* ---------- barres horizontales ---------- */

  function bars(groups, valueKey) {
    if (!groups.length) return '<p class="mut" style="font-size:12.5px;margin:12px 0 0">Pas encore de données.</p>';
    var max = Math.max.apply(null, groups.map(function (g) { return Math.abs(g[valueKey] || 0); }).concat([1]));
    return groups.map(function (g) {
      var v = g[valueKey] || 0;
      var pct = Math.max(3, Math.round((Math.abs(v) / max) * 100));
      var color = v >= 0 ? 'var(--green)' : 'var(--red)';
      return '<div class="barrow">' +
        '<span class="lb">' + esc(g.label) + '</span>' +
        '<span class="tr"><i style="width:' + pct + '%;background:' + color + '"></i></span>' +
        '<span class="vl ' + (v >= 0 ? 'pos' : 'neg') + '">' + esc(Model.fmtEur(v, { signed: true })) + '</span>' +
        '</div>';
    }).join('');
  }

  global.UI = {
    esc: esc, icon: icon, toast: toast, sheet: sheet, confirmSheet: confirmSheet,
    sparkline: sparkline, betRow: betRow, bars: bars, statusClass: statusClass
  };
})(window);
