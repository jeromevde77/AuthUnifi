import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { recordGuest, allGuests, guestStats } from './db.js';
import { authorizeGuest } from './unifi.js';
import { signState, verifyState, buildAuthorizeUrl, handleCallback } from './oauth.js';
import { enabledMethods, isEnabled, listMethods, setEnabled } from './methods.js';
import { durationForGroups } from './duration.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

app.set('view engine', 'ejs');
app.set('views', join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(join(__dirname, '..', 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pickParams = (src) => ({
  id: src.id,
  ap: src.ap,
  t: src.t,
  url: src.url,
  ssid: src.ssid,
});

const buildQs = (params) =>
  new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString();

// Affiche le formulaire email (le lien « retour » n'apparaît que s'il existe un choix).
const renderLogin = (res, { params, error = null, status = 200 }) =>
  res.status(status).render('login', {
    config, params, error, showBack: enabledMethods().length > 1,
  });

// Enregistre l'invité, l'autorise sur UniFi puis affiche la page de succès.
async function finishLogin(res, { params, email, name, method, liked, minutes, onError }) {
  recordGuest({ email, name, method, mac: params.id, apMac: params.ap, ssid: params.ssid, liked });

  if (!params.id) {
    // Pas de MAC : on ne peut pas autoriser via UniFi (ex. test hors hotspot).
    return res.render('success', { config, authorized: false, redirectUrl: params.url });
  }
  try {
    await authorizeGuest(params.id, params.ap, minutes);
    res.render('success', { config, authorized: true, redirectUrl: params.url });
  } catch (err) {
    console.error("Échec de l'autorisation UniFi :", err.message);
    onError("Une erreur est survenue lors de la connexion. Merci de réessayer.");
  }
}

// Page du portail : UniFi redirige ici avec id, ap, t, url, ssid en query.
// Affiche le choix des méthodes activées ; redirige si une seule est activée.
app.get('/', (req, res) => {
  const params = pickParams(req.query);
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

// --- Connexion via fournisseur OAuth2 (SmartSchool, Google, Microsoft 365) ---

// Redirige vers le fournisseur, en embarquant les paramètres UniFi dans l'état signé.
app.get('/auth/:provider', (req, res) => {
  const provider = config.providers[req.params.provider];
  if (!provider || !isEnabled(provider.id)) return res.status(404).send('Fournisseur non disponible');
  const state = signState({ ...pickParams(req.query), n: crypto.randomBytes(8).toString('hex') });
  res.redirect(buildAuthorizeUrl(provider, state));
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
    const { email, name, groups } = await handleCallback(provider, req.query.code);
    const minutes = durationForGroups(provider.id, groups);
    await finishLogin(res, {
      params, email, name, method: provider.id, liked: false, minutes, onError: renderError,
    });
  } catch (err) {
    console.error(`Échec OAuth ${provider.id} :`, err.message);
    renderError('La connexion a échoué. Réessayez.');
  }
});

// Protège les routes admin : Basic Auth (admin:ADMIN_TOKEN) ou ?token=ADMIN_TOKEN.
function requireAdmin(req, res, next) {
  if (!config.adminToken) {
    return res.status(503).send('Admin désactivé : définissez ADMIN_TOKEN.');
  }
  if (req.query.token === config.adminToken) return next();

  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === config.adminUser && pass === config.adminToken) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="AuthUnifi Admin"');
  return res.status(401).send('Authentification requise');
}

// Tableau de bord admin : méthodes de connexion + emails collectés.
app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin', {
    config, stats: guestStats(), guests: allGuests(), methods: listMethods(),
    saved: req.query.saved === '1',
  });
});

// Active/désactive les méthodes de connexion (cases cochées = activées).
app.post('/admin/methods', requireAdmin, (req, res) => {
  const checked = [].concat(req.body.method || []); // une seule case => string
  for (const m of listMethods()) {
    if (m.configured) setEnabled(m.id, checked.includes(m.id));
  }
  res.redirect('/admin?saved=1');
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
