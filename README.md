# Myabéshop

Plateforme SaaS de boutiques en ligne avec **paiement à la livraison (COD)** pour l'Afrique francophone. Un vendeur crée sa boutique en moins de 10 minutes depuis son téléphone, partage ses liens produits sur WhatsApp, Facebook et TikTok, et suit chaque commande jusqu'à l'argent encaissé.

Ce dépôt contient la **phase MVP** et la **phase « Paiements OK »** du cahier des charges : boutiques, commandes COD, livreurs, abonnements payés par Mobile Money, application livreur hors connexion, marketing, statistiques et back-office de la plateforme.

## Ce qui est livré

| Parcours | Fonctionnalités |
| --- | --- |
| **A — Le marchand lance sa boutique** | Inscription par téléphone + code OTP (ou e-mail + mot de passe), assistant de démarrage (nom, pays, catégorie, WhatsApp), sous-domaine réservé automatiquement, logo, zones de livraison pré-remplies selon le pays, premier produit, partage du lien (copie, WhatsApp, Facebook, QR code). Essai Pro de 14 jours. |
| **B — Le client commande** | Lien court `/p/abc1234`, landing page sans menu, page produit rendue côté serveur (≈ 109 Ko de JS, < 1 s en 3G simulée), formulaire intégré sans compte : variantes, offres par quantité (« 2 pour 18 000 F »), zone avec frais affichés, repère, GPS, note. Page de remerciement et suivi par lien, SMS de confirmation. Détection de la source (Facebook, TikTok…) et des UTM. |
| **C — Le marchand traite la commande** | Notification en temps réel (Socket.IO, son et notification navigateur), liste filtrable (statut, zone, livreur, source, recherche), fiche commande avec boutons **Appeler** et **WhatsApp** (récapitulatif pré-rempli), compteur d'appels, workflow de statuts contrôlé côté serveur, historique horodaté et attribué, modification avant expédition, saisie de commande téléphonique, actions groupées, export CSV, impression du bon de livraison. |
| **Livreurs et cash** | Livreurs créés par le marchand, connexion par téléphone, vue « Mes colis » (Appeler, WhatsApp, Itinéraire, Livrée / Reportée / Refusée), solde de cash dû mis à jour à chaque livraison, versements, rapport quotidien (remis, livrés, refusés, attendu, versé, écart, commission). |
| **Anti-fraude** | Validation du numéro selon le pays, doublons (même numéro + même produit < 24 h), score client (livrées / refusées), liste noire par boutique, limite de commandes par numéro et par jour, zones non desservies bloquées ou « à expédier par transporteur ». |
| **Équipe et rôles** | Propriétaire, Gestionnaire, Agent de confirmation (répartition automatique des nouvelles commandes), Livreur. Permissions vérifiées côté serveur à chaque requête. |
| **Isolation** | Chaque route `/stores/:storeId/*` vérifie l'appartenance et le rôle ; chaque requête est filtrée par `store_id`. Une boutique inaccessible renvoie 404 (on ne révèle pas son existence). Couvert par des tests automatisés, y compris pour le temps réel. |

### Phase « Paiements OK »

| Bloc | Fonctionnalités |
| --- | --- |
| **Abonnements Mobile Money** | Plans Gratuit / Starter / Pro / Business, mensuel ou annuel (2 mois offerts). Paiement via **FedaPay** (MTN, Moov, Orange, Wave, carte) ou **simulateur** en local. Webhook signé puis statut relu chez la passerelle, activation idempotente, renouvellement à partir de la date de fin, 7 jours de grâce puis retour automatique au plan Gratuit (aucune donnée supprimée), factures numérotées imprimables en PDF. |
| **Limites des plans** | Vérifiées côté serveur : produits, membres d’équipe, livreurs, agents, codes promo, pixels, Google Sheets, mention « Créé avec Myabéshop ». Au-delà du quota mensuel, les commandes sont **acceptées mais verrouillées** jusqu’au changement de plan : aucune vente perdue. |
| **Parrainage** | Lien de parrainage par boutique ; un mois offert au parrain au premier paiement du filleul. |
| **Application livreur** | PWA installable sur `/livreur` : connexion **téléphone + code PIN** (verrouillage 15 min après 5 erreurs), colis triés par quartier, Appeler / WhatsApp / Itinéraire, motifs de refus et report en un geste, cash à verser. **Fonctionne sans réseau** : la liste est gardée sur le téléphone, chaque action est mise en file puis rejouée au retour du réseau ; le serveur ignore une action déjà appliquée (identifiant client unique). |
| **Marketing** | Codes promo (pourcentage, montant, livraison offerte ; panier minimum, dates, nombre d’utilisations, consommation atomique), pixels Meta et TikTok (ViewContent, InitiateCheckout, Purchase avec montant, chargés après l’affichage pour tenir le budget 3G), Google Sheets via Apps Script (script fourni dans l’écran). |
| **Statistiques** | Taux de confirmation et de livraison, panier moyen, **bénéfice estimé** (encaissé − coût produits − commissions − pub), graphiques par jour, détails par produit, ville, source, livreur et agent, dépenses publicitaires, export CSV. |
| **Back-office super-admin** | `/admin` : boutiques, MRR, essais, abonnés, désabonnements, inscriptions ; recherche de marchands, suspension (vitrine masquée, écritures bloquées), attribution d’un plan, **session support « en tant que »** de 30 min, gestion des plans et prix, paiements, journal d’audit. |
| **File de tâches** | SMS, WhatsApp et Google Sheets passent par une file **BullMQ + Redis** avec relances (ou en mémoire sans Redis). |

