/* =============================================================
   ai.js — lecture d'une capture d'écran par un modèle de vision
   Fournisseurs : Google Gemini (palier gratuit) ou OpenRouter.
   La clé reste dans le navigateur, l'image est envoyée directement
   depuis l'appareil au fournisseur.
   ============================================================= */
(function (global) {
  'use strict';

  var MAX_SIDE = 1400;
  var JPEG_Q = 0.82;

  var PROMPT = [
    "Tu lis la capture d'écran d'une application de paris sportifs ou hippiques française",
    "(Betclic, Winamax, PMU ou autre). Extrais TOUS les paris visibles sur l'image.",
    "",
    "Règles :",
    "- Une image peut contenir plusieurs paris : renvoie-les tous, dans l'ordre d'apparition.",
    "- Ne devine jamais un chiffre : si une valeur est illisible, mets null et passe incertain à true.",
    "- Les nombres sont des décimaux au format anglais (10.5), jamais de texte, jamais de symbole monétaire.",
    "- La cote d'un combiné est le produit des cotes de ses sélections : vérifie avant de répondre.",
    "- type : 'simple' pour une seule sélection, 'combine' si toutes les sélections doivent passer,",
    "  'systeme' si la capture parle de système, de combinaisons ou affiche un format du style 2/4.",
    "- freebet : true si le pari est marqué pari gratuit, freebet, mise offerte ou équivalent.",
    "- statut : 'en_cours' si le pari n'est pas encore réglé, sinon 'gagne', 'perdu', 'rembourse' ou 'cashout'.",
    "- date au format AAAA-MM-JJ si elle est lisible, sinon null.",
    "- numero : la référence du pari. Betclic, Winamax et PMU l'affichent toujours,",
    "  en petits caractères, souvent en haut ou en bas du ticket, parfois près de la date",
    "  (« N° de pari », « Référence », « Ticket », « ID », « Code »). Cherche-la attentivement",
    "  et recopie-la caractère par caractère, tirets compris, sans rien ajouter.",
    "  Mets null seulement si elle est vraiment absente ou illisible : ne l'invente jamais.",
    "- N'invente aucune sélection qui ne figure pas sur l'image.",
    "",
    "Réponds UNIQUEMENT par un objet JSON de cette forme :",
    '{"paris":[{"numero":"A1B2C3 ou null","plateforme":"betclic|winamax|pmu|autre","type":"simple|combine|systeme",',
    '"systeme":"2/4 ou null","mise":10.0,"cote_totale":4.85,"gain_potentiel":48.5,',
    '"freebet":false,"date":"2026-09-21","statut":"en_cours","gain_reel":null,',
    '"selections":[{"sport":"Football","competition":"Ligue 1","evenement":"Lens - Lyon",',
    '"marche":"Double chance","choix":"1N","cote":1.85,"statut":"en_cours","incertain":false}]}]}'
  ].join('\n');

  var SCHEMA = {
    type: 'object',
    properties: {
      paris: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            numero: { type: 'string', nullable: true },
            plateforme: { type: 'string' },
            type: { type: 'string' },
            systeme: { type: 'string', nullable: true },
            mise: { type: 'number', nullable: true },
            cote_totale: { type: 'number', nullable: true },
            gain_potentiel: { type: 'number', nullable: true },
            freebet: { type: 'boolean' },
            date: { type: 'string', nullable: true },
            statut: { type: 'string' },
            gain_reel: { type: 'number', nullable: true },
            selections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sport: { type: 'string' },
                  competition: { type: 'string' },
                  evenement: { type: 'string' },
                  marche: { type: 'string' },
                  choix: { type: 'string' },
                  cote: { type: 'number', nullable: true },
                  statut: { type: 'string' },
                  incertain: { type: 'boolean' }
                },
                required: ['evenement', 'cote']
              }
            }
          },
          required: ['type', 'mise', 'selections']
        }
      }
    },
    required: ['paris']
  };

  /* ---------- préparation de l'image ---------- */

  function compress(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        var dataUrl = cv.toDataURL('image/jpeg', JPEG_Q);
        resolve({
          dataUrl: dataUrl,
          base64: dataUrl.split(',')[1],
          mime: 'image/jpeg',
          width: cw, height: ch
        });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Image illisible. Essaie une capture au format PNG ou JPG."));
      };
      img.src = url;
    });
  }

  /* ---------- appels réseau ---------- */

  function geminiUrl(model, key) {
    return 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  }

  function callGemini(img, cfg, useSchema) {
    var body = {
      contents: [{
        role: 'user',
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: img.mime, data: img.base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json'
      }
    };
    if (useSchema) body.generationConfig.responseSchema = SCHEMA;

    return fetch(geminiUrl(cfg.model, cfg.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (t) { return { ok: r.ok, status: r.status, text: t }; });
    }).then(function (res) {
      if (!res.ok) {
        if (res.status === 400 && useSchema) return callGemini(img, cfg, false);
        throw httpError(res);
      }
      var data = JSON.parse(res.text);
      var cand = data.candidates && data.candidates[0];
      if (!cand) throw new Error("Le modèle n'a rien renvoyé. Réessaie avec une capture plus nette.");
      var parts = (cand.content && cand.content.parts) || [];
      var txt = parts.map(function (p) { return p.text || ''; }).join('');
      if (!txt) throw new Error("Réponse vide du modèle.");
      return txt;
    });
  }

  function callOpenRouter(img, cfg) {
    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body: JSON.stringify({
        model: cfg.model || 'google/gemini-2.0-flash-exp:free',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: img.dataUrl } }
          ]
        }]
      })
    }).then(function (r) {
      return r.text().then(function (t) { return { ok: r.ok, status: r.status, text: t }; });
    }).then(function (res) {
      if (!res.ok) throw httpError(res);
      var data = JSON.parse(res.text);
      var msg = data.choices && data.choices[0] && data.choices[0].message;
      var txt = msg && (typeof msg.content === 'string' ? msg.content
        : (msg.content || []).map(function (c) { return c.text || ''; }).join(''));
      if (!txt) throw new Error("Réponse vide du modèle.");
      return txt;
    });
  }

  function httpError(res) {
    var e = buildError(res);
    e.code = res.status;
    return e;
  }

  function buildError(res) {
    var msg = '';
    try {
      var j = JSON.parse(res.text);
      msg = (j.error && (j.error.message || j.error.type)) || '';
    } catch (e) { msg = (res.text || '').slice(0, 160); }

    if (res.status === 400 && /api key/i.test(msg)) {
      return new Error("Clé API refusée. Vérifie-la dans les réglages.");
    }
    if (res.status === 401 || res.status === 403) {
      return new Error("Clé API refusée ou sans accès à ce modèle.");
    }
    if (res.status === 429) {
      return new Error("Limite du palier gratuit atteinte : trop de requêtes en une minute. Patiente un instant.");
    }
    if (res.status === 404) {
      return new Error("Modèle introuvable. Change le nom du modèle dans les réglages.");
    }
    if (res.status === 400 && /interaction/i.test(msg)) {
      return new Error("Ce modèle exige la nouvelle API de Google, que l'application n'utilise pas. Choisis-en un autre dans les réglages.");
    }
    return new Error('Erreur ' + res.status + (msg ? ' · ' + msg : ''));
  }

  /* ---------- lecture du JSON renvoyé ---------- */

  function parseJson(txt) {
    var t = String(txt).trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(t); } catch (e) {}
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)); } catch (e2) {}
    }
    throw new Error("Réponse du modèle incompréhensible. Réessaie ou saisis le pari à la main.");
  }

  /* ---------- conversion en paris de l'application ---------- */

  var PLATFORM_MAP = {
    betclic: 'betclic', winamax: 'winamax', pmu: 'pmu',
    unibet: 'autre', parionssport: 'autre', bwin: 'autre', zebet: 'autre',
    netbet: 'autre', vbet: 'autre', betsson: 'autre'
  };

  var STATUS_MAP = {
    en_cours: 'pending', encours: 'pending', pending: 'pending', 'en cours': 'pending',
    gagne: 'won', gagné: 'won', won: 'won', win: 'won',
    perdu: 'lost', lost: 'lost', perdue: 'lost',
    rembourse: 'void', remboursé: 'void', void: 'void', annule: 'void', annulé: 'void',
    cashout: 'cashout', 'cash-out': 'cashout'
  };

  function norm(s) {
    return String(s || '').toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function mapPlatform(v) {
    var n = norm(v).replace(/[^a-z]/g, '');
    for (var k in PLATFORM_MAP) if (n.indexOf(k) >= 0) return PLATFORM_MAP[k];
    return 'autre';
  }

  function mapStatus(v, fallback) {
    var n = norm(v).replace(/\s+/g, '_');
    return STATUS_MAP[n] || STATUS_MAP[norm(v)] || fallback || 'pending';
  }

  function toBets(json, sourceName) {
    var raw = (json && (json.paris || json.bets || json.tickets)) || [];
    if (!Array.isArray(raw)) raw = [raw];
    var out = [];

    raw.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var bet = Model.emptyBet();
      bet.source = 'ocr';
      bet.sourceName = sourceName || '';
      bet.platform = mapPlatform(p.plateforme || p.platform);
      bet.ref = String(p.numero || p.reference || p.ref || '').trim();
      if (/^(null|none|n\/a|aucun)$/i.test(bet.ref)) bet.ref = '';
      bet.freebet = !!(p.freebet || p.pari_gratuit);
      bet.stake = Model.num(p.mise !== undefined ? p.mise : p.stake, null);
      bet.oddsTotal = Model.num(p.cote_totale !== undefined ? p.cote_totale : p.odds, null);
      bet.oddsAuto = bet.oddsTotal === null;   /* cote lue sur le ticket : elle fait foi */
      bet.potentialWin = Model.num(p.gain_potentiel !== undefined ? p.gain_potentiel : p.potential_win, null);
      bet.note = '';

      var d = String(p.date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) bet.date = d;

      var sels = p.selections || p.paris || [];
      if (!Array.isArray(sels)) sels = [];
      bet.selections = sels.map(function (s) {
        var sel = Model.emptySelection();
        sel.sport = String(s.sport || '').trim();
        sel.competition = String(s.competition || '').trim();
        sel.event = String(s.evenement || s.event || s.match || '').trim();
        sel.market = String(s.marche || s.market || '').trim();
        sel.pick = String(s.choix || s.pick || s.selection || '').trim();
        sel.odds = Model.num(s.cote !== undefined ? s.cote : s.odds, null);
        sel.status = mapStatus(s.statut || s.status, 'pending');
        sel.flagged = !!(s.incertain || s.uncertain) || sel.odds === null;
        return sel;
      });
      if (!bet.selections.length) bet.selections = [Model.emptySelection()];

      var t = norm(p.type);
      if (t.indexOf('syst') >= 0) bet.type = 'systeme';
      else if (t.indexOf('comb') >= 0 || t.indexOf('multi') >= 0 || t.indexOf('accum') >= 0) bet.type = 'combine';
      else if (t.indexOf('simple') >= 0 || t.indexOf('single') >= 0) bet.type = 'simple';
      else bet.type = bet.selections.length > 1 ? 'combine' : 'simple';

      if (bet.type === 'combine' && bet.selections.length === 1) bet.type = 'simple';

      if (bet.type === 'systeme') {
        var m = String(p.systeme || p.system || '').match(/(\d+)\s*[\/ ]\s*(\d+)/);
        bet.systemK = m ? parseInt(m[1], 10) : Math.min(2, bet.selections.length);
        if (!bet.systemK || bet.systemK < 1) bet.systemK = 2;
      }

      /* cote totale manquante sur un combiné : produit des sélections */
      if (!bet.oddsTotal && bet.type !== 'systeme') {
        var prod = 1, ok = true;
        bet.selections.forEach(function (s) {
          var o = Model.num(s.odds, 0);
          if (!o) ok = false; else prod *= o;
        });
        if (ok) { bet.oddsTotal = Model.round2(prod); bet.oddsAuto = true; }
      }
      if (!bet.potentialWin && bet.stake && bet.oddsTotal) {
        bet.potentialWin = Model.round2(bet.freebet ? bet.stake * (bet.oddsTotal - 1) : bet.stake * bet.oddsTotal);
      }

      var st = mapStatus(p.statut || p.status, 'pending');
      if (st !== 'pending') {
        bet.selections.forEach(function (s) {
          if (s.status === 'pending') s.status = (st === 'cashout' ? 'pending' : st);
        });
        if (st === 'cashout') {
          bet.manual = true;
          bet.status = 'cashout';
          bet.payout = Model.num(p.gain_reel, null);
        } else if (p.gain_reel !== undefined && p.gain_reel !== null) {
          bet.manual = true;
          bet.status = st;
          bet.payout = Model.num(p.gain_reel, null);
        }
      }

      Model.recompute(bet);
      bet.issues = Model.checkConsistency(bet);
      out.push(bet);
    });

    return out;
  }

  /* ---------- découverte des modèles disponibles sur la clé ---------- */

  /* Le catalogue Google change souvent : plutôt que de figer un nom de modèle,
     on demande à la clé ce qu'elle peut utiliser et on choisit le meilleur. */

  var EXCLUDE = /embedding|imagen|veo|:?image|tts|audio|aqa|learnlm|gemma/i;

  function listModels() {
    var cfg = Store.getSettings();
    if (!cfg.apiKey) return Promise.reject(new Error('Ajoute une clé avant de détecter les modèles.'));

    if (cfg.provider === 'openrouter') {
      return fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': 'Bearer ' + cfg.apiKey }
      }).then(readJson).then(function (data) {
        return (data.data || [])
          .filter(function (m) {
            var mods = (m.architecture && m.architecture.input_modalities) || [];
            return mods.indexOf('image') >= 0;
          })
          .map(function (m) { return m.id; });
      });
    }

    return fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' +
                 encodeURIComponent(cfg.apiKey) + '&pageSize=200')
      .then(readJson).then(function (data) {
        return (data.models || [])
          .filter(function (m) {
            var methods = m.supportedGenerationMethods || m.supported_generation_methods || [];
            return methods.indexOf('generateContent') >= 0;
          })
          .map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
          .filter(function (id) { return id && !EXCLUDE.test(id); });
      });
  }

  function readJson(r) {
    return r.text().then(function (t) {
      if (!r.ok) throw httpError({ status: r.status, text: t });
      try { return JSON.parse(t); } catch (e) { throw new Error('Réponse inattendue du fournisseur.'); }
    });
  }

  /* Un modèle « flash » récent est le bon compromis pour lire une capture :
     rapide, multimodal, et présent sur le palier gratuit. */
  function scoreModel(id) {
    var n = id.toLowerCase();
    var v = 0;
    var m = n.match(/(\d+(?:\.\d+)?)/);
    if (m) v = parseFloat(m[1]) || 0;
    var score = v * 10;
    if (/flash/.test(n)) score += 30;
    else if (/pro/.test(n)) score += 8;      /* souvent payant */
    if (/lite/.test(n)) score -= 8;
    if (/preview|exp|thinking/.test(n)) score -= 5;
    if (/latest/.test(n)) score += 1;
    return score;
  }

  function bestModel(ids) {
    if (!ids || !ids.length) return null;
    return ids.slice().sort(function (a, b) { return scoreModel(b) - scoreModel(a); })[0];
  }

  /* Choisit et enregistre un modèle qui fonctionne réellement. */
  function autoPickModel(onStep) {
    return pickWorkingModel(onStep);
  }

  /* Deux cas se ressemblent du point de vue de l'application : le modèle n'existe
     plus, ou il n'accepte plus la route que nous utilisons. Dans les deux cas,
     il faut en essayer un autre. */
  function isUnusableModel(e) {
    var m = (e && e.message) || '';
    return /introuvable|not found|404/i.test(m) || /exige la nouvelle API|interaction/i.test(m);
  }

  /* Essaie les meilleurs candidats l'un après l'autre et garde le premier qui
     répond vraiment. Un nom bien classé ne garantit pas qu'il fonctionne. */
  /* Chaque essai coûte une requête, et le palier gratuit en autorise une
     quinzaine par minute : on retient les modèles déjà écartés et on n'en
     teste que quelques-uns. */
  function pickWorkingModel(onStep) {
    return listModels().then(function (ids) {
      var base = Store.getSettings();
      var bad = base.badModels || [];
      var ranked = ids.slice()
        .sort(function (a, b) { return scoreModel(b) - scoreModel(a); })
        .filter(function (id) { return bad.indexOf(id) < 0; })
        .slice(0, 4);

      if (!ranked.length) {
        throw new Error("Aucun modèle compatible n'est accessible avec cette clé. Choisis-en un à la main dans les réglages.");
      }
      var i = 0, lastErr = null;

      function attempt() {
        if (i >= ranked.length) {
          throw lastErr || new Error("Aucun des modèles essayés ne répond. Choisis-en un à la main dans les réglages.");
        }
        var id = ranked[i++];
        if (onStep) onStep('Essai de ' + id + '…');
        var cfg = {};
        for (var k in base) cfg[k] = base[k];
        cfg.model = id;
        return pingModel(cfg).then(function () {
          Store.setSetting('model', id);
          Store.setSetting('modelOk', true);
          return { model: id, models: ids };
        }).catch(function (e) {
          if (e && e.code === 429) throw e;      /* la limite n'est pas la faute du modèle */
          if (!isUnusableModel(e)) throw e;
          rememberBadModel(id);
          lastErr = e;
          return attempt();
        });
      }
      return attempt();
    });
  }

  function rememberBadModel(id) {
    var bad = (Store.getSettings().badModels || []).slice();
    if (bad.indexOf(id) < 0) bad.push(id);
    Store.setSetting('badModels', bad.slice(-20));
  }

  /* Attente visible plutôt qu'un échec sec : la limite se libère vite. */
  function waitFor(sec, onStep) {
    return new Promise(function (resolve) {
      var left = sec;
      function tick() {
        if (onStep) onStep('Limite atteinte · nouvelle tentative dans ' + left + ' s…');
        if (left <= 0) return resolve();
        left--;
        setTimeout(tick, 1000);
      }
      tick();
    });
  }

  /* ---------- API publique ---------- */

  function readScreenshot(file, onStep) {
    var cfg = Store.getSettings();
    if (!cfg.apiKey) {
      return Promise.reject(new Error("Aucune clé API. Ouvre les réglages pour en ajouter une (c'est gratuit et ça prend deux minutes)."));
    }
    onStep = onStep || function () {};
    onStep("Préparation de l'image…");

    return compress(file).then(function (img) {
      onStep('Lecture par le modèle…');

      function run(c) {
        return c.provider === 'openrouter' ? callOpenRouter(img, c) : callGemini(img, c, true);
      }

      var p = run(cfg).catch(function (e) {
        if (!isUnusableModel(e) || cfg.provider === 'openrouter') throw e;
        onStep("Modèle indisponible, recherche d'un remplaçant…");
        return autoPickModel(onStep).then(function () { return run(Store.getSettings()); });
      }).catch(function (e) {
        if (!e || e.code !== 429) throw e;
        return waitFor(30, onStep).then(function () {
          onStep('Nouvelle tentative…');
          return run(Store.getSettings());
        });
      });

      return p.then(function (txt) {
        onStep('Mise en forme…');
        Store.bumpQuota();
        if (!cfg.modelOk) Store.setSetting('modelOk', true);
        var bets = toBets(parseJson(txt), file.name);
        if (!bets.length) throw new Error("Aucun pari reconnu sur cette capture. Essaie une image où le ticket est entier.");
        return { bets: bets, preview: img.dataUrl };
      });
    });
  }

  function pingModel(cfg) {
    if (cfg.provider === 'openrouter') {
      return fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': 'Bearer ' + cfg.apiKey }
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw httpError({ status: r.status, text: t }); });
        return true;
      });
    }
    return fetch(geminiUrl(cfg.model, cfg.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }] })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw httpError({ status: r.status, text: t }); });
      return true;
    });
  }

  /* Teste la clé. Si le modèle enregistré n'existe plus, en choisit un autre
     tout seul et réessaie : c'est le cas le plus fréquent, le catalogue bouge. */
  function testKey() {
    var cfg = Store.getSettings();
    if (!cfg.apiKey) return Promise.reject(new Error('Ajoute une clé avant de tester.'));
    if (!cfg.model) {
      return autoPickModel().then(function (r) {
        return pingModel(Store.getSettings()).then(function () { return { switched: true, model: r.model }; });
      });
    }
    return pingModel(cfg).then(function () {
      Store.setSetting('modelOk', true);
      return { switched: false, model: cfg.model };
    }).catch(function (e) {
      if (!isUnusableModel(e)) throw e;
      return autoPickModel().then(function (r) {
        return pingModel(Store.getSettings()).then(function () { return { switched: true, model: r.model }; });
      });
    });
  }

  global.AI = {
    readScreenshot: readScreenshot,
    testKey: testKey,
    listModels: listModels,
    autoPickModel: autoPickModel,
    pickWorkingModel: pickWorkingModel, rememberBadModel: rememberBadModel,
    bestModel: bestModel,
    compress: compress,
    toBets: toBets,
    parseJson: parseJson,
    PROMPT: PROMPT
  };
})(window);
