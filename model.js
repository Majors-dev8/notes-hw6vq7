/* =============================================================
   model.js — structure d'un pari, calculs de gains, formatage
   ============================================================= */
(function (global) {
  'use strict';

  var PLATFORMS = [
    { id: 'betclic',  label: 'Betclic'  },
    { id: 'winamax',  label: 'Winamax'  },
    { id: 'pmu',      label: 'PMU'      },
    { id: 'autre',    label: 'Autre'    }
  ];

  var TYPES = [
    { id: 'simple',  label: 'Simple'  },
    { id: 'combine', label: 'Combiné' },
    { id: 'systeme', label: 'Système' }
  ];

  var STATUS_LABEL = {
    pending: 'En cours',
    won: 'Gagné',
    lost: 'Perdu',
    void: 'Remboursé',
    cashout: 'Cash-out'
  };

  var ODDS_BUCKETS = [
    { id: 'a', label: '< 1,50', min: 0,   max: 1.5  },
    { id: 'b', label: '1,50–2', min: 1.5, max: 2    },
    { id: 'c', label: '2–3',    min: 2,   max: 3    },
    { id: 'd', label: '3–5',    min: 3,   max: 5    },
    { id: 'e', label: '5–10',   min: 5,   max: 10   },
    { id: 'f', label: '> 10',   min: 10,  max: 1e9  }
  ];

  function uid() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function num(v, fallback) {
    if (v === null || v === undefined || v === '') return fallback === undefined ? null : fallback;
    if (typeof v === 'number') return isFinite(v) ? v : (fallback === undefined ? null : fallback);
    var s = String(v).trim()
      .replace(/ |\s/g, '')
      .replace(/[€$£]/g, '')
      .replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : (fallback === undefined ? null : fallback);
  }

  /* ---------- combinatoire ---------- */

  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    var r = 1;
    for (var i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return Math.round(r);
  }

  /* toutes les combinaisons de k indices parmi n */
  function subsets(n, k) {
    var out = [], cur = [];
    (function walk(start) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = start; i < n; i++) { cur.push(i); walk(i + 1); cur.pop(); }
    })(0);
    return out;
  }

  /* ---------- pari vide ---------- */

  function emptySelection() {
    return {
      id: uid(), sport: '', competition: '', event: '',
      market: '', pick: '', odds: null, status: 'pending', flagged: false
    };
  }

  function emptyBet() {
    var today = new Date();
    return {
      id: uid(),
      createdAt: today.toISOString(),
      date: today.toISOString().slice(0, 10),
      platform: 'betclic',
      type: 'simple',
      systemK: 2,
      stake: null,
      oddsTotal: null,
      oddsAuto: true,
      potentialWin: null,
      freebet: false,
      boosted: false,
      status: 'pending',
      payout: null,
      manual: false,
      note: '',
      source: 'manual',
      selections: [emptySelection()]
    };
  }

  /* ---------- nombre de sélections retenues par combinaison ---------- */

  function comboSize(bet) {
    var n = (bet.selections || []).length;
    if (bet.type === 'simple') return 1;
    if (bet.type === 'combine') return n;
    var k = parseInt(bet.systemK, 10);
    if (!k || k < 1) k = 2;
    return Math.min(k, n);
  }

  function comboCount(bet) {
    var n = (bet.selections || []).length;
    if (bet.type !== 'systeme') return 1;
    return Math.max(1, choose(n, comboSize(bet)));
  }

  /* cote effective d'une sélection : remboursée = 1, perdue = 0 */
  function effOdds(sel) {
    if (sel.status === 'void') return 1;
    if (sel.status === 'lost') return 0;
    var o = num(sel.odds, 0);
    return o > 0 ? o : 0;
  }

  /* ---------- calcul du gain ---------- */
  /* Renvoie :
     acquired  — gain déjà acquis avec les sélections réglées
     potential — gain encore atteignable si tout le reste passe
     live / total — combinaisons encore vivantes
     settled   — toutes les sélections sont réglées                       */

  function outcome(bet) {
    var sels = bet.selections || [];
    var n = sels.length;
    var stake = num(bet.stake, 0);
    var res = { acquired: 0, potential: 0, live: 0, total: 1, settled: false, anyLost: false };
    if (!n || !stake) return res;

    var k = comboSize(bet);
    var combos = (bet.type === 'systeme') ? subsets(n, k) : [range(n)];
    if (!combos.length) return res;

    var unit = stake / combos.length;
    res.total = combos.length;

    var allSettled = true;
    for (var i = 0; i < n; i++) if (sels[i].status === 'pending') allSettled = false;
    res.settled = allSettled;

    combos.forEach(function (idx) {
      var dead = false, pending = false, pAcq = 1, pPot = 1;
      idx.forEach(function (j) {
        var s = sels[j];
        if (s.status === 'lost') { dead = true; return; }
        if (s.status === 'pending') pending = true;
        pAcq *= effOdds(s) || num(s.odds, 1) || 1;
        pPot *= (s.status === 'void') ? 1 : (num(s.odds, 1) || 1);
      });
      if (dead) { res.anyLost = true; return; }
      res.live++;
      res.potential += unit * pPot;
      if (!pending) res.acquired += unit * pAcq;
    });

    /* freebet : la mise offerte n'est pas restituée avec le gain */
    if (bet.freebet) {
      var wonCombos = 0, liveCombos = res.live;
      combos.forEach(function (idx) {
        var dead = false, pending = false;
        idx.forEach(function (j) {
          if (sels[j].status === 'lost') dead = true;
          if (sels[j].status === 'pending') pending = true;
        });
        if (!dead && !pending) wonCombos++;
      });
      res.acquired = Math.max(0, res.acquired - unit * wonCombos);
      res.potential = Math.max(0, res.potential - unit * liveCombos);
    }

    res.acquired = round2(res.acquired);
    res.potential = round2(res.potential);
    return res;
  }

  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

  /* Recalcule statut + gain d'un pari à partir de ses sélections.
     Ne touche à rien si le pari a été réglé à la main.             */
  function recompute(bet) {
    if (bet.manual) return bet;
    var o = outcome(bet);
    if (!o.settled) {
      bet.status = 'pending';
      bet.payout = null;
      return bet;
    }
    var allVoid = (bet.selections || []).every(function (s) { return s.status === 'void'; });
    if (allVoid) {
      bet.status = 'void';
      bet.payout = bet.freebet ? 0 : num(bet.stake, 0);
    } else if (o.acquired > 0) {
      bet.status = 'won';
      bet.payout = o.acquired;
    } else {
      bet.status = 'lost';
      bet.payout = 0;
    }
    return bet;
  }

  /* ---------- économie d'un pari ---------- */

  function risk(bet) { return bet.freebet ? 0 : num(bet.stake, 0); }

  function payoutOf(bet) {
    if (bet.status === 'pending') return null;
    if (bet.payout !== null && bet.payout !== undefined) return num(bet.payout, 0);
    if (bet.status === 'won') {
      var o = num(bet.oddsTotal, 0), s = num(bet.stake, 0);
      return round2(bet.freebet ? s * Math.max(0, o - 1) : s * o);
    }
    if (bet.status === 'void') return bet.freebet ? 0 : num(bet.stake, 0);
    return 0;
  }

  function profit(bet) {
    if (bet.status === 'pending') return 0;
    var p = payoutOf(bet);
    return round2((p === null ? 0 : p) - risk(bet));
  }

  /* mise prise en compte dans le ROI */
  function stakeForRoi(bet, excludeFreebets) {
    if (bet.status === 'pending') return 0;
    if (bet.freebet && excludeFreebets !== false) return 0;
    return num(bet.stake, 0);
  }

  /* ---------- cohérence des données lues sur une capture ---------- */

  function checkConsistency(bet) {
    var issues = [];
    var sels = bet.selections || [];
    var stake = num(bet.stake, 0);
    var total = num(bet.oddsTotal, 0);
    var pot = num(bet.potentialWin, 0);

    if (!stake) issues.push({ field: 'stake', msg: 'Mise absente' });
    if (!total && bet.type !== 'systeme') issues.push({ field: 'oddsTotal', msg: 'Cote totale absente' });

    if (bet.type !== 'systeme' && sels.length > 1 && total) {
      var prod = 1, ok = true;
      sels.forEach(function (s) { var o = num(s.odds, 0); if (!o) ok = false; prod *= o; });
      if (ok && Math.abs(prod - total) / total > 0.05) {
        issues.push({ field: 'oddsTotal', msg: 'Le produit des cotes (' + fmtOdds(prod) + ') ne colle pas à la cote totale' });
      }
    }
    if (stake && total && pot) {
      var expect = bet.freebet ? stake * (total - 1) : stake * total;
      if (expect > 0 && Math.abs(expect - pot) / expect > 0.05) {
        issues.push({ field: 'potentialWin', msg: 'Mise × cote donne ' + fmtEur(expect) + ', pas ' + fmtEur(pot) });
      }
    }
    sels.forEach(function (s, i) {
      var o = num(s.odds, 0);
      if (!o) issues.push({ field: 'sel:' + i, msg: 'Cote manquante sur la sélection ' + (i + 1) });
      else if (o < 1.01 || o > 5000) issues.push({ field: 'sel:' + i, msg: 'Cote improbable sur la sélection ' + (i + 1) });
    });
    return issues;
  }

  /* ---------- formatage ---------- */

  var hideAmounts = false;
  function setPrivacy(v) { hideAmounts = !!v; }

  function fmtEur(v, opts) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (hideAmounts && !(opts && opts.force)) return '••• €';
    var sign = (opts && opts.signed && v > 0) ? '+' : '';
    return sign + new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(v);
  }

  function fmtOdds(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }

  function fmtPct(v, signed) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var sign = (signed && v > 0) ? '+' : '';
    return sign + new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + ' %';
  }

  function fmtDate(iso, style) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d)) return '';
    if (style === 'long') return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function relDay(iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var diff = Math.round((d - today) / 86400000);
    if (diff === 0) return "aujourd'hui";
    if (diff === -1) return 'hier';
    if (diff === 1) return 'demain';
    return fmtDate(iso);
  }

  function typeLabel(bet) {
    var n = (bet.selections || []).length;
    if (bet.type === 'simple') return 'Simple';
    if (bet.type === 'combine') return 'Combiné · ' + n + ' sélection' + (n > 1 ? 's' : '');
    return 'Système ' + comboSize(bet) + '/' + n;
  }

  function platformLabel(id) {
    for (var i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i].id === id) return PLATFORMS[i].label;
    return 'Autre';
  }

  function oddsBucket(o) {
    for (var i = 0; i < ODDS_BUCKETS.length; i++) {
      if (o >= ODDS_BUCKETS[i].min && o < ODDS_BUCKETS[i].max) return ODDS_BUCKETS[i];
    }
    return ODDS_BUCKETS[ODDS_BUCKETS.length - 1];
  }

  global.Model = {
    PLATFORMS: PLATFORMS, TYPES: TYPES, STATUS_LABEL: STATUS_LABEL, ODDS_BUCKETS: ODDS_BUCKETS,
    uid: uid, num: num, round2: round2, choose: choose,
    emptyBet: emptyBet, emptySelection: emptySelection,
    comboSize: comboSize, comboCount: comboCount,
    outcome: outcome, recompute: recompute,
    risk: risk, payoutOf: payoutOf, profit: profit, stakeForRoi: stakeForRoi,
    checkConsistency: checkConsistency,
    setPrivacy: setPrivacy,
    fmtEur: fmtEur, fmtOdds: fmtOdds, fmtPct: fmtPct, fmtDate: fmtDate, relDay: relDay,
    typeLabel: typeLabel, platformLabel: platformLabel, oddsBucket: oddsBucket
  };
})(window);
