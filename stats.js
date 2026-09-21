/* =============================================================
   stats.js — agrégations pour l'écran Statistiques
   ============================================================= */
(function (global) {
  'use strict';

  function inRange(bet, days) {
    if (!days) return true;
    var d = new Date((bet.date || bet.createdAt || '').slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) return true;
    var limit = new Date(); limit.setHours(12, 0, 0, 0);
    limit.setDate(limit.getDate() - days + 1);
    return d >= limit;
  }

  function filter(bets, opts) {
    opts = opts || {};
    return bets.filter(function (b) {
      if (opts.platform && b.platform !== opts.platform) return false;
      if (opts.status && b.status !== opts.status) return false;
      if (opts.type && b.type !== opts.type) return false;
      if (opts.days && !inRange(b, opts.days)) return false;
      return true;
    });
  }

  function settled(bets) {
    return bets.filter(function (b) { return b.status !== 'pending'; });
  }

  /* ---------- synthèse ---------- */

  function summary(bets, excludeFreebets) {
    var s = settled(bets);
    var profit = 0, staked = 0, won = 0, decided = 0, oddsSum = 0, oddsN = 0, wonOddsSum = 0, wonOddsN = 0;
    var pendingStake = 0, pendingCount = 0;

    bets.forEach(function (b) {
      if (b.status === 'pending') {
        pendingStake += Model.num(b.stake, 0);
        pendingCount++;
      }
    });

    s.forEach(function (b) {
      profit += Model.profit(b);
      staked += Model.stakeForRoi(b, excludeFreebets);
      var o = Model.num(b.oddsTotal, 0);
      if (o > 1) { oddsSum += o; oddsN++; }
      if (b.status === 'won' || b.status === 'lost') {
        decided++;
        if (b.status === 'won') { won++; if (o > 1) { wonOddsSum += o; wonOddsN++; } }
      }
    });

    return {
      count: bets.length,
      settledCount: s.length,
      pendingCount: pendingCount,
      pendingStake: Model.round2(pendingStake),
      profit: Model.round2(profit),
      staked: Model.round2(staked),
      roi: staked > 0 ? (profit / staked) * 100 : null,
      hitRate: decided > 0 ? (won / decided) * 100 : null,
      wonCount: won,
      avgOdds: oddsN ? oddsSum / oddsN : null,
      avgWinOdds: wonOddsN ? wonOddsSum / wonOddsN : null,
      avgStake: s.length ? Model.round2(staked / Math.max(1, s.length)) : null
    };
  }

  /* ---------- courbe de bénéfice cumulé ---------- */

  function curve(bets) {
    var s = settled(bets).slice().sort(function (a, b) {
      return String(a.date || a.createdAt).localeCompare(String(b.date || b.createdAt));
    });
    var pts = [{ x: 0, y: 0, date: null }], acc = 0;
    s.forEach(function (b, i) {
      acc += Model.profit(b);
      pts.push({ x: i + 1, y: Model.round2(acc), date: b.date });
    });
    return pts;
  }

  /* ---------- répartitions ---------- */

  function group(bets, keyFn, labelFn, excludeFreebets) {
    var map = {};
    settled(bets).forEach(function (b) {
      var keys = keyFn(b);
      if (!Array.isArray(keys)) keys = [keys];
      keys.forEach(function (k) {
        if (k === null || k === undefined || k === '') k = '—';
        if (!map[k]) map[k] = { key: k, label: labelFn ? labelFn(k, b) : String(k), profit: 0, staked: 0, count: 0, won: 0 };
        map[k].profit += Model.profit(b) / keys.length;
        map[k].staked += Model.stakeForRoi(b, excludeFreebets) / keys.length;
        map[k].count++;
        if (b.status === 'won') map[k].won++;
      });
    });
    return Object.keys(map).map(function (k) {
      var g = map[k];
      g.profit = Model.round2(g.profit);
      g.staked = Model.round2(g.staked);
      g.roi = g.staked > 0 ? (g.profit / g.staked) * 100 : null;
      return g;
    }).sort(function (a, b) { return b.profit - a.profit; });
  }

  function byPlatform(bets, xf) {
    return group(bets, function (b) { return b.platform || 'autre'; },
                 function (k) { return Model.platformLabel(k); }, xf);
  }

  function byType(bets, xf) {
    return group(bets, function (b) { return b.type; }, function (k) {
      return k === 'simple' ? 'Simples' : (k === 'combine' ? 'Combinés' : 'Systèmes');
    }, xf);
  }

  function bySport(bets, xf) {
    return group(bets, function (b) {
      var set = {};
      (b.selections || []).forEach(function (s) { if (s.sport) set[s.sport] = true; });
      var list = Object.keys(set);
      return list.length ? list : ['Non précisé'];
    }, null, xf);
  }

  function byOdds(bets, xf) {
    return group(bets, function (b) {
      var o = Model.num(b.oddsTotal, 0);
      if (!o) return 'x';
      return Model.oddsBucket(o).id;
    }, function (k) {
      for (var i = 0; i < Model.ODDS_BUCKETS.length; i++) {
        if (Model.ODDS_BUCKETS[i].id === k) return Model.ODDS_BUCKETS[i].label;
      }
      return 'Cote inconnue';
    }, xf).sort(function (a, b) {
      var order = Model.ODDS_BUCKETS.map(function (x) { return x.id; }).concat(['x']);
      return order.indexOf(a.key) - order.indexOf(b.key);
    });
  }

  /* ---------- combinés perdus à une sélection près ---------- */

  function nearMisses(bets) {
    var list = [], missed = 0, markets = {};
    bets.forEach(function (b) {
      if (b.status !== 'lost') return;
      if (b.type === 'simple') return;
      var lost = (b.selections || []).filter(function (s) { return s.status === 'lost'; });
      if (lost.length !== 1) return;
      list.push(b);
      var o = Model.num(b.oddsTotal, 0), st = Model.num(b.stake, 0);
      if (o && st) missed += b.freebet ? st * (o - 1) : st * o;
      var m = (lost[0].market || lost[0].pick || '').trim();
      if (m) markets[m] = (markets[m] || 0) + 1;
    });
    var worst = Object.keys(markets).map(function (k) { return { market: k, n: markets[k] }; })
      .sort(function (a, b) { return b.n - a.n; })[0] || null;
    return { count: list.length, missed: Model.round2(missed), worst: worst, bets: list };
  }

  /* ---------- séries ---------- */

  function streaks(bets) {
    var s = settled(bets).slice().sort(function (a, b) {
      return String(a.date || a.createdAt).localeCompare(String(b.date || b.createdAt));
    }).filter(function (b) { return b.status === 'won' || b.status === 'lost'; });

    var best = 0, worst = 0, curW = 0, curL = 0, current = 0, currentKind = null;
    s.forEach(function (b) {
      if (b.status === 'won') { curW++; curL = 0; if (curW > best) best = curW; }
      else { curL++; curW = 0; if (curL > worst) worst = curL; }
    });
    if (s.length) {
      currentKind = s[s.length - 1].status;
      current = currentKind === 'won' ? curW : curL;
    }
    return { best: best, worst: worst, current: current, currentKind: currentKind };
  }

  /* ---------- calendrier ---------- */

  function calendar(bets, days) {
    days = days || 35;
    var map = {};
    settled(bets).forEach(function (b) {
      var d = (b.date || b.createdAt || '').slice(0, 10);
      if (!d) return;
      map[d] = (map[d] || 0) + Model.profit(b);
    });
    var out = [], t = new Date(); t.setHours(12, 0, 0, 0);
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(t); d.setDate(t.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      out.push({ date: key, profit: Model.round2(map[key] || 0), has: map[key] !== undefined });
    }
    return out;
  }

  /* ---------- groupement par jour pour l'historique ---------- */

  function byDay(bets) {
    var map = {};
    bets.forEach(function (b) {
      var d = (b.date || b.createdAt || '').slice(0, 10) || '—';
      if (!map[d]) map[d] = { date: d, bets: [], profit: 0 };
      map[d].bets.push(b);
      map[d].profit += Model.profit(b);
    });
    return Object.keys(map).sort().reverse().map(function (k) {
      map[k].profit = Model.round2(map[k].profit);
      return map[k];
    });
  }

  global.Stats = {
    filter: filter, settled: settled, summary: summary, curve: curve,
    byPlatform: byPlatform, bySport: bySport, byOdds: byOdds, byType: byType,
    nearMisses: nearMisses, streaks: streaks, calendar: calendar, byDay: byDay
  };
})(window);
