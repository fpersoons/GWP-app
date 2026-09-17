# Intégration au portail chemlink.app

L'application est hébergée sur le site Netlify `gwp-app` (https://gwp-app.netlify.app), déployé automatiquement depuis GitHub. Comme pour les autres applications, le portail chemlink.app la proxifie sous `/GWP-app/` avec une réécriture 200.

## Fait le 17/09/2026

Le portail est désormais versionné sur GitHub (`fpersoons/chemlink-portail`, privé, dossier local `~/Documents/ClaudeApp/chemlink-portail`) et le site Netlify `chemlink` se déploie depuis ce dépôt. Les éléments ci-dessous y sont en place.

## Configuration dans le dépôt du portail

### `netlify.toml` — avant tout catch-all éventuel

```toml
# Note : pas de règle 301 "/GWP-app" -> "/GWP-app/" (Netlify traite les deux formes comme
# équivalentes, ce qui créerait une boucle) ; c'est l'application qui normalise l'URL
# sans barre finale (script dans app/index.html).
[[redirects]]
  from = "/GWP-app/*"
  to = "https://gwp-app.netlify.app/:splat"
  status = 200
```

### `index.html` — dans `<nav class="app-list">`

```html
<a class="app-link" href="/GWP-app/">
  <span class="app-number">03</span>
  <span class="app-content">
    <strong>GWP – Bonnes Pratiques d’Entreposage</strong>
    <small>Évaluation de la conformité des entrepôts de santé (OMS TRS 1025)</small>
  </span>
  <span class="arrow" aria-hidden="true">↗</span>
</a>
```

## Vérification

```bash
curl -sI https://www.chemlink.app/GWP-app/ | head -1        # HTTP/2 200
curl -sI https://www.chemlink.app/GWP-app/sw.js | grep -i cache   # no-cache
```

Le service worker et le manifeste PWA utilisent des chemins relatifs : la portée de l'application installée est `/GWP-app/`.
