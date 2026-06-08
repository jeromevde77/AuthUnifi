# Installer AuthUnifi sur un NAS Synology

Guide pas à pas pour héberger le portail captif sur un Synology via
**Container Manager** (appelé **Docker** sur DSM 7.1 et antérieur).

> Durée : ~20 min. Aucune ligne de commande obligatoire (tout se fait dans DSM).

---

## 1. Prérequis

- DSM 7.0 ou supérieur.
- Un modèle Synology compatible Docker/Container Manager (la plupart des séries
  `+`, `play`, `value` récentes en x86-64 ou arm64). Les très vieux modèles
  armv7/ppc ne sont pas supportés — voir [Annexe : sans Docker](#annexe--installation-sans-docker).
- Votre **contrôleur UniFi** accessible depuis le NAS (même réseau local).
- De quoi atteindre le NAS depuis le **VLAN invité** (voir §7).

---

## 2. Installer Container Manager

1. Ouvrez le **Centre de paquets**.
2. Recherchez **Container Manager** (ou **Docker**) et installez-le.

---

## 3. Récupérer le code sur le NAS

Choisissez une méthode :

**Option A — Téléchargement ZIP (sans Git)**
1. Sur GitHub, ouvrez le dépôt, branche souhaitée → **Code → Download ZIP**.
2. Dans **File Station**, créez un dossier partagé `docker` puis un sous-dossier
   `authunifi`, et décompressez-y le ZIP. Vous devez obtenir, dans
   `/docker/authunifi`, les fichiers `Dockerfile`, `docker-compose.synology.yml`,
   `src/`, `views/`, etc.

**Option B — Git (si le paquet Git est installé)**
```bash
cd /volume1/docker
git clone <url-du-depot> authunifi
```

---

## 4. Préparer la configuration

1. Dans `/docker/authunifi`, copiez `.env.example` en **`.env`**
   (File Station → clic droit → Copier/Coller, puis renommer).
2. Éditez `.env` (clic droit → Ouvrir avec l'éditeur de texte) et remplissez au
   minimum :

   ```
   UNIFI_HOST=192.168.1.1        # IP de votre contrôleur UniFi
   UNIFI_PORT=443                # 443 (UDM/Cloud Key) ou 8443 (contrôleur logiciel)
   UNIFI_USERNAME=portal-admin   # compte admin local dédié
   UNIFI_PASSWORD=...
   UNIFI_SSL_VERIFY=false        # false si certificat auto-signé
   FACEBOOK_PAGE_URL=https://www.facebook.com/votre-page
   ADMIN_TOKEN=un-secret-long-et-aleatoire
   TRUST_PROXY=1                 # car on passe par le reverse-proxy DSM (§6)
   ```

   > Créez de préférence un **compte admin local dédié** sur le contrôleur UniFi
   > (pas votre compte principal) pour ce portail.

3. Renommez **`docker-compose.synology.yml` en `docker-compose.yml`**
   (l'assistant Projet de Container Manager attend ce nom exact).

   Ce fichier place la base SQLite dans `./data` (visible depuis File Station) et
   exécute le conteneur en root pour éviter les soucis de permissions.

---

## 5. Créer le projet dans Container Manager

1. Ouvrez **Container Manager → Projet → Créer**.
2. **Nom du projet** : `authunifi`.
3. **Chemin** : sélectionnez `/docker/authunifi`.
4. Container Manager détecte le `docker-compose.yml`. Validez.
5. Il **construit l'image** (compilation automatique de `better-sqlite3`, peut
   prendre quelques minutes la première fois) puis démarre le conteneur.
6. Vérifiez dans l'onglet **Conteneur** que `authunifi-portal` est **En cours**.

Testez depuis un navigateur sur le réseau local : `http://IP_DU_NAS:3000`
→ la page du portail doit s'afficher. L'admin est sur `http://IP_DU_NAS:3000/admin`
(identifiant `admin`, mot de passe = votre `ADMIN_TOKEN`).

> **Port déjà pris ?** Si 3000 est utilisé, éditez `docker-compose.yml` :
> `ports: ["3080:3000"]`, puis reconstruisez le projet. Le portail sera sur le 3080.

---

## 6. Activer le HTTPS (reverse-proxy intégré DSM)

Inutile d'installer Caddy/nginx : DSM le fait nativement et gère le certificat.

**a) Certificat Let's Encrypt** (si vous avez un nom de domaine pointant vers le NAS)
- **Panneau de configuration → Sécurité → Certificat → Ajouter → Let's Encrypt**.
- Renseignez votre domaine (ex. `portail.mondomaine.be`).

**b) Règle de proxy inversé**
- **Panneau de configuration → Portail de connexion → Avancé → Proxy inversé → Créer**.
- **Source** : `https`, nom d'hôte `portail.mondomaine.be`, port `443`.
- **Destination** : `http`, `localhost`, port `3000` (ou `3080` si modifié).
- Onglet **En-têtes personnalisés** → bouton **WebSocket** (ajoute les en-têtes
  `Upgrade`/`Connection`). Sans danger, recommandé.
