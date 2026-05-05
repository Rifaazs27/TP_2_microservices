# 🛒 E-Commerce Microservices Platform — TP2

## 1. Membres de l'équipe

* Zaafir [NOM]

---

## 2. Architecture

L'architecture est composée d'un point d'entrée unique (**API Gateway**) qui distribue les requêtes vers quatre services spécialisés.
La communication entre services est **synchrone via HTTP**.

<img width="1005" height="701" alt="image" src="https://github.com/user-attachments/assets/6edd6048-5003-47f1-8fb8-ab79cac29dd2" />


---

## 3. Choix techniques

### 🔹 Validation Manuelle Stricte

* Implémentation de validateurs natifs (sans Joi/Zod)
* ❌ Alternative rejetée : validation au niveau Gateway
* ✅ Raison : chaque microservice doit garantir l'intégrité de ses données (**Fail Fast**)

### 🔹 Stockage In-Memory

* Utilisation d'objets JavaScript globaux
* ❌ Alternative rejetée : Redis / MongoDB
* ✅ Raison : simplicité (TP court) + focus sur architecture

### 🔹 Communication avec Retry & Backoff

* Fonction custom de retry entre **Commandes → Notifications**
* ❌ Alternative rejetée : appel simple
* ✅ Raison : améliorer la fiabilité sans ajouter de broker

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

### 1. Priorité des routes Express

* Problème : `/orders/:id` interceptait `/orders/stats`
* ✅ Solution : déclarer les routes statiques **avant**

### 2. Types incohérents

* Problème : nombres envoyés comme chaînes
* ✅ Solution : `parseInt()` / `parseFloat()`

### 3. Statut de commande

* Problème : même statut accepté (200 au lieu de 400)
* ✅ Solution :

```js
if (newStatus === order.status) return 400;
```

### 4. Timeout des health checks

* Problème : un service down bloquait tout
* ✅ Solution : `Promise.allSettled` + timeout (2s)

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
