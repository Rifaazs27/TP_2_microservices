#!/bin/bash
# test.sh — Lancez avec : chmod +x test.sh && ./test.sh
# Prérequis : docker-compose up --build (stack démarrée)

BASE="http://localhost:3000"
CAT="http://localhost:3001"
PAN="http://localhost:3002"
CMD="http://localhost:3003"
NOT="http://localhost:3004"

PASS=0; FAIL=0
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" == "$expected" ]; then
    echo -e "${GREEN}  PASS${NC} $desc"
    PASS=$((PASS+1))
  else
    echo -e "${RED}  FAIL${NC} $desc — attendu: $expected, obtenu: $actual"
    FAIL=$((FAIL+1))
  fi
}

check_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo -e "${GREEN}  PASS${NC} $desc"
    PASS=$((PASS+1))
  else
    echo -e "${RED}  FAIL${NC} $desc — '$needle' absent de la réponse"
    FAIL=$((FAIL+1))
  fi
}

http() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
body() { curl -s "$@"; }

echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"
echo -e "${YELLOW}   Tests d'intégration — E-Commerce TP2  ${NC}"
echo -e "${YELLOW}════════════════════════════════════════${NC}"

# ── 1. Health checks ─────────────────────────────────────────
echo -e "\n--- 1. Health checks ---"
check "GET /health gateway"       "200" $(http $BASE/health)
check "GET /health catalogue"     "200" $(http $CAT/health)
check "GET /health panier"        "200" $(http $PAN/health)
check "GET /health commandes"     "200" $(http $CMD/health)
check "GET /health notifications" "200" $(http $NOT/health)

GATEWAY_HEALTH=$(body $BASE/health)
check_contains "Gateway health agrégé contient 'services'" "services" "$GATEWAY_HEALTH"
check_contains "Gateway health contient 'catalogue'" "catalogue" "$GATEWAY_HEALTH"

# ── 2. Métriques ─────────────────────────────────────────────
echo -e "\n--- 2. Métriques Prometheus ---"
check "GET /metrics catalogue HTTP 200" "200" $(http $CAT/metrics)
METRICS=$(body $CAT/metrics)
check_contains "/metrics contient _requests_total" "catalogue_requests_total" "$METRICS"
check_contains "/metrics contient _memory_bytes"   "catalogue_memory_bytes"   "$METRICS"
check_contains "/metrics contient _uptime_seconds" "catalogue_uptime_seconds" "$METRICS"

# ── 3. Catalogue CRUD ─────────────────────────────────────────
echo -e "\n--- 3. Catalogue ---"
check "GET /products"           "200" $(http $BASE/products)
check "GET /products/1"         "200" $(http $BASE/products/1)
check "GET /products/9999 → 404" "404" $(http $BASE/products/9999)

check "POST /products valide → 201" "201" \
  $(http -X POST $CAT/products -H "Content-Type: application/json" \
    -d '{"name":"Produit Test","price":29.99,"stock":5,"category":"other"}')

check "POST /products prix négatif → 400" "400" \
  $(http -X POST $CAT/products -H "Content-Type: application/json" \
    -d '{"name":"Bad","price":-10,"stock":5,"category":"other"}')

check "POST /products catégorie invalide → 400" "400" \
  $(http -X POST $CAT/products -H "Content-Type: application/json" \
    -d '{"name":"Bad","price":10,"stock":5,"category":"INVALIDE"}')

check "POST /products name vide → 400" "400" \
  $(http -X POST $CAT/products -H "Content-Type: application/json" \
    -d '{"name":"","price":10,"stock":5,"category":"other"}')

PROD_RESP=$(body -X POST $CAT/products -H "Content-Type: application/json" \
  -d '{"name":"Produit Perishable","price":5.00,"stock":3,"category":"food"}')
check_contains "POST /products → réponse contient id" '"id"' "$PROD_RESP"

# ── 4. Panier ─────────────────────────────────────────────────
echo -e "\n--- 4. Panier ---"
USER="test-user-$$"
check "GET /cart/:userId crée panier vide" "200" $(http $BASE/cart/$USER)

check "POST /cart/:userId/items → 201" "201" \
  $(http -X POST $PAN/cart/$USER/items -H "Content-Type: application/json" \
    -d '{"productId":2,"quantity":3,"unitPrice":89.99,"productName":"Clavier"}')

CART=$(body $PAN/cart/$USER)
check_contains "Panier contient l'item ajouté (productId 2)" '"productId":2' "$CART"
check_contains "Panier contient itemCount" '"itemCount"' "$CART"

