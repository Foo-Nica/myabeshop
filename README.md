# Myabéshop

Plateforme SaaS de boutiques en ligne avec **paiement à la livraison (COD)** pour l'Afrique francophone. Un vendeur crée sa boutique en moins de 10 minutes depuis son téléphone, partage ses liens produits sur WhatsApp, Facebook et TikTok, et suit chaque commande jusqu'à l'argent encaissé.

Ce dépôt contient la **phase MVP** du cahier des charges (parcours A, B et C, zones de livraison, isolation multi-boutiques).

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
- Les SMS et WhatsApp passent par `MessagingService` : pour l'instant les messages sont journalisés, le fournisseur reste à choisir.

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

Les tests API utilisent une base dédiée (`TEST_DATABASE_URL`, par défaut `myabeshop_test`) : les migrations y sont appliquées et chaque test crée ses propres boutiques. La CI GitHub Actions exécute typage, tests, build et parcours navigateur.

## Suite prévue (phase « Paiements OK »)

- PWA livreur hors connexion (file d'actions synchronisée), connexion livreur par code PIN
- Abonnements par Mobile Money (passerelle à choisir : CinetPay, FedaPay, PayDunya) et application des limites de plan
- Pixels Meta / TikTok, Google Sheets
- File BullMQ + Redis pour SMS / WhatsApp, Row Level Security PostgreSQL en défense en profondeur, stockage R2
- Back-office super-admin

## Questions ouvertes

Nom de domaine définitif, pays pilote, passerelle Mobile Money, fournisseur SMS / WhatsApp Business, grille tarifaire et budget d'hébergement.
