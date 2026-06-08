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
git checkout claude/admiring-hopper-ClmEz
```
*(ou téléchargez le ZIP de la branche et copiez-le sur le Pi)*

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
docker compose -f docker-compose.rpi.yml up -d --build
```
Le build se fait sur le Pi (quelques minutes la première fois).

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

## 11. HTTPS (nécessaire pour SmartSchool / Google / Microsoft)

Les fournisseurs OAuth exigent une URL de redirection en **HTTPS public**. Le plus
simple sur le Pi est **Caddy** (certificat Let's Encrypt automatique). Il faut un
**nom de domaine** (ou DDNS) pointant vers votre IP publique, et une **redirection
de port 80+443** sur votre box/routeur vers le Pi.

Remplacez le lancement du §7 par un compose qui ajoute Caddy devant le portail —
créez `docker-compose.https.yml` :

```yaml
services:
  portal:
    build: .
    restart: unless-stopped
    env_file: .env
    expose:
      - "3000"               # plus publié sur 80 : Caddy s'en charge
    volumes:
      - ./data:/app/data
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
volumes:
  caddy_data:
```

Avec un fichier `Caddyfile` à côté :
```
portail.mondomaine.be {
    reverse_proxy portal:3000
}
```
Ajoutez `TRUST_PROXY=1` dans le `.env`, puis :
```bash
docker compose -f docker-compose.https.yml up -d --build
```
Déclarez ensuite chez chaque fournisseur l'URL
`https://portail.mondomaine.be/auth/<fournisseur>/callback`, et reportez-la dans
le `.env` (voir le README principal). Dans UniFi, mettez le domaine HTTPS comme
portail externe.

---

## 12. Sauvegardes

Tout l'état (emails + réglages) est dans **`./data/portal.db`**. Sauvegardez ce
dossier (copie, `rsync`, ou une tâche cron). Sauvegardez aussi le `.env`.

---

## 13. Mettre à jour

```bash
cd authunifi
git pull
docker compose -f docker-compose.rpi.yml up -d --build
```
La base SQLite (`./data`) et sa migration automatique sont conservées.

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