check "POST même productId → quantité incrémentée" "201" \
  $(http -X POST $PAN/cart/$USER/items -H "Content-Type: application/json" \
    -d '{"productId":2,"quantity":1,"unitPrice":89.99,"productName":"Clavier"}')

CART2=$(body $PAN/cart/$USER)
# Après 2 ajouts du même produit (3+1), itemCount doit être 4
check_contains "Même produit → quantité incrémentée (itemCount=4)" '"itemCount":4' "$CART2"

check "POST quantity invalide → 400" "400" \
  $(http -X POST $PAN/cart/$USER/items -H "Content-Type: application/json" \
    -d '{"productId":1,"quantity":-1,"unitPrice":10}')

SUMMARY=$(body $PAN/cart/$USER/summary)
check_contains "GET /cart/:userId/summary contient total" '"total"' "$SUMMARY"
check_contains "GET /summary contient isEmpty" '"isEmpty"' "$SUMMARY"

# ── 5. Commandes ─────────────────────────────────────────────
echo -e "\n--- 5. Commandes ---"

ORDER_RESP=$(body -X POST $CMD/orders \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER\",\"items\":[{\"productId\":2,\"productName\":\"Clavier\",\"quantity\":1,\"unitPrice\":89.99}],\"shippingAddress\":\"1 rue Test, 75001 Paris\"}")

check_contains "POST /orders → status=pending" '"status":"pending"' "$ORDER_RESP"
check_contains "POST /orders → contient id"    '"id":"order-'       "$ORDER_RESP"

ORDER_ID=$(echo $ORDER_RESP | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

check "GET /orders/:id" "200" $(http $CMD/orders/$ORDER_ID)
check "GET /orders" "200" $(http $CMD/orders)

check "PATCH status pending→confirmed" "200" \
  $(http -X PATCH $CMD/orders/$ORDER_ID/status -H "Content-Type: application/json" \
    -d '{"status":"confirmed"}')

check "PATCH status invalide → 400" "400" \
  $(http -X PATCH $CMD/orders/$ORDER_ID/status -H "Content-Type: application/json" \
    -d '{"status":"pending"}')

STATS=$(body $CMD/orders/stats)
check_contains "GET /orders/stats contient total"     '"total"'     "$STATS"
check_contains "GET /orders/stats contient byStatus"  '"byStatus"'  "$STATS"
check_contains "GET /orders/stats contient revenue"   '"totalRevenue"' "$STATS"

# ── 6. Notifications ─────────────────────────────────────────
echo -e "\n--- 6. Notifications ---"
check "GET /notifications" "200" $(http $NOT/notifications)

# Vérifier que la commande a bien envoyé une notification
NOTIFS=$(body $NOT/notifications?userId=$USER)
check_contains "Notification de commande reçue" '"type":"order_created"' "$NOTIFS"

check "POST /notify type invalide → 400" "400" \
  $(http -X POST $NOT/notify -H "Content-Type: application/json" \
    -d '{"type":"type_qui_nexiste_pas","userId":"test"}')

NOTIF_STATS=$(body $NOT/notifications/stats)
check_contains "GET /notifications/stats contient byType" '"byType"' "$NOTIF_STATS"

# ── 7. Rate Limiting ─────────────────────────────────────────
echo -e "\n--- 7. Rate Limiting ---"
HEADERS=$(curl -sI $BASE/products)
check_contains "Header X-RateLimit-Limit présent"     "X-RateLimit-Limit"     "$HEADERS"
check_contains "Header X-RateLimit-Remaining présent" "X-RateLimit-Remaining" "$HEADERS"
check_contains "Header X-RateLimit-Reset présent"     "X-RateLimit-Reset"     "$HEADERS"

# ── 8. Erreurs 404 et 500 ────────────────────────────────────
echo -e "\n--- 8. Gestion des erreurs ---"
check "Route inexistante → 404" "404" $(http $CAT/route-inconnue)
ERR404=$(body $CAT/route-inconnue)
check_contains "404 contient error" '"error"' "$ERR404"

# ── Résumé ────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"
echo "  Total : $((PASS+FAIL)) tests | ${GREEN}$PASS PASS${NC} | ${RED}$FAIL FAIL${NC}"
echo -e "${YELLOW}════════════════════════════════════════${NC}"
[ $FAIL -eq 0 ] && echo -e "${GREEN}  ✔ Tous les tests passent !${NC}" && exit 0
echo -e "${RED}  ✘ $FAIL test(s) échoué(s)${NC}" && exit 1
