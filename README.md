# AuthUnifi — Portail captif pour UniFi

Portail captif (hotspot public) pour contrôleurs **UniFi**. L'invité peut se
connecter de **deux façons** :

1. **Email + like Facebook** — saisie de l'email et invitation à liker une page.
2. **Compte SmartSchool (OAuth2)** — connexion avec son identifiant SmartSchool
   (optionnel ; activé seulement si configuré).

Les deux méthodes aboutissent à l'autorisation de l'invité sur le contrôleur UniFi.
Si SmartSchool n'est pas configuré, le portail affiche directement le formulaire email.

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

## Connexion SmartSchool (OAuth2) — optionnel

Pour proposer la connexion via un compte SmartSchool :

1. **Demandez un accès OAuth** sur https://www.smartschool.be/oauth/ — vous
   recevrez un `clientID` et un `secret`. Déclarez comme URL de redirection :
   `https://votre-portail/auth/smartschool/callback` (HTTPS obligatoire).
2. Renseignez dans le `.env` :
   ```
   SMARTSCHOOL_CLIENT_ID=...
   SMARTSCHOOL_CLIENT_SECRET=...
   SMARTSCHOOL_REDIRECT_URI=https://votre-portail/auth/smartschool/callback
   ```
3. La méthode SmartSchool apparaît alors automatiquement sur la page d'accueil.

Le portail récupère l'email et le nom depuis le profil SmartSchool (scope `userinfo`)
et les enregistre comme les autres invités (méthode `smartschool`).

> **Endpoints utilisés** : autorisation `oauth.smartschool.be/OAuth`,
> token `…/OAuth/index/token`, profil `…/Api/V1/userinfo`.
> Pensez à ajouter `oauth.smartschool.be` à la pré-autorisation UniFi (voir ci-dessous),
> sinon l'appareil bloqué ne pourra pas atteindre SmartSchool.

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
   - `oauth.smartschool.be` et le domaine de votre école (si SmartSchool est activé)

   Sans cela, l'appareil étant encore bloqué, le widget Facebook (ou la page
   SmartSchool) ne pourra pas se charger.

> Pour un déploiement en production, placez ce serveur derrière HTTPS
> (reverse proxy nginx/Caddy). Les navigateurs et la détection de portail
> captif fonctionnent plus fiablement en HTTPS.

## Administration & emails collectés

- **Page d'admin** : `https://votre-portail/admin` — tableau des invités, statistiques
  (total, emails uniques, aujourd'hui) et bouton d'export.
  Authentification HTTP : utilisateur `ADMIN_USER`, mot de passe `ADMIN_TOKEN`.
- **Export CSV** : `GET /admin/export.csv` (ou `?token=ADMIN_TOKEN` pour un accès `curl`).

## Déploiement avec Docker

```bash
cp .env.example .env   # éditez la config
docker compose up -d --build
```

La base SQLite est conservée dans le volume `portal-data`. Le portail écoute sur le
port 3000 (modifiable dans `docker-compose.yml`).

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
src/unifi.js        Client API du contrôleur UniFi (authorize-guest)
src/oauth.js        Flux OAuth2 SmartSchool + état signé (anti-CSRF)
src/db.js           Stockage SQLite des invités + statistiques
src/config.js       Chargement de la configuration (.env)
views/              Pages EJS (choice, login, succès, admin)
public/             CSS
Dockerfile          Image de production (multi-stage)
docker-compose.yml  Déploiement conteneurisé + volume des données
deploy/             Exemples reverse-proxy HTTPS (Caddy, nginx)
```
