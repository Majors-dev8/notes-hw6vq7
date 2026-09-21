# Suivi Paris

Application web de suivi de paris sportifs et hippiques (Betclic, Winamax, PMU).
On dépose une capture d'écran du ticket, un modèle de vision la lit, on vérifie
en deux secondes et c'est enregistré.

- Tout fonctionne dans le navigateur, aucun serveur à gérer.
- Les paris restent sur l'appareil (stockage du navigateur), avec export/import.
- Installable sur l'écran d'accueil du téléphone, utilisable hors ligne.
- Gère les simples, les combinés, les systèmes, les freebets et les cash-out.

---

## 1. Mettre le site en ligne sur GitHub Pages (5 minutes, gratuit)

### Ce qui est public, ce qui ne l'est pas

Le dépôt doit rester **public** : c'est la seule façon d'avoir GitHub Pages
gratuitement, et un dépôt privé ne rendrait de toute façon pas le site privé,
les deux réglages étant indépendants chez GitHub.

Ce n'est pas un problème, parce que rien de personnel ne s'y trouve :

- **Les paris** vivent dans le stockage du navigateur du téléphone. Ils ne
  partent sur aucun serveur, donc ils ne sont pas dans le dépôt.
- **La clé API** est saisie dans l'écran Réglages et reste sur l'appareil.
- Quelqu'un qui tomberait sur l'adresse verrait une application **vide**.

⚠️ La seule règle à ne jamais enfreindre : **ne jamais écrire la clé API dans
un fichier** avant de l'envoyer sur GitHub. Elle se colle uniquement dans les
Réglages de l'application.

Deux précautions simples suffisent : un nom de dépôt que personne ne devine, et
ne pas diffuser l'adresse. Sans lien vers le site, il n'apparaît dans aucun
moteur de recherche.

### Les étapes

1. Créer un compte sur [github.com](https://github.com) si besoin.
2. Cliquer sur **New repository**. Prendre un nom neutre et non devinable
   plutôt que `suivi-paris` — par exemple `notes-hw6vq7`. Le laisser
   **Public**. Créer.
3. Sur la page du dépôt vide, cliquer sur **uploading an existing file**.
4. Ouvrir le dossier, tout sélectionner (**Ctrl + A**) et glisser les fichiers
   dans la zone de dépôt. Tous les fichiers vont à la racine, il n'y a aucun
   sous-dossier à préserver : c'est voulu, ça évite les mauvaises surprises
   avec le glisser-déposer de GitHub.
5. Cliquer sur **Commit changes**.
6. Aller dans **Settings → Pages**. Sous *Source*, choisir **Deploy from a branch**,
   branche `main`, dossier `/ (root)`. Enregistrer.
7. Au bout d'une minute, l'adresse s'affiche en haut de la page :
   `https://<ton-pseudo>.github.io/notes-hw6vq7/`

Garder cette adresse pour soi et l'ajouter directement à l'écran d'accueil du
téléphone (étape 3) : elle n'a plus besoin d'être tapée ensuite.

Pour mettre à jour plus tard : réuploader les fichiers modifiés au même endroit.

### Si un jour tu veux un vrai mur de connexion

Héberger plutôt sur **Cloudflare Pages** et activer **Cloudflare Access**
(gratuit jusqu'à 50 utilisateurs) : le site ne s'ouvre qu'après connexion avec
les adresses e-mail autorisées. Contrepartie : une connexion à repasser
périodiquement sur le téléphone, y compris dans l'application installée.

## 2. Créer la clé Gemini (gratuit, sans carte bancaire)

1. Ouvrir [aistudio.google.com/apikey](https://aistudio.google.com/apikey) et se
   connecter avec un compte Google.
2. **Create API key**, puis copier la clé.
3. Dans l'application : onglet **Réglages**, coller la clé, appuyer sur **Tester**.

Ne jamais activer la facturation sur ce projet Google : tant que le projet reste
sur le palier gratuit, il ne peut rien être facturé. Le palier gratuit des modèles
Flash se compte en centaines de requêtes par jour, très au-delà d'un usage normal.

À savoir : sur le palier gratuit, Google peut utiliser les contenus envoyés pour
améliorer ses modèles.

## 3. Installer sur le téléphone

- **Android (Chrome)** : ouvrir l'adresse, menu ⋮ → *Ajouter à l'écran d'accueil*.
  Ensuite, l'application apparaît dans le menu *Partager* d'une capture d'écran :
  on peut donc envoyer un ticket directement depuis la galerie.
- **iPhone (Safari)** : ouvrir l'adresse, bouton Partager → *Sur l'écran d'accueil*.

---

## Utilisation

| Action | Où |
|---|---|
| Ajouter un pari | bouton **+**, puis capture d'écran ou saisie manuelle |
| Corriger ce que l'IA a lu | écran **Vérifier** — les valeurs douteuses sont en orange |
| Régler un pari | ouvrir le pari, appuyer sur une sélection pour la passer gagnée/perdue/remboursée |
| Régler d'un coup | boutons **Gagné / Perdu / Remboursé** en bas de la fiche |
| Cash-out | ouvrir un pari déjà réglé → **Cash-out…** |
| Sauvegarder | Réglages → **Exporter** (fichier JSON à conserver) |
| Changer de téléphone | exporter ici, **Importer** là-bas |

### Ce qui est calculé automatiquement

- Le gain d'un **système** k/n : chaque combinaison est évaluée séparément, le gain
  acquis se met à jour dès qu'une sélection est réglée.
- Une sélection **remboursée** ramène sa cote à 1 dans le combiné.
- Un **freebet** : la mise n'est pas comptée comme perdue, et le gain exclut la mise.
  Le réglage *Exclure les freebets du ROI* garde le ROI honnête.

### Statistiques

ROI, taux de réussite, cote moyenne jouée et gagnante, bénéfice par plateforme,
par type de pari, par sport et par tranche de cote, séries en cours, calendrier
des 35 derniers jours, et le compteur des **combinés perdus à une sélection près**
avec le marché qui revient le plus souvent.

---

## Structure

Tous les fichiers sont à la racine, sans sous-dossier.

```
index.html              écrans de l'application
app.css                 thème sombre, tokens de couleur et composants
model.js                modèle d'un pari, calculs de gains, formatage
store.js                stockage local, export/import JSON et CSV
stats.js                agrégations statistiques
ai.js                   lecture des captures (Gemini ou OpenRouter)
ui.js                   composants d'interface (courbe, listes, modales)
app.js                  navigation et écrans
sw.js                   cache hors ligne et réception des captures partagées
manifest.webmanifest    installation sur l'écran d'accueil
icon-*.png, icon.svg    icônes de l'application
```

## Changer de fournisseur d'IA

Dans les réglages, l'option **OpenRouter** accepte n'importe quel modèle de vision
(par exemple `google/gemini-2.0-flash-exp:free`). La clé se crée sur
[openrouter.ai](https://openrouter.ai). Le reste de l'application ne change pas.

## Confidentialité

La clé API et les paris ne quittent pas le navigateur. Seules les captures
d'écran envoyées à la lecture partent chez le fournisseur choisi. Aucun compte,
aucun serveur intermédiaire, aucun traceur.

Jouer comporte des risques : endettement, isolement, dépendance.
En cas de besoin, Joueurs Info Service : 09 74 75 13 13 (appel non surtaxé).
