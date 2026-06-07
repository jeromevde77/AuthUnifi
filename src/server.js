import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { recordGuest, allGuests } from './db.js';
import { authorizeGuest } from './unifi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('view engine', 'ejs');
app.set('views', join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(join(__dirname, '..', 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Page du portail : UniFi redirige ici avec id, ap, t, url, ssid en query.
app.get('/', (req, res) => {
  const { id, ap, t, url, ssid } = req.query;
  res.render('login', {
    config,
    params: { id, ap, t, url, ssid },
    error: null,
  });
});

// Soumission : valide, enregistre l'email, autorise l'invité sur UniFi.
app.post('/authorize', async (req, res) => {
  const { email, liked, id, ap, t, url, ssid } = req.body;
  const params = { id, ap, t, url, ssid };

  const renderError = (message) =>
    res.status(400).render('login', { config, params, error: message });

  if (!email || !EMAIL_RE.test(email)) {
    return renderError('Veuillez saisir une adresse email valide.');
  }
  if (liked !== 'on') {
    return renderError('Veuillez confirmer que vous avez liké notre page Facebook.');
  }

  recordGuest({ email, mac: id, apMac: ap, ssid, liked: true });

  if (!id) {
    // Pas de MAC : on ne peut pas autoriser via UniFi (ex. test hors hotspot).
    return res.render('success', { config, authorized: false, redirectUrl: url });
  }

  try {
    await authorizeGuest(id, ap);
    res.render('success', { config, authorized: true, redirectUrl: url });
  } catch (err) {
    console.error('Échec de l\'autorisation UniFi :', err.message);
    renderError("Une erreur est survenue lors de la connexion. Merci de réessayer.");
  }
});

// Export CSV des emails collectés, protégé par un jeton.
app.get('/admin/export.csv', (req, res) => {
  if (!config.adminToken || req.query.token !== config.adminToken) {
    return res.status(403).send('Accès refusé');
  }
  const rows = allGuests();
  const header = 'id,email,mac,ap_mac,ssid,liked,created_at\n';
  const csv = rows
    .map((r) =>
      [r.id, r.email, r.mac, r.ap_mac, r.ssid, r.liked, r.created_at]
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
