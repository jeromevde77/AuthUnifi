# Installer AuthUnifi sur un Raspberry Pi

Guide pas à pas pour héberger le portail captif sur un Raspberry Pi.

> Pourquoi un Pi plutôt qu'un NAS Synology ? Noyau récent (Docker construit sans
> l'erreur seccomp), IP propre sur le réseau (joignable directement par UniFi et
> les PC), et possibilité de tourner **sur le port 80** — ce qui évite le souci du
> champ « External Portal Server » d'UniFi qui n'accepte qu'une IP, sans port.

---

## 1. Prérequis

- Un Raspberry Pi (3, 4, 5 ou Zero 2 W — tout modèle **64-bit**).
- Une carte microSD (8 Go suffisent) + l'outil **Raspberry Pi Imager**.
- Le Pi et le contrôleur UniFi sur le même réseau local.

---

## 2. Préparer la carte SD

1. Dans **Raspberry Pi Imager** : OS → **Raspberry Pi OS Lite (64-bit)**.
2. Roue dentée (options avancées) :
   - activez **SSH** (authentification par mot de passe ou clé) ;
   - définissez le **nom d'utilisateur** (ex. `pi`) et un mot de passe ;
   - éventuellement le Wi-Fi (sinon branchez en Ethernet — recommandé).
3. Flashez, insérez la carte, démarrez le Pi.

---

## 3. IP fixe + connexion SSH

1. Donnez une **IP fixe** au Pi (réservation DHCP dans UniFi, ex. `192.168.0.50`).
2. Connectez-vous :
   ```bash
   ssh pi@192.168.0.50
   ```

---

## 4. Installer Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```
**Déconnectez-vous puis reconnectez-vous** (pour que le groupe `docker` prenne effet).
Vérifiez : `docker run --rm hello-world`.

---

## 5. Récupérer le projet

```bash
git clone https://github.com/jeromevde77/AuthUnifi.git authunifi
cd authunifi
```
*(la branche `main` est récupérée par défaut ; ou téléchargez le ZIP et copiez-le sur le Pi)*

---

## 6. Configurer

```bash
cp .env.example .env
nano .env
```
Renseignez au minimum :
```
UNIFI_HOST=192.168.0.1        # IP du contrôleur UniFi
UNIFI_PORT=443                # 443 (UDM/Cloud Key) ou 8443 (contrôleur logiciel)
UNIFI_USERNAME=portal-admin
UNIFI_PASSWORD=...
UNIFI_SSL_VERIFY=false
FACEBOOK_PAGE_URL=https://www.facebook.com/votre-page
ADMIN_TOKEN=un-secret-long-et-aleatoire
```
> Ne définissez **pas** `PORT` : le serveur écoute sur 3000 *dans* le conteneur ;
> c'est le `docker-compose.rpi.yml` qui l'expose sur le port 80 du Pi.

---

## 7. Lancer

```bash
mkdir -p data
docker compose -f docker-compose.rpi.yml pull
docker compose -f docker-compose.rpi.yml up -d
```
L'image multi-arch (arm64) est tirée depuis ghcr.io — rien n'est compilé sur le Pi.

> Prérequis : le package GHCR `authunifi` doit être **public** (GitHub → Packages →
> authunifi → Package settings → Public), sinon faites `docker login ghcr.io` sur
> le Pi avant le `pull`.

Vérifiez : `docker compose -f docker-compose.rpi.yml ps` → le conteneur tourne.

---

## 8. Tester

Depuis un PC du réseau : **`http://192.168.0.50`** → la page du portail.
Admin : `http://192.168.0.50/admin` (utilisateur `admin`, mot de passe = `ADMIN_TOKEN`).

---

## 9. Démarrage automatique

Rien à faire : Docker démarre au boot et `restart: unless-stopped` relance le
conteneur automatiquement (y compris après une coupure de courant).

---

## 10. Configurer le contrôleur UniFi

1. **Settings → WiFi → (réseau invité) → Guest Hotspot** : activez-le.
2. Authentification : **External Portal Server**.
3. Adresse : **`192.168.0.50`** (le port 80 est implicite — c'est tout l'intérêt).
4. **Pre-authorization / Allowed domains** : ajoutez `192.168.0.50`, plus
   `*.facebook.com`, `*.fbcdn.net`, et les domaines OAuth si utilisés
   (`oauth.smartschool.be`, `accounts.google.com`, `login.microsoftonline.com`).

---

## 11. HTTPS (nécessaire pour SmartSchool / Google / Microsoft et UniFi)

Les fournisseurs OAuth exigent une URL de redirection en **HTTPS**, et UniFi
(Network 9.x / UDR7) redirige le captive portal en HTTPS. Il faut donc un
**certificat valide** — impossible pour une IP nue, il faut un **nom de domaine**.

La méthode ci-dessous garde le Pi **100 % sur le LAN** (aucun port à ouvrir vers
Internet) grâce au challenge **DNS-01** : Caddy prouve la possession du domaine via
un enregistrement DNS, pas via un port entrant. Exemple avec un domaine géré chez
**OVH** (`smartschool.domobel.be` → IP locale du Pi).

