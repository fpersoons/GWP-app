# Intégration au portail chemlink.app

L'application est hébergée sur le site Netlify `gwp-app` (https://gwp-app.netlify.app), déployé automatiquement depuis GitHub. Comme pour les autres applications, le portail chemlink.app la proxifie sous `/GWP-app/` avec une réécriture 200.

## À ajouter dans le dépôt du portail (site Netlify `chemlink`)

### `netlify.toml` — avant tout catch-all éventuel

```toml
# Sans barre oblique finale, les chemins relatifs de l'application ne se résolvent pas
[[redirects]]
  from = "/GWP-app"
  to = "/GWP-app/"
  status = 301

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
