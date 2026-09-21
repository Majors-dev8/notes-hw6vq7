/* =============================================================
   store.js — persistance locale (paris, réglages), export/import
   ============================================================= */
(function (global) {
  'use strict';

  var KEY_BETS = 'sp.bets.v1';
  var KEY_SET  = 'sp.settings.v1';
  var VERSION  = '1.0.0';

  var DEFAULT_SETTINGS = {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.5-flash',
    excludeFreebets: true,
    privacy: false,
    quotaDay: '',
    quotaCount: 0
  };

  var bets = [];
  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var listeners = [];

  function safeParse(raw, fallback) {
    try { var v = JSON.parse(raw); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }

  function load() {
    try {
      bets = safeParse(localStorage.getItem(KEY_BETS), []) || [];
      if (!Array.isArray(bets)) bets = [];
    } catch (e) { bets = []; }
    try {
      settings = Object.assign({}, DEFAULT_SETTINGS, safeParse(localStorage.getItem(KEY_SET), {}) || {});
    } catch (e) { settings = Object.assign({}, DEFAULT_SETTINGS); }
    Model.setPrivacy(settings.privacy);
  }

  function persist() {
    try { localStorage.setItem(KEY_BETS, JSON.stringify(bets)); }
    catch (e) {
      console.warn('Sauvegarde impossible', e);
      if (window.UI && UI.toast) {
        UI.toast("Le navigateur refuse d'enregistrer. Exporte tes paris avant de fermer.", 'err');
      }
      return false;
    }
    return true;
  }

  function persistSettings() {
    try { localStorage.setItem(KEY_SET, JSON.stringify(settings)); } catch (e) {}
  }

  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  function onChange(fn) { listeners.push(fn); }

  /* ---------- paris ---------- */

  function all() { return bets.slice(); }

  function get(id) {
    for (var i = 0; i < bets.length; i++) if (bets[i].id === id) return bets[i];
    return null;
  }

  function add(bet) {
    Model.recompute(bet);
    bets.unshift(bet);
    persist(); emit();
    return bet;
  }

  function addMany(list) {
    list.forEach(function (b) { Model.recompute(b); bets.unshift(b); });
    persist(); emit();
  }

  function update(bet) {
    Model.recompute(bet);
    for (var i = 0; i < bets.length; i++) {
      if (bets[i].id === bet.id) { bets[i] = bet; break; }
    }
    persist(); emit();
    return bet;
  }

  function remove(id) {
    bets = bets.filter(function (b) { return b.id !== id; });
    persist(); emit();
  }

  function wipe() {
    bets = [];
    persist(); emit();
  }

  /* ---------- réglages ---------- */

  function getSettings() { return Object.assign({}, settings); }

  function setSetting(key, value) {
    settings[key] = value;
    if (key === 'privacy') Model.setPrivacy(value);
    persistSettings();
    emit();
  }

  function bumpQuota() {
    var today = new Date().toISOString().slice(0, 10);
    if (settings.quotaDay !== today) { settings.quotaDay = today; settings.quotaCount = 0; }
    settings.quotaCount++;
    persistSettings();
  }

  function quotaToday() {
    var today = new Date().toISOString().slice(0, 10);
    return settings.quotaDay === today ? settings.quotaCount : 0;
  }

  /* ---------- export / import ---------- */

  function exportJson() {
    return JSON.stringify({
      app: 'suivi-paris', version: VERSION,
      exportedAt: new Date().toISOString(),
      bets: bets
    }, null, 2);
  }

  function importJson(text) {
    var data = safeParse(text, null);
    if (!data) throw new Error('Fichier illisible.');
    var incoming = Array.isArray(data) ? data : data.bets;
    if (!Array.isArray(incoming)) throw new Error("Ce fichier ne contient pas de paris.");

    var known = {};
    bets.forEach(function (b) { known[b.id] = true; });
    var added = 0;
    incoming.forEach(function (b) {
      if (!b || typeof b !== 'object') return;
      if (!b.id) b.id = Model.uid();
      if (known[b.id]) return;
      if (!Array.isArray(b.selections)) b.selections = [];
      known[b.id] = true;
      bets.push(b);
      added++;
    });
    bets.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    persist(); emit();
    return added;
  }

  function exportCsv() {
    var head = ['date', 'plateforme', 'type', 'selections', 'mise', 'cote', 'freebet',
                'statut', 'retour', 'benefice', 'detail'];
    var rows = [head.join(';')];
    bets.forEach(function (b) {
      var detail = (b.selections || []).map(function (s) {
        return [s.event, s.market, s.pick, s.odds].filter(Boolean).join(' ');
      }).join(' | ');
      rows.push([
        b.date || '',
        Model.platformLabel(b.platform),
        Model.typeLabel(b),
        (b.selections || []).length,
        fmtNum(Model.num(b.stake, 0)),
        fmtNum(Model.num(b.oddsTotal, 0)),
        b.freebet ? 'oui' : 'non',
        Model.STATUS_LABEL[b.status] || b.status,
        fmtNum(Model.payoutOf(b) || 0),
        fmtNum(Model.profit(b)),
        '"' + String(detail).replace(/"/g, '""') + '"'
      ].join(';'));
    });
    return '﻿' + rows.join('\r\n');
  }

  function fmtNum(v) { return String(v === null || v === undefined ? '' : v).replace('.', ','); }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  global.Store = {
    VERSION: VERSION,
    load: load, onChange: onChange,
    all: all, get: get, add: add, addMany: addMany, update: update, remove: remove, wipe: wipe,
    getSettings: getSettings, setSetting: setSetting,
    bumpQuota: bumpQuota, quotaToday: quotaToday,
    exportJson: exportJson, importJson: importJson, exportCsv: exportCsv, download: download
  };
})(window);
