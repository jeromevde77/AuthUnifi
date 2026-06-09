# AuthUnifi — Portail captif pour UniFi

Portail captif (hotspot public) pour contrôleurs **UniFi**. L'invité peut se
connecter via **plusieurs méthodes**, chacune activable/désactivable :

- **Email + like Facebook** — saisie de l'email et invitation à liker une page.
- **Compte (email + mot de passe)** — pour autoriser certains utilisateurs plus longtemps.
- **OAuth2** — connexion via **SmartSchool**, **Google** ou **Microsoft 365**.

Toutes les méthodes aboutissent à l'autorisation de l'invité sur le contrôleur UniFi.

Une **page de choix** liste les méthodes activées. S'il n'y en a qu'une seule, le
portail y redirige directement (pas d'écran de choix). Voir « Méthodes de connexion ».

## Comment ça marche

1. L'invité se connecte au WiFi invité UniFi.
2. UniFi le redirige vers ce serveur, en ajoutant en paramètres l'adresse MAC
   du client (`id`), celle du point d'accès (`ap`), le SSID, etc.
3. La page affiche le bouton **Like Facebook** + un champ **email**.
4. L'invité saisit son email et coche « J'ai liké la page ».
5. Le serveur enregistre l'email (SQLite) puis appelle l'API du contrôleur
   UniFi (`authorize-guest`) pour ouvrir l'accès Internet.

> **Note importante sur le « like ».** Depuis 2015, Facebook ne permet **plus**
> de vérifier techniquement qu'un visiteur a liké une page. Le portail affiche
> donc le bouton officiel et demande une confirmation manuelle (« J'ai liké »),
> mais il ne peut **pas garantir** que le like a réellement eu lieu. C'est une
> limite imposée par Facebook, pas par ce projet.

## Installation

```bash
npm install
cp .env.example .env
# éditez .env (contrôleur UniFi, page Facebook, jeton admin…)
npm start
```

Le serveur démarre sur `http://0.0.0.0:3000` (configurable via `PORT`).

## Configuration (`.env`)

| Variable | Description |
|---|---|
| `UNIFI_HOST` | IP/hôte du contrôleur |
| `UNIFI_PORT` | `443` (UniFi OS : UDM/UDM-Pro/Cloud Key Gen2) ou `8443` (contrôleur logiciel) |
| `UNIFI_USERNAME` / `UNIFI_PASSWORD` | Compte admin local dédié au portail |
| `UNIFI_SITE` | Site UniFi (`default` par défaut) |
| `UNIFI_SSL_VERIFY` | `false` pour un certificat auto-signé |
| `AUTH_MINUTES` | Durée d'accès accordée (480 = 8 h) |
| `FACEBOOK_PAGE_URL` | URL de la page à liker |
| `ADMIN_TOKEN` | Jeton pour l'export CSV des emails |

## Méthodes de connexion

Chaque méthode s'active indépendamment :

| Méthode | Activée si… | Désactiver |
|---|---|---|
| Email + Facebook | par défaut | `ENABLE_EMAIL=false` |
| Compte (email + mot de passe) | au moins un compte créé dans l'admin | `ENABLE_LOCAL=false` |
| SmartSchool | `SMARTSCHOOL_CLIENT_ID/SECRET/REDIRECT_URI` remplis | `ENABLE_SMARTSCHOOL=false` |
| Google | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` remplis | `ENABLE_GOOGLE=false` |
| Microsoft 365 | `MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI` remplis | `ENABLE_MICROSOFT=false` |

La page d'accueil affiche le choix entre les méthodes activées ; s'il n'y en a
qu'une, elle est utilisée directement.

Les variables `ENABLE_*` ne fixent que **l'état par défaut**. Le **panneau admin**
(`/admin`) permet d'activer/désactiver chaque méthode déjà configurée **à chaud**,
sans redémarrer ni éditer le `.env` (l'état est persisté en base). Les identifiants
OAuth, eux, restent dans le `.env`.

### Comptes (email + mot de passe) — accès longue durée

Pour qu'un utilisateur précis se connecte **plus longtemps** que la durée par
défaut, créez-lui un compte depuis le panneau admin (`/admin`, section
« Comptes ») : **email**, **mot de passe** et **durée propre** (en minutes). Il
se connectera ensuite via la méthode « Compte » avec ces identifiants, et sera
autorisé pour la durée du compte (au lieu de `AUTH_MINUTES`).

La méthode n'apparaît sur le portail que lorsqu'au moins un compte existe. Les
mots de passe sont stockés hachés (scrypt) en base ; réutiliser un email existant
met à jour son mot de passe et sa durée.

### Configurer un fournisseur OAuth

Pour chaque fournisseur, renseignez `<NOM>_CLIENT_ID`, `<NOM>_CLIENT_SECRET` et
`<NOM>_REDIRECT_URI` dans le `.env`. **L'URL de redirection doit être publique,
en HTTPS, et déclarée côté fournisseur** ; elle suit toujours le format
`https://votre-portail/auth/<fournisseur>/callback`.

- **SmartSchool** — accès via https://www.smartschool.be/oauth/
  (endpoints `oauth.smartschool.be`, scope `userinfo`).
- **Google** — OAuth client « Web » sur https://console.cloud.google.com/.
- **Microsoft 365** — app enregistrée sur https://entra.microsoft.com/
  (`MICROSOFT_TENANT` = `common` ou l'ID de votre tenant).

Le portail récupère l'email et le nom depuis le profil du fournisseur et les
enregistre comme les autres invités (la méthode est indiquée dans l'admin/CSV).

> Pensez à ajouter le domaine du fournisseur (ex. `oauth.smartschool.be`,
> `accounts.google.com`, `login.microsoftonline.com`) à la pré-autorisation UniFi
> (voir ci-dessous), sinon l'appareil bloqué ne pourra pas l'atteindre.

### Durée d'accès selon le groupe (SmartSchool / Google / Microsoft 365)

La durée d'autorisation peut dépendre de l'appartenance de l'utilisateur à un groupe.

Les règles **se gèrent depuis le panneau admin** (`/admin` → « Durées d'accès par
groupe » : ajout/suppression, persisté en base, sans redémarrage). La variable
`GROUP_DURATIONS` ne sert qu'à **amorcer** la table au tout premier démarrage :

```
GROUP_DURATIONS={"google":{"profs@ecole.be":10080,"eleves@ecole.be":480},"microsoft":{"<guid>":10080}}
```

- Si l'utilisateur appartient à **plusieurs** groupes mappés, **la plus longue
  durée l'emporte** ; sinon `AUTH_MINUTES` (durée par défaut) s'applique.
- **Google** : groupes identifiés par leur **email** ; activez l'**API Cloud
  Identity** dans votre projet Google Cloud (scope `cloud-identity.groups.readonly`
  ajouté automatiquement).
- **Microsoft 365** : groupes identifiés par leur **GUID** (ou nom) ; scope
  `GroupMember.Read.All` ajouté automatiquement, nécessite le **consentement
  administrateur** du tenant. Lecture via Microsoft Graph (`/me/memberOf`).
- **SmartSchool** : groupes/classes identifiés par leur **nom ou code** ; scope
  `groupinfo` ajouté automatiquement. *(La structure exacte de l'API `groupinfo`
  n'étant pas publiquement documentée, le portail extrait les champs `name`/`code`/
  `desc` — à vérifier avec un compte réel.)*
- Le scope groupes n'est demandé que si une règle existe pour le fournisseur.
  Les groupes sont lus par un appel API dédié après la connexion ; en cas d'échec,
  la connexion aboutit quand même avec la durée par défaut.

## Configuration du contrôleur UniFi

Dans **Settings → Guest Hotspot** (ou WiFi invité) :

1. Activez le **Guest Portal** / **Hotspot**.
2. Type d'authentification : **External portal server**.
3. **External portal server** : l'IP/domaine de ce serveur (ex. `192.168.1.50`)
   et le port (ex. `3000`).
4. **Pre-authorization access / Allowed domains** : ajoutez les domaines
   Facebook pour que le bouton Like puisse se charger **avant** l'authentification :
   - `facebook.com`, `www.facebook.com`, `*.facebook.com`
   - `fbcdn.net`, `*.fbcdn.net`, `connect.facebook.net`
   - selon les fournisseurs OAuth activés : `oauth.smartschool.be`,
     `accounts.google.com`, `login.microsoftonline.com` (+ le domaine de l'école)

   Sans cela, l'appareil étant encore bloqué, le widget Facebook (ou la page de
   connexion du fournisseur) ne pourra pas se charger.

> Pour un déploiement en production, placez ce serveur derrière HTTPS
> (reverse proxy nginx/Caddy). Les navigateurs et la détection de portail
> captif fonctionnent plus fiablement en HTTPS.

## Contrôleur Omada (alternative à UniFi)

Le portail fonctionne aussi avec un contrôleur **TP-Link Omada** (OC200/OC300 ou
logiciel v5.0.15+). Mettez `CONTROLLER_TYPE=omada` dans le `.env` et renseignez le
bloc `OMADA_*` (voir `.env.example`). Toute la partie visible (email + like, OAuth,
admin, durées par groupe) est identique ; seule l'autorisation côté contrôleur change.

Prérequis côté Omada :
1. **Compte « opérateur »** : créez-le dans Omada → **Hotspot Manager** (ce n'est
   pas le compte admin). Renseignez-le dans `OMADA_OPERATOR_USER/PASSWORD`.
2. **Controller ID** : le long identifiant visible dans l'URL de l'interface Omada
   → `OMADA_CONTROLLER_ID`.
3. Dans **Settings → Authentication → Portal**, créez un portail avec
   **Authentication Type = External Portal Server** et indiquez l'URL de ce serveur.
4. Ajoutez les mêmes domaines (Facebook / OAuth) à la liste d'autorisation
   préalable du portail Omada.

> Le portail s'authentifie auprès du contrôleur via l'API hotspot
> (`/[id]/api/v2/hotspot/login` puis `/extPortal/auth`, `authType` 4). La durée
> est convertie en millisecondes. Implémenté d'après la doc officielle TP-Link ;
> à valider sur votre matériel.

## Administration & emails collectés

- **Page d'admin** : `https://votre-portail/admin` — activation des méthodes de
  connexion, tableau des invités, statistiques (total, emails uniques, aujourd'hui)
  et bouton d'export.
  Authentification HTTP : utilisateur `ADMIN_USER`, mot de passe `ADMIN_TOKEN`.
- **Export CSV** : `GET /admin/export.csv` (ou `?token=ADMIN_TOKEN` pour un accès `curl`).

## Déploiement avec Docker

```bash
cp .env.example .env   # éditez la config
docker compose up -d --build
```

La base SQLite est conservée dans le volume `portal-data`. Le portail écoute sur le
port 3000 (modifiable dans `docker-compose.yml`).

**Synology** : voir le guide pas à pas dédié **[SYNOLOGY.md](SYNOLOGY.md)**.
En résumé, utilisez `docker-compose.synology.yml` (base en bind mount `./data`
visible depuis File Station, conteneur en root pour éviter les soucis de
permissions) ; dans Container Manager → Projet, renommez-le `docker-compose.yml`.
Pour le HTTPS, le proxy inversé intégré de DSM suffit — pensez alors à `TRUST_PROXY=1`.

**Raspberry Pi** : voir **[RASPBERRYPI.md](RASPBERRYPI.md)**. Le `docker-compose.rpi.yml`
fait tourner le portail directement sur le **port 80** (pratique : le champ
« External Portal Server » d'UniFi n'accepte qu'une IP, sans port).

## HTTPS / reverse-proxy (production)

En production, placez le portail derrière un reverse-proxy HTTPS. Des exemples
prêts à l'emploi sont fournis dans `deploy/` :

- **Caddy** (`deploy/Caddyfile`) : HTTPS automatique via Let's Encrypt.
- **nginx** (`deploy/nginx.conf`) : à utiliser avec `certbot`.

Pensez à définir **`TRUST_PROXY=1`** dans le `.env` pour qu'Express interprète
correctement les en-têtes `X-Forwarded-*` envoyés par le proxy.

## Stockage

Les données sont dans `data/portal.db` (SQLite). Ce dossier est ignoré par git.

## Structure

```
src/server.js       Routes Express (choix, login, OAuth, autorisation, admin)
src/controller.js   Répartiteur UniFi/Omada + normalisation des paramètres
src/unifi.js        Adaptateur UniFi (authorize-guest)
src/omada.js        Adaptateur Omada (hotspot login + extPortal/auth)
src/oauth.js        Flux OAuth2 générique + état signé (anti-CSRF)
src/localauth.js    Comptes email + mot de passe (hash scrypt, vérif, CRUD admin)
src/methods.js      Activation des méthodes (override admin ▸ défaut .env)
src/groups.js       Règles de durée par groupe (table éditable + calcul)
src/db.js           Stockage SQLite (invités, réglages, comptes) + statistiques
src/config.js       Chargement de la configuration (.env)
views/              Pages EJS (choice, login, local, succès, admin)
public/             CSS
Dockerfile          Image de production (multi-stage)
docker-compose.yml  Déploiement conteneurisé + volume des données
deploy/             Exemples reverse-proxy HTTPS (Caddy, nginx)
.github/workflows/  CI : vérif syntaxe, smoke test, build Docker
```
