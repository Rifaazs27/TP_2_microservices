# 🛒 DevShop — TP M2 DevOps

## Ce qui est fourni

| Élément | Statut |
|---|---|
| Front web (`front/index.html`) | ✅ Fourni, **ne pas modifier** |
| 4 services Node.js (catalogue, panier, commandes, notifications) | ✅ Fourni |
| `docker-compose.yml` partiel | ✅ Fourni — à compléter |

---

## Lancer le projet (point de départ)

```bash
# Installer les dépendances de chaque service
cd services/catalogue && npm install && cd ../..
cd services/panier    && npm install && cd ../..
cd services/commandes && npm install && cd ../..
cd services/notifications && npm install && cd ../..

# Lancer en local (sans Docker)
node services/catalogue/index.js &
node services/panier/index.js &
node services/commandes/index.js &
node services/notifications/index.js &

# Ouvrir le front
open front/index.html   # ou npx serve front/
```

Les 4 indicateurs de santé en haut du site doivent passer au vert ✓

---

## Votre mission (rendu à 17h)

### Étape 1 — Dockerisation
- Transformer chaque `Dockerfile` en **multi-stage build** (étape build + étape runtime légère)
- Compléter le `docker-compose.yml` : `healthcheck`, `depends_on`, `restart: unless-stopped`
- `docker compose up --build` → tout doit démarrer et le front doit fonctionner

### Étape 2 — Instrumentation
Ajouter `prom-client` dans chaque service et exposer `GET /metrics` :

```bash
npm install prom-client
```

Métriques minimales attendues par service :
- **Counter** : nombre de requêtes par endpoint
- **Histogram** : durée de traitement des requêtes
- **Gauge** (commandes uniquement) : nombre total de commandes en mémoire

### Étape 3 — Prometheus
- Créer `monitoring/prometheus.yml` avec un job de scrape pour chaque service
- Décommenter le bloc `prometheus` dans `docker-compose.yml`
- Vérifier dans l'UI Prometheus (`localhost:9090`) que les targets sont `UP`

### Étape 4 — Grafana
- Décommenter le bloc `grafana` dans `docker-compose.yml`
- Créer un dashboard avec au minimum :
  - Taux de requêtes par service (RPS)
  - Latence p99 par service
  - Nombre de commandes passées

### Étape 5 — Alertmanager
- Créer `monitoring/alertmanager.yml`
- Définir une règle d'alerte si le service `catalogue` ne répond plus depuis 1 minute
- Décommenter le bloc `alertmanager` dans `docker-compose.yml`

---

## Livrable Git

```
tp-ecommerce/
├── front/              ← fourni (non modifié)
├── services/
│   ├── catalogue/      ← Dockerfile multi-stage + /metrics
│   ├── panier/         ← Dockerfile multi-stage + /metrics
│   ├── commandes/      ← Dockerfile multi-stage + /metrics
│   └── notifications/  ← Dockerfile multi-stage + /metrics
├── monitoring/
│   ├── prometheus.yml
│   ├── alertmanager.yml
│   └── alert_rules.yml
├── docker-compose.yml  ← complété
├── slo.md              ← votre SLO défini + calcul error budget
└── README.md
```

**Critères d'évaluation :**
- `docker compose up --build` fonctionne sans erreur
- `/metrics` accessible sur les 4 services
- Targets Prometheus toutes `UP`
- Dashboard Grafana fonctionnel avec les 3 panels minimum
- Au moins 1 règle d'alerte configurée
- `slo.md` rédigé

Bon courage ! 🚀
