import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  config, reloadConfig, setConfig, isOverridden, isControllerConfigured,
  SETTINGS_SCHEMA, configValue, isSecretSet,
} from './config.js';
import {
  hasAdminPassword, setAdminPassword, verifyAdminPassword,
  issueSession, clearSession, hasValidSession,
} from './adminauth.js';
import { recordGuest, allGuests, guestStats } from './db.js';
import { authorizeClient, unauthorizeClient, unauthorizeAllClients, extractParams } from './controller.js';
import { signState, verifyState, buildAuthorizeUrl, handleCallback } from './oauth.js';
import { enabledMethods, isEnabled, listMethods, setEnabled } from './methods.js';
import { verifyLocalUser, listUsers, addUser, removeUser } from './localauth.js';
import {
  durationForGroups, hasGroupRules, seedFromEnv,
  listRules, addRule, removeRule, groupProviderIds,
} from './groups.js';

seedFromEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

app.set('view engine', 'ejs');
app.set('views', join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(join(__dirname, '..', 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Paramètres normalisés (indépendants du contrôleur), transportés via les champs
// cachés du formulaire et l'état OAuth.
const PARAM_KEYS = ['clientMac', 'apMac', 'ssid', 'radioId', 'site', 'redirectUrl', 't'];
const pickParams = (src) => Object.fromEntries(PARAM_KEYS.map((k) => [k, src[k]]));

const buildQs = (params) =>
  new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString();

// Affiche le formulaire email (le lien « retour » n'apparaît que s'il existe un choix).
const renderLogin = (res, { params, error = null, status = 200 }) =>
  res.status(status).render('login', {
    config, params, error, showBack: enabledMethods().length > 1,
  });

// Enregistre l'invité, l'autorise sur le contrôleur puis affiche la page de succès.
async function finishLogin(res, { params, email, name, method, liked, minutes, onError }) {
  recordGuest({ email, name, method, mac: params.clientMac, apMac: params.apMac, ssid: params.ssid, liked });

  if (!params.clientMac) {
    // Pas de MAC : on ne peut pas autoriser (ex. test hors hotspot).
    return res.render('success', { config, authorized: false, redirectUrl: params.redirectUrl });
  }
  try {
    await authorizeClient(params, minutes);
    res.render('success', { config, authorized: true, redirectUrl: params.redirectUrl });
  } catch (err) {
    console.error("Échec de l'autorisation du contrôleur :", err.message);
    onError("Une erreur est survenue lors de la connexion. Merci de réessayer.");
  }
}

// Page du portail : le contrôleur redirige ici avec ses paramètres en query.
// UniFi redirige vers /guest/s/<site>/ ; on sert la même page à la racine et à
// ce chemin. Affiche le choix des méthodes activées ; redirige si une seule l'est.
app.get(['/', '/guest/s/:site'], (req, res) => {
  const params = extractParams(req.query);
  const methods = enabledMethods();
  if (methods.length === 0) {
    return res.status(503).send('Aucune méthode de connexion configurée.');
  }
  if (methods.length === 1) {
    const qs = buildQs(params);
    return res.redirect(methods[0].href + (qs ? `?${qs}` : ''));
  }
  res.render('choice', { config, params, methods });
});

// Formulaire email + like Facebook.
app.get('/login', (req, res) => {
  if (!isEnabled('email')) return res.status(404).send('Méthode email désactivée');
  renderLogin(res, { params: pickParams(req.query) });
});

// Soumission email : valide, enregistre, autorise.
app.post('/authorize', async (req, res) => {
  if (!isEnabled('email')) return res.status(404).send('Méthode email désactivée');
  const params = pickParams(req.body);
  const { email, liked } = req.body;

  const renderError = (message) => renderLogin(res, { params, error: message, status: 400 });

  if (!email || !EMAIL_RE.test(email)) {
    return renderError('Veuillez saisir une adresse email valide.');
  }
  if (liked !== 'on') {
    return renderError('Veuillez confirmer que vous avez liké notre page Facebook.');
  }

  await finishLogin(res, {
    params, email, name: null, method: 'email', liked: true, onError: renderError,
  });
});

// --- Connexion par compte local (email + mot de passe) — accès longue durée ---

const renderLocal = (res, { params, error = null, status = 200 }) =>
  res.status(status).render('local', {
    config, params, error, showBack: enabledMethods().length > 1,
  });

// Formulaire email + mot de passe.
app.get('/local', (req, res) => {
  if (!isEnabled('local')) return res.status(404).send('Méthode compte désactivée');
  renderLocal(res, { params: pickParams(req.query) });
});

// Soumission : vérifie les identifiants, autorise pour la durée du compte.
app.post('/local/authorize', async (req, res) => {
  if (!isEnabled('local')) return res.status(404).send('Méthode compte désactivée');
  const params = pickParams(req.body);
  const { email, password } = req.body;

  const renderError = (message) => renderLocal(res, { params, error: message, status: 400 });

  const minutes = verifyLocalUser(email, password);
  if (minutes === null) {
    return renderError('Email ou mot de passe incorrect.');
  }

  await finishLogin(res, {
    params, email: email.trim().toLowerCase(), name: null,
    method: 'local', liked: false, minutes, onError: renderError,
  });
});

// --- Connexion via fournisseur OAuth2 (SmartSchool, Google, Microsoft 365) ---

// Redirige vers le fournisseur, en embarquant les paramètres UniFi dans l'état signé.
app.get('/auth/:provider', (req, res) => {
  const provider = config.providers[req.params.provider];
  if (!provider || !isEnabled(provider.id)) return res.status(404).send('Fournisseur non disponible');
  const state = signState({ ...pickParams(req.query), n: crypto.randomBytes(8).toString('hex') });
  res.redirect(buildAuthorizeUrl(provider, state, hasGroupRules(provider.id)));
});

// Retour OAuth : vérifie l'état, récupère le profil, autorise l'invité.
app.get('/auth/:provider/callback', async (req, res) => {
  const provider = config.providers[req.params.provider];
  if (!provider || !isEnabled(provider.id)) return res.status(404).send('Fournisseur non disponible');

  const renderError = (message) => renderLogin(res, { params: {}, error: message, status: 400 });

  const payload = verifyState(req.query.state);
  if (!payload || !req.query.code) {
    return renderError('Connexion invalide ou expirée. Réessayez.');
  }
  const params = pickParams(payload);

  try {
    const withGroups = hasGroupRules(provider.id);
    const { email, name, groups } = await handleCallback(provider, req.query.code, withGroups);
    const minutes = durationForGroups(provider.id, groups);
    await finishLogin(res, {
      params, email, name, method: provider.id, liked: false, minutes, onError: renderError,
    });
  } catch (err) {
    console.error(`Échec OAuth ${provider.id} :`, err.message);
    renderError('La connexion a échoué. Réessayez.');
  }
});

// Protège les routes admin. Ordre :
//  1) session par cookie (login par mot de passe) ;
//  2) break-glass : ADMIN_TOKEN du .env (Basic Auth ou ?token=) — toujours valable ;
//  3) première installation : si aucun mot de passe admin ET aucun ADMIN_TOKEN,
//     l'admin est ouvert le temps de définir un mot de passe (puis verrouillé).
// Sinon : redirection vers la page de login.
function requireAdmin(req, res, next) {
  if (hasValidSession(req)) return next();

  if (config.adminToken) {
    if (req.query.token === config.adminToken || req.body.token === config.adminToken) return next();
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
      if (user === config.adminUser && pass === config.adminToken) return next();
    }
  }

  if (!hasAdminPassword() && !config.adminToken) return next();

  // Mot de passe défini → page de login. Sinon (token only) → challenge Basic Auth.
  if (hasAdminPassword()) return res.redirect('/admin/login');
  res.set('WWW-Authenticate', 'Basic realm="AuthUnifi Admin"');
  return res.status(401).send('Authentification requise');
}

// Redirige vers /admin en conservant le token (mode ?token= dans l'URL),
// sinon le retour reperdrait l'authentification après un POST.
function adminRedirect(req, res, params = {}) {
  const token = req.body.token || req.query.token;
  const qs = new URLSearchParams(params);
  if (token) qs.set('token', token);
  const s = qs.toString();
  res.redirect('/admin' + (s ? '?' + s : ''));
}

// --- Login / logout admin ---------------------------------------------------

app.get('/admin/login', (req, res) => {
  if (hasValidSession(req)) return res.redirect('/admin');
  if (!hasAdminPassword()) {
    // Pas encore de mot de passe : on laisse l'accès actuel (token/ouvert) gérer.
    return res.redirect('/admin');
  }
  res.render('login-admin', { config, error: null });
});

app.post('/admin/login', (req, res) => {
  if (verifyAdminPassword(req.body.password)) {
    issueSession(req, res);
    return res.redirect('/admin');
  }
  res.status(401).render('login-admin', { config, error: 'Mot de passe incorrect.' });
});

app.get('/admin/logout', (req, res) => {
  clearSession(res);
  res.redirect('/admin/login');
});

// --- Configuration (réglages en base ; sert aussi de wizard au 1er lancement) -

function configView() {
  const groups = {};
  for (const s of SETTINGS_SCHEMA) {
    (groups[s.group] ||= []).push({
      ...s,
      value: configValue(s.key),
      isSet: s.secret ? isSecretSet(s.key) : undefined,
      overridden: isOverridden(s.key),
    });
  }
  return groups;
}

app.get('/admin/config', requireAdmin, (req, res) => {
  res.render('config', {
    config, groups: configView(), token: req.query.token || '',
    saved: req.query.saved === '1',
    hasPassword: hasAdminPassword(),
    configured: isControllerConfigured(),
  });
});

app.post('/admin/config', requireAdmin, (req, res) => {
  for (const s of SETTINGS_SCHEMA) {
    const v = req.body[s.key];
    if (v === undefined) continue;
    // Un secret laissé vide n'écrase pas la valeur existante.
    if (s.secret && v === '') continue;
    setConfig(s.key, v);
  }
  // Définition / changement du mot de passe admin (optionnel).
  if (req.body.admin_password) {
    setAdminPassword(req.body.admin_password);
    issueSession(req, res); // ouvre une session pour ne pas se verrouiller
  }
  reloadConfig();
  const token = req.body.token || req.query.token;
  res.redirect('/admin/config?saved=1' + (token ? '&token=' + encodeURIComponent(token) : ''));
});

// Tableau de bord admin : méthodes, durées par groupe et emails collectés.
app.get('/admin', requireAdmin, (req, res) => {
  // Première installation (rien de configuré) → page de configuration.
  if (!isControllerConfigured() && !hasAdminPassword()) {
    const token = req.query.token ? '?token=' + encodeURIComponent(req.query.token) : '';
    return res.redirect('/admin/config' + token);
  }
  res.render('admin', {
    config, stats: guestStats(), guests: allGuests(), methods: listMethods(),
    groupRules: listRules(), groupProviderIds, authMinutes: config.authMinutes,
    localUsers: listUsers(),
    saved: req.query.saved === '1',
    kicked: req.query.kicked || null,
    kickError: req.query.kick_error || null,
    token: req.query.token || '',
    hasPassword: hasAdminPassword(),
  });
});

// Déconnecte TOUS les invités : révoque toutes les autorisations actives.
// Pratique pour repartir d'une ardoise vierge (tests, fin de journée).
// Déclenchable aussi en SSH : curl -X POST "https://<portail>/admin/guests/unauthorize-all?token=ADMIN_TOKEN"
app.post('/admin/guests/unauthorize-all', requireAdmin, async (req, res) => {
  try {
    const { total, ok, failed } = await unauthorizeAllClients();
    const msg = `${ok}/${total} déconnecté(s)${failed ? `, ${failed} échec(s)` : ''}`;
    if (req.query.format === 'text') return res.type('text').send(msg + '\n');
    adminRedirect(req, res, { kicked: msg });
  } catch (err) {
    console.error('Échec de la déconnexion globale :', err.message);
    if (req.query.format === 'text') return res.status(500).type('text').send(err.message + '\n');
    adminRedirect(req, res, { kick_error: err.message });
  }
});

// Déconnecte un appareil : révoque son autorisation sur le contrôleur.
// Le portail captif se réaffichera à sa prochaine navigation.
app.post('/admin/guests/unauthorize', requireAdmin, async (req, res) => {
  const mac = (req.body.mac || '').trim();
  if (!mac) return adminRedirect(req, res, { kick_error: 'MAC manquante' });
  try {
    await unauthorizeClient(mac);
    adminRedirect(req, res, { kicked: mac });
  } catch (err) {
    console.error('Échec de la déconnexion :', err.message);
    adminRedirect(req, res, { kick_error: err.message });
  }
});

// Active/désactive les méthodes de connexion (cases cochées = activées).
app.post('/admin/methods', requireAdmin, (req, res) => {
  const checked = [].concat(req.body.method || []); // une seule case => string
  for (const m of listMethods()) {
    if (m.configured) setEnabled(m.id, checked.includes(m.id));
  }
  adminRedirect(req, res, { saved: '1' });
});

// Ajoute (ou met à jour) une règle de durée par groupe.
app.post('/admin/group-rules', requireAdmin, (req, res) => {
  addRule(req.body.provider, req.body.group_key, req.body.minutes);
  adminRedirect(req, res, { saved: '1' });
});

// Supprime une règle de durée par groupe.
app.post('/admin/group-rules/delete', requireAdmin, (req, res) => {
  removeRule(parseInt(req.body.id, 10));
  adminRedirect(req, res, { saved: '1' });
});

// Crée (ou met à jour) un compte local email + mot de passe.
app.post('/admin/local-users', requireAdmin, (req, res) => {
  addUser(req.body.email, req.body.password, req.body.minutes);
  adminRedirect(req, res, { saved: '1' });
});

// Supprime un compte local.
app.post('/admin/local-users/delete', requireAdmin, (req, res) => {
  removeUser(req.body.id);
  adminRedirect(req, res, { saved: '1' });
});

// Export CSV des emails collectés.
app.get('/admin/export.csv', requireAdmin, (req, res) => {
  const rows = allGuests();
  const header = 'id,email,name,method,mac,ap_mac,ssid,liked,created_at\n';
  const csv = rows
    .map((r) =>
      [r.id, r.email, r.name, r.method, r.mac, r.ap_mac, r.ssid, r.liked, r.created_at]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="guests.csv"');
  res.send(header + csv);
});

app.listen(config.port, () => {
  console.log(`Portail captif démarré sur http://0.0.0.0:${config.port}`);
});