- Dans l'onglet certificat, associez le certificat créé en (a).

Le portail est alors accessible en `https://portail.mondomaine.be`.
`TRUST_PROXY=1` (déjà mis au §4) assure qu'Express lit correctement les en-têtes
transmis par DSM.

> **OAuth (SmartSchool/Google/Microsoft)** : ces fournisseurs **exigent une URL de
> callback en HTTPS**. C'est ce reverse-proxy qui la fournit. Déclarez chez le
> fournisseur l'URL `https://portail.mondomaine.be/auth/<fournisseur>/callback` et
> reportez-la dans `.env` (voir le README principal).

---

## 7. Configurer le contrôleur UniFi

1. **Settings → Guest Hotspot** (ou WiFi invité) → activez le **Guest Portal**.
2. Type d'authentification : **External portal server**.
3. **External portal server** : l'adresse du portail —
   `IP_DU_NAS` + port `3000` en HTTP simple, ou votre domaine HTTPS si vous avez
   fait le §6.
4. **Pre-authorization access / Allowed domains** : ajoutez les domaines à
   joindre **avant** authentification (sinon le bouton Facebook / la page OAuth ne
   se chargent pas) :
   - `*.facebook.com`, `*.fbcdn.net`, `connect.facebook.net`
   - selon les méthodes OAuth activées : `oauth.smartschool.be`,
     `accounts.google.com`, `login.microsoftonline.com` (+ domaine de l'école)

> ### ⚠️ Le NAS doit être joignable depuis le VLAN invité
> Si votre WiFi invité est sur un VLAN/sous-réseau isolé, vérifiez que ce VLAN
> peut atteindre l'IP du NAS sur le port du portail. Une isolation trop stricte
> (pare-feu inter-VLAN) empêcherait les invités d'afficher la page. Ajoutez au
> besoin une règle autorisant `VLAN invité → IP_NAS:3000` (ou le port choisi).

---

## 8. Récupérer les emails collectés

- **Page d'admin** : `https://…/admin` → onglet des invités + activation des
  méthodes de connexion.
- **Export CSV** : `https://…/admin/export.csv` (ou `?token=ADMIN_TOKEN`).
- **Fichier brut** : `/docker/authunifi/data/portal.db` (SQLite), accessible et
  sauvegardable via File Station.

---

## 9. Sauvegardes

Tout l'état (emails + réglages des méthodes) tient dans le dossier
**`/docker/authunifi/data`**. Sauvegardez-le avec **Hyper Backup**, ou copiez
simplement `portal.db`. Le `.env` (configuration) mérite aussi une sauvegarde.

---

## 10. Mettre à jour le portail

1. Remplacez les fichiers du code sur le NAS par la nouvelle version
   (re-téléchargez le ZIP, ou `git pull`). **Ne touchez pas à `.env` ni au
   dossier `data/`.**
2. Container Manager → **Projet → authunifi → Construire** (rebuild), puis
   redémarrez. La base SQLite et sa migration automatique sont conservées.

---

## 11. Dépannage

| Symptôme | Piste |
|---|---|
| Le projet ne se crée pas | Le fichier doit s'appeler exactement `docker-compose.yml` (§4.3). |
| Build échoue : `OCI runtime create failed` / seccomp | Noyau Synology trop ancien pour la glibc récente. **Déjà corrigé** : l'image utilise Debian *bullseye* et le compte Synology ajoute `seccomp:unconfined`. Vérifiez que vous avez bien la dernière version du `Dockerfile` et du `docker-compose.synology.yml`, puis reconstruisez. |
| `EACCES` / permission denied sur la base | Le dossier `data/` n'est pas accessible en écriture. Le fichier Synology tourne en root pour éviter ça ; si vous l'avez retiré, rendez `data/` accessible à l'UID 1000. |
| La page invité ne s'ouvre pas sur les téléphones | Vérifiez l'accès VLAN invité → NAS (§7) et l'allowlist de pré-autorisation. |
| Erreur d'autorisation UniFi | Vérifiez `UNIFI_HOST/PORT/USERNAME/PASSWORD` et `UNIFI_SSL_VERIFY=false` pour un certificat auto-signé. Consultez les logs du conteneur. |
| Voir les logs | Container Manager → Conteneur → `authunifi-portal` → **Détails → Journal**. |
| Le like Facebook ne se vérifie pas | Normal : Facebook a supprimé cette possibilité en 2015 (voir README). |

---

## Annexe : installation sans Docker

Sur un modèle non compatible Container Manager, installez le paquet **Node.js**
(Centre de paquets), puis en SSH :

```bash
cd /volume1/docker/authunifi
npm ci --omit=dev
cp .env.example .env   # à éditer
node src/server.js
```

Pour un démarrage automatique, créez une tâche **Planificateur de tâches →
Tâche déclenchée → Au démarrage**, utilisateur `root`, exécutant
`node /volume1/docker/authunifi/src/server.js`.
(La méthode Docker reste recommandée.)
