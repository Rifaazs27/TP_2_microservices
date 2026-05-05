# 🛒 E-Commerce Microservices Platform — TP2

## 1. Membres de l'équipe

* Zaafir MOUGAMMADOU ZACCARIA

---

## 2. Architecture

L'architecture est composée d'un point d'entrée unique (**API Gateway**) qui distribue les requêtes vers quatre services spécialisés.
La communication entre services est synchrone via HTTP.

<img width="1005" height="701" alt="image" src="https://github.com/user-attachments/assets/6edd6048-5003-47f1-8fb8-ab79cac29dd2" />


---

## 3. Choix techniques

### 🔹 Validation Manuelle Stricte

* J'ai écrit mes propres fonctions pour les logs et la sécurité (rate limit) au lieu d'installer des outils lourds. Pourquoi ? C'est plus léger, on contrôle tout le code et on respecte les contraintes du TP.
  
### 🔹 Stockage In-Memory

Toutes les données (produits, paniers) sont stockées dans des variables simples. Pourquoi ? C'est ultra rapide à mettre en place et suffisant pour tester la communication entre les services sans gérer de base de données complexe.

### 🔹 Communication avec Retry & Backoff

Si le service de notification est temporairement indisponible, le service commande réessaie automatiquement 3 fois. Pourquoi ? Pour éviter qu'une commande échoue juste à cause d'un petit bug réseau passager.

---

## 4. Lancer la stack

### ▶️ Build & démarrage

```bash
docker-compose up --build
```

### 🧹 Nettoyage

```bash
docker-compose down -v
```

---

## 5. Tester chaque endpoint

### 📦 Catalogue — Liste des produits

```bash
curl http://localhost:3000/products
```

**Réponse :**

```json
200 OK
[
  { "id": 1, "name": "Laptop Pro 15" }
]
```

---

### 🛒 Panier — Ajouter un item

```bash
curl -X POST http://localhost:3000/cart/user1/items \
-H "Content-Type: application/json" \
-d '{"productId":1, "quantity":2, "unitPrice":1299.99}'
```

---

### 📑 Commandes — Créer une commande

```bash
curl -X POST http://localhost:3000/orders \
-H "Content-Type: application/json" \
-d '{"userId":"user1","items":[{"productId":1,"quantity":1,"unitPrice":1299.99}],"shippingAddress":"Paris"}'
```

---

### ❤️ Santé — Health Check

```bash
curl http://localhost:3000/health
```

---

## 6. Difficultés rencontrées

1. Propagation du Signal SIGTERM : Lors de l'arrêt des conteneurs, les processus Node.js ne s'arrêtaient pas proprement tout de suite. Solution : Ajout d'un gestionnaire process.on('SIGTERM') pour fermer les connexions proprement (Graceful Shutdown) et utilisation d'images Alpine pour une meilleure gestion des signaux.

2. Formatage strict des Logs : Au début, les logs s'affichaient sur une seule ligne ou en texte brut, ce qui rendait l'analyse difficile. Solution : Création d'un logger maison convertissant chaque message en objet JSON.stringify() pour qu'ils soient exploitables par des outils de monitoring.

3. Calculs de précision (Float) : Les prix du panier (ex: 29.99 * 3) donnaient des résultats avec trop de décimales (ex: 89.9699999). Solution : Utilisation systématique de parseFloat(total.toFixed(2)) pour arrondir proprement les montants financiers.

4. Gestion des Timeouts dans le Health Check : Quand un service était arrêté (docker stop), le Gateway restait "bloqué" à attendre la réponse trop longtemps. Solution : Mise en place d'un AbortController (ou un timeout manuel) pour forcer l'échec de la requête après 2 secondes.

5. Validation des payloads JSON : Recevoir des objets vides ou des types incorrects (chaîne au lieu de nombre) faisait planter les calculs de stock. Solution : Écriture d'un middleware de validation robuste qui vérifie chaque champ (typeof, isNaN, isEmpty) avant d'autoriser l'accès à la logique métier.

---

## 7. Améliorations futures

### 🔸 Persistance de données

* Volumes Docker + JSON ou SQLite

### 🔸 Authentification

* Middleware JWT au niveau Gateway

### 🔸 Observabilité

* Dashboard **Grafana** avec métriques

---

## ✅ Conclusion

Ce projet met en place une architecture microservices simple mais robuste avec :

* séparation claire des responsabilités
* résilience basique (retry, timeout)
* bonnes pratiques API (validation, health checks)

---
