import { config } from './config.js';
import { getSetting, setSetting } from './db.js';

// Méthode email (intégrée, sans identifiants à configurer).
const EMAIL_META = { id: 'email', label: 'Email + Facebook', icon: '✉️', href: '/login' };

// Tous les identifiants de méthodes : email + fournisseurs OAuth.
const ALL_IDS = ['email', ...Object.keys(config.providers)];

function meta(id) {
  if (id === 'email') return EMAIL_META;
  const p = config.providers[id];
  return { id, label: p.label, icon: p.icon, href: `/auth/${id}` };
}

// Une méthode est "configurée" si elle peut fonctionner (email : toujours ;
// fournisseur : identifiants présents).
function isConfigured(id) {
  return id === 'email' ? true : Boolean(config.providers[id]?.configured);
}

function envDefault(id) {
  return id === 'email' ? config.emailEnvEnabled : Boolean(config.providers[id]?.envEnabled);
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
