import { config } from './config.js';
import { getSetting, setSetting, countLocalUsers } from './db.js';

// Méthodes intégrées (sans identifiants OAuth à configurer).
const EMAIL_META = { id: 'email', label: 'Email + Facebook', icon: '/static/icons/facebook.svg', href: '/login' };
const LOCAL_META = { id: 'local', label: 'Compte (email + mot de passe)', icon: '/static/icons/account.svg', href: '/local' };

// Tous les identifiants de méthodes : intégrées + fournisseurs OAuth.
const ALL_IDS = ['email', 'local', ...Object.keys(config.providers)];

function meta(id) {
  if (id === 'email') return EMAIL_META;
  if (id === 'local') return LOCAL_META;
  const p = config.providers[id];
  return { id, label: p.label, icon: p.icon, href: `/auth/${id}` };
}

// Une méthode est "configurée" si elle peut fonctionner (email : toujours ;
// compte local : au moins un compte créé ; fournisseur : identifiants présents).
function isConfigured(id) {
  if (id === 'email') return true;
  if (id === 'local') return countLocalUsers() > 0;
  return Boolean(config.providers[id]?.configured);
}

function envDefault(id) {
  if (id === 'email') return config.emailEnvEnabled;
  if (id === 'local') return config.localEnvEnabled;
  return Boolean(config.providers[id]?.envEnabled);
}

// Activation effective : override admin (base) sinon défaut .env. Jamais si non configurée.
export function isEnabled(id) {
  if (!isConfigured(id)) return false;
  const override = getSetting(`method_${id}_enabled`);
  if (override === '1') return true;
  if (override === '0') return false;
  return envDefault(id);
}

// Met à jour l'activation d'une méthode (ignoré si non configurée).
export function setEnabled(id, value) {
  if (!isConfigured(id)) return;
  setSetting(`method_${id}_enabled`, value ? '1' : '0');
}

// Toutes les méthodes connues, avec leur état (pour le panneau admin).
export function listMethods() {
  return ALL_IDS.map((id) => ({
    ...meta(id),
    configured: isConfigured(id),
    enabled: isEnabled(id),
  }));
}

// Méthodes actuellement actives (pour la page de choix / les redirections).
export function enabledMethods() {
  return listMethods().filter((m) => m.enabled);
}