Les fichiers sont déjà fournis : `docker-compose.rpi-https.yml`,
`deploy/Caddyfile.ovh`, `deploy/Caddy.ovh.Dockerfile`.

**a. Token API OVH** — sur https://api.ovh.com/createToken/, droits sur la zone DNS :
```
GET POST PUT DELETE   /domain/zone/*
```
OVH renvoie *Application Key*, *Application Secret*, *Consumer Key*.

**b. Enregistrement DNS** — chez OVH, zone du domaine, ajoutez un type **A** :
```
smartschool   A   192.168.0.50        # l'IP LOCALE du Pi
```
(Une IP privée dans le DNS public est normal : seuls les appareils du LAN
l'utiliseront. Let's Encrypt ne vérifie que l'enregistrement TXT, pas le A.)

**c. `.env`** — ajoutez :
```
PORTAL_DOMAIN=smartschool.domobel.be
OVH_ENDPOINT=ovh-eu
OVH_APPLICATION_KEY=...
OVH_APPLICATION_SECRET=...
OVH_CONSUMER_KEY=...
TRUST_PROXY=1
```
et faites pointer les `*_REDIRECT_URI` OAuth vers ce domaine
(`https://smartschool.domobel.be/auth/<fournisseur>/callback`).

**d. Lancer** (remplace le compose du §7) — les images sont construites par GitHub
Actions et **tirées depuis ghcr.io**, rien n'est compilé sur le Pi :
```bash
docker compose -f docker-compose.rpi-https.yml pull
docker compose -f docker-compose.rpi-https.yml up -d
docker compose -f docker-compose.rpi-https.yml logs -f caddy   # « certificate obtained »
```
> Prérequis : les packages GHCR `authunifi` et `authunifi-caddy` doivent être
> **publics** (GitHub → Packages → … → *Package settings → Change visibility →
> Public*). Sinon, `docker login ghcr.io` sur le Pi avant le `pull`.

Testez depuis un appareil du LAN : `https://smartschool.domobel.be/` avec cadenas valide.

**e. UniFi** — mettez le **domaine** `smartschool.domobel.be` comme External Portal
Server, activez « Redirect using HTTPS », et pré-autorisez ce domaine + ceux des
fournisseurs (`collegedavinci.smartschool.be`, `login.microsoftonline.com`…).

> **Astuce DNS local** : depuis un appareil du LAN, `ping smartschool.domobel.be`
> doit répondre `192.168.0.50`. Si votre réseau active une protection « DNS rebind »,
> autorisez ce domaine (sinon les réponses pointant vers une IP privée sont filtrées).

---

## 12. Sauvegardes

Tout l'état (emails + réglages) est dans **`./data/portal.db`**. Sauvegardez ce
dossier (copie, `rsync`, ou une tâche cron). Sauvegardez aussi le `.env`.

---

## 13. Mettre à jour

```bash
cd authunifi
# HTTP simple :
docker compose -f docker-compose.rpi.yml pull
docker compose -f docker-compose.rpi.yml up -d
# ou, en HTTPS (Caddy + OVH, §11) :
docker compose -f docker-compose.rpi-https.yml pull
docker compose -f docker-compose.rpi-https.yml up -d
```
On tire la nouvelle image depuis ghcr.io (publiée par GitHub Actions à chaque push
sur `main`) — pas de build sur le Pi. La base SQLite (`./data`) et sa migration
automatique sont conservées.

> **Passage de HTTP à HTTPS** : arrêtez d'abord l'ancien stack pour libérer le
> port 80, puis lancez le nouveau :
> ```bash
> docker compose -f docker-compose.rpi.yml down
> docker compose -f docker-compose.rpi-https.yml pull
> docker compose -f docker-compose.rpi-https.yml up -d
> ```

---

## 14. Dépannage

| Symptôme | Piste |
|---|---|
| `permission denied` sur la base | `sudo chown -R 1000:1000 data` puis relancez. |
| Port 80 déjà utilisé | Un autre service écoute sur 80 (`sudo ss -tlnp \| grep :80`). Changez le nombre de gauche du mapping (ex. `"8080:3000"`). |
| Injoignable depuis le réseau | Vérifiez l'IP du Pi (`hostname -I`) et que le conteneur tourne (`docker compose ps`). |
| Erreur d'autorisation UniFi | Vérifiez `UNIFI_HOST/PORT/USERNAME/PASSWORD` et `UNIFI_SSL_VERIFY=false`. Logs : `docker compose logs portal`. |
| Voir les logs | `docker compose -f docker-compose.rpi.yml logs -f portal`. |

---

> **Alternative sans build** : une image **arm64** est publiée sur GHCR. Si vous
> avez rendu le package public, remplacez `build: .` par
> `image: ghcr.io/jeromevde77/authunifi:latest` dans le compose. Mais sur le Pi,
> le build local fonctionne très bien — c'est plus simple.
