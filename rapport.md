**Q1.** La méthodologie **12-factor app** définit 12 principes pour les applications cloud-native. Listez les 12 facteurs et indiquez pour chacun si vous le respectez dans ce TP, et pourquoi.
--> 
- Codebase
- Dependencies
- Config
- Backing services
- Build, release, run 
- Processes 
- Port binding
- Concurrency
- Disposability
- Dev/prod parity
- Logs
- Admin processes

**Q2.** En Kubernetes, un Pod a deux types de health checks : `livenessProbe` et `readinessProbe`. Quelle est la différence ? Lequel correspond à votre endpoint `/health` actuel ? Comment adapteriez-vous votre code pour exposer les deux séparément ?

--> En Kubernetes, ces deux sondes gèrent le cycle de vie des Pods différemment :
- Liveness Probe : Vérifie si l’application est toujours en vie et en cas d’échec, il y a un redémarrage du conteneur.
- Readiness Probe : Vérifie si l’application est prête à recevoir du trafic et en cas d’échec, elle est retirée du load balancer.
- L’endpoint /health actuel correspond à une Readiness Probe, car il vérifie l’état interne.

**Q3.** Expliquez pourquoi les logs doivent aller sur `stdout` et non dans des fichiers, dans un contexte de conteneurs Docker. Que se passe-t-il avec vos logs si vous faites `docker-compose down` ?
--> Dans un environnement conteneurisé, les logs doivent être envoyés sur stdout car les fichiers dans un conteneur disparaissent à sa suppression et Docker capture automatiquement stdout. Si on fait `docker-compose down`, tous les logs internes sont perdus.

**Q4.** Votre rate limiting fonctionne parfaitement avec un seul container du gateway. Expliquez pourquoi ce même mécanisme **cesserait de fonctionner correctement** si vous passiez à 3 replicas du gateway en production. Quelle solution proposeriez-vous ?
--> Le rate limiting utilise une variable en mémoire locale dans le Gateway et si on a plusieurs instances chaque instance a son propre compteur et l'utilisateur peut contourner la limite globale. La soution serait que toutes les instances partagent le même stockage.

**Q5.** Lors d'une commande, votre service Commandes appelle Notifications. Si Notifications est down, votre code gère l'erreur avec un try/catch (la commande est quand même créée). Décrivez deux approches alternatives qui garantiraient que la notification est envoyée **au moins une fois**, même si Notifications redémarre 10 minutes plus tard.
--> La première solution pourrait être de mettre en place un Message Broker comme des commande publié sur dans une file RabbitMQ par exemple et le service notifications les consomme plus tard, dès qu’il est disponible.
--> La seconde solution pourrait être d'utilisé le Transactional Outbox Pattern qui consiste à enregister les commandes et le message à envoyé dans une même transaction en base de données dans une table Outbox. Ensuite, un processus séparé lit cette table et envoie les notifications de manière fiable plus tard.

---