## Comptes de démonstration (`SEED_DEMO=true`)

| Rôle | Connexion | Où |
| --- | --- | --- |
| Marchande (Boutique Démo, plan Pro payé, 72 commandes) | téléphone `07 07 07 07 07` (Côte d’Ivoire), code OTP affiché à l’écran | `/login` |
| Livreur Koffi | téléphone `01 01 01 01 01`, code PIN `1234` | `/livreur/connexion` |
| Super-admin | téléphone `01 02 03 04 05`, code OTP affiché à l’écran | `/admin` |
| Cliente | aucun compte | `/p/demo123` (code promo `BIENVENUE10`) |

## Architecture

```
apps/
  api/        NestJS 11 · Prisma 6 · PostgreSQL 16 · Socket.IO · Zod · OpenAPI (/docs)
  web/        Next.js 15 (App Router) · React 19 · Tailwind CSS 4 · PWA
packages/
  shared/     Types, schémas Zod, règles métier (rôles, statuts, prix, frais) partagés
```

- Montants stockés en **entiers** dans l'unité de la devise + code ISO 4217 (XOF/XAF d'abord, multi-devises prêt).
- Toutes les tables métier portent `store_id`. Le modèle complet de la section 12 est en place, y compris plans, abonnements, paiements, intégrations et journal d'audit.
- `@myabeshop/shared/client` est le sous-ensemble sans dépendances lourdes importé par les pages publiques, pour tenir le budget 3G.
- Les images sont redimensionnées et converties en WebP à l'envoi (stockage local en dev, Cloudflare R2 prévu en production).
- Les SMS et WhatsApp passent par `MessagingService` et la file de tâches : pour l'instant les messages sont journalisés, le fournisseur reste à choisir.
- Prisma tourne **sans moteur natif** (`engineType = "client"` + adaptateur `pg`) : rien à télécharger au déploiement pour les requêtes.
- Les paramètres d’intégration sont chiffrés en base (AES-256-GCM, clé `INTEGRATIONS_KEY`).

## Démarrer en local

Prérequis : Node 22, pnpm 10, PostgreSQL 16 (ou `docker compose up -d`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @myabeshop/shared build
pnpm db:migrate                       # crée les tables
SEED_DEMO=true pnpm db:seed           # plans + boutique démo (/s/demo, /p/demo123)
pnpm dev                              # API sur :4000, web sur :3000
```

- Web : http://localhost:3000 · Inscription : http://localhost:3000/login?signup=1
- Documentation de l'API : http://localhost:4000/docs
- En développement, le code OTP s'affiche à l'écran et dans les logs de l'API (`OTP_DEV_ECHO=true`, désactivé d'office en production).
- En local, les boutiques sont servies sous `/s/<slug>`. En production, `maboutique.<ROOT_DOMAIN>` est réécrit vers la boutique par le middleware Next.js, et les domaines personnalisés sont résolus via l'API.

## Tests

```bash
pnpm test                                   # unitaires (shared) + API : parcours A, B, C, rôles, isolation
pnpm --filter @myabeshop/web test:e2e       # Playwright sur profil Pixel 5 (API et web lancés)
```

Les tests API couvrent aussi la phase 2 (abonnements, grâce, quota, parrainage, PIN livreur, synchronisation hors ligne idempotente, codes promo, statistiques, back-office) : **35 tests**. Côté navigateur, un test coupe le réseau pendant une livraison et vérifie la synchronisation.

Les tests API utilisent une base dédiée (`TEST_DATABASE_URL`, par défaut `myabeshop_test`) : les migrations y sont appliquées et chaque test crée ses propres boutiques. La CI GitHub Actions exécute typage, tests, build et parcours navigateur.

## Paiements en production (FedaPay)

1. Créez un compte sur [fedapay.com](https://fedapay.com), récupérez la clé secrète (sandbox puis live).
2. Dans `apps/api/.env` : `PAYMENT_GATEWAY=fedapay`, `FEDAPAY_ENV=sandbox|live`, `FEDAPAY_SECRET_KEY=…`.
3. Dans le tableau de bord FedaPay, ajoutez le webhook `https://<api>/billing/webhooks/fedapay` et copiez son secret dans `FEDAPAY_WEBHOOK_SECRET`.
4. Une autre passerelle (CinetPay, PayDunya…) s’ajoute en implémentant `PaymentGateway` (`apps/api/src/billing/gateways`).

## Déploiement

- `Dockerfile` (cibles `api` et `web`) et `docker-compose.prod.yml` (PostgreSQL, Redis, API, web) pour un VPS ; mettez un proxy HTTPS (Caddy, Traefik) devant `app.`, `api.` et `*.votre-domaine`.
- L’API applique les migrations au démarrage (`prisma migrate deploy`) et lance le cycle des abonnements toutes les heures (`SCHEDULER=off` pour le désactiver sur des instances secondaires).
- Premier super-admin : `SUPER_ADMIN_PHONE=+229… pnpm db:seed`.

## Suite prévue (phase « Lancement public »)

- Fournisseur SMS / WhatsApp Business branché sur la file de tâches
- Photo de preuve de livraison, avis clients avec photos, panier multi-produits
- Row Level Security PostgreSQL en défense en profondeur, stockage Cloudflare R2, Sentry
- API Conversions Meta / TikTok côté serveur, webhooks et API publique (V2)
- Pilote avec 30 marchands, sauvegardes et restauration testées

## Questions ouvertes

Nom de domaine définitif, pays pilote, passerelle Mobile Money, fournisseur SMS / WhatsApp Business, grille tarifaire et budget d'hébergement.
