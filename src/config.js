import 'dotenv/config';
import { getSetting, setSetting } from './db.js';
import { encrypt, decrypt } from './secrets.js';

// --- Schéma des réglages configurables ---------------------------------------
// Chaque réglage est résolu dans l'ordre : valeur en base (cfg_<key>) > .env > défaut.
// `secret: true` => stocké chiffré en base. `group` sert au regroupement dans
// la page de configuration / le wizard. Les méthodes (activation), comptes locaux
// et durées par groupe restent gérés ailleurs (déjà en base).
export const SETTINGS_SCHEMA = [
  { key: 'controller_type', env: 'CONTROLLER_TYPE', def: 'unifi', group: 'controller', label: 'Type de contrôleur', type: 'select', options: ['unifi', 'omada'] },

  { key: 'unifi_host', env: 'UNIFI_HOST', def: '', group: 'unifi', label: 'Hôte UniFi' },
  { key: 'unifi_port', env: 'UNIFI_PORT', def: '443', group: 'unifi', label: 'Port', type: 'number' },
  { key: 'unifi_username', env: 'UNIFI_USERNAME', def: '', group: 'unifi', label: 'Utilisateur' },
  { key: 'unifi_password', env: 'UNIFI_PASSWORD', def: '', group: 'unifi', label: 'Mot de passe', secret: true },
  { key: 'unifi_site', env: 'UNIFI_SITE', def: 'default', group: 'unifi', label: 'Site' },
  { key: 'unifi_ssl_verify', env: 'UNIFI_SSL_VERIFY', def: 'false', group: 'unifi', label: 'Vérifier le certificat TLS', type: 'bool' },

  { key: 'omada_host', env: 'OMADA_HOST', def: '', group: 'omada', label: 'Hôte Omada' },
  { key: 'omada_port', env: 'OMADA_PORT', def: '443', group: 'omada', label: 'Port', type: 'number' },
  { key: 'omada_controller_id', env: 'OMADA_CONTROLLER_ID', def: '', group: 'omada', label: 'Controller ID' },
  { key: 'omada_operator_user', env: 'OMADA_OPERATOR_USER', def: '', group: 'omada', label: 'Opérateur' },
  { key: 'omada_operator_password', env: 'OMADA_OPERATOR_PASSWORD', def: '', group: 'omada', label: 'Mot de passe opérateur', secret: true },
  { key: 'omada_ssl_verify', env: 'OMADA_SSL_VERIFY', def: 'false', group: 'omada', label: 'Vérifier le certificat TLS', type: 'bool' },

  { key: 'auth_minutes', env: 'AUTH_MINUTES', def: '480', group: 'portal', label: "Durée d'accès (minutes)", type: 'number' },
  { key: 'facebook_page_url', env: 'FACEBOOK_PAGE_URL', def: 'https://www.facebook.com', group: 'portal', label: 'URL page Facebook' },
  { key: 'portal_name', env: 'PORTAL_NAME', def: 'Wifi Invité', group: 'portal', label: 'Nom du portail' },
  { key: 'portal_logo_url', env: 'PORTAL_LOGO_URL', def: '', group: 'portal', label: 'URL du logo' },
  { key: 'trust_proxy', env: 'TRUST_PROXY', def: '0', group: 'portal', label: 'Proxies de confiance', type: 'number' },

  { key: 'portal_welcome_title', env: 'PORTAL_WELCOME_TITLE', def: '', group: 'appearance', label: "Titre d'accueil", hint: 'Par défaut : le nom du portail.' },
  { key: 'portal_welcome_text', env: 'PORTAL_WELCOME_TEXT', def: '', group: 'appearance', label: "Message d'accueil" },
  { key: 'portal_primary_color', env: 'PORTAL_PRIMARY_COLOR', def: '#1877f2', group: 'appearance', label: 'Couleur principale', type: 'color' },
  { key: 'portal_bg_color', env: 'PORTAL_BG_COLOR', def: '#f0f2f5', group: 'appearance', label: 'Couleur de fond', type: 'color' },
  { key: 'portal_bg_image_url', env: 'PORTAL_BG_IMAGE_URL', def: '', group: 'appearance', label: 'Image de fond (URL)', hint: "Recouvre la couleur de fond si renseignée." },
  { key: 'portal_custom_css', env: 'PORTAL_CUSTOM_CSS', def: '', group: 'appearance', label: 'CSS personnalisé', type: 'textarea', hint: 'Pour les utilisateurs avancés. Injecté tel quel dans les pages du portail.' },

  { key: 'smartschool_client_id', env: 'SMARTSCHOOL_CLIENT_ID', def: '', group: 'smartschool', label: 'Client ID' },
  { key: 'smartschool_client_secret', env: 'SMARTSCHOOL_CLIENT_SECRET', def: '', group: 'smartschool', label: 'Client secret', secret: true },
  { key: 'smartschool_redirect_uri', env: 'SMARTSCHOOL_REDIRECT_URI', def: '', group: 'smartschool', label: 'Redirect URI' },
  { key: 'smartschool_base_url', env: 'SMARTSCHOOL_BASE_URL', def: 'https://oauth.smartschool.be', group: 'smartschool', label: 'Plateforme SmartSchool' },
  { key: 'smartschool_scope', env: 'SMARTSCHOOL_SCOPE', def: 'userinfo', group: 'smartschool', label: 'Scope' },

  { key: 'google_client_id', env: 'GOOGLE_CLIENT_ID', def: '', group: 'google', label: 'Client ID' },
  { key: 'google_client_secret', env: 'GOOGLE_CLIENT_SECRET', def: '', group: 'google', label: 'Client secret', secret: true },
  { key: 'google_redirect_uri', env: 'GOOGLE_REDIRECT_URI', def: '', group: 'google', label: 'Redirect URI' },

  { key: 'microsoft_client_id', env: 'MICROSOFT_CLIENT_ID', def: '', group: 'microsoft', label: 'Client ID' },
  { key: 'microsoft_client_secret', env: 'MICROSOFT_CLIENT_SECRET', def: '', group: 'microsoft', label: 'Client secret', secret: true },
  { key: 'microsoft_redirect_uri', env: 'MICROSOFT_REDIRECT_URI', def: '', group: 'microsoft', label: 'Redirect URI' },
  { key: 'microsoft_tenant', env: 'MICROSOFT_TENANT', def: 'common', group: 'microsoft', label: 'Tenant' },
];

const byKey = Object.fromEntries(SETTINGS_SCHEMA.map((s) => [s.key, s]));

// Résout une valeur : base (cfg_<key>) > .env > défaut.
function get(key) {
  const s = byKey[key];
  if (!s) return undefined;
  const raw = getSetting('cfg_' + key);
  if (raw != null && raw !== '') return s.secret ? decrypt(raw) : raw;
  const env = process.env[s.env];
  if (env != null && env !== '') return env;
  return s.def;
}

// La valeur vient-elle de la base (true) ou du .env/défaut (false) ?
export function isOverridden(key) {
  const raw = getSetting('cfg_' + key);
  return raw != null && raw !== '';
}

// Écrit un réglage en base (chiffré si secret). Vide => supprime l'override
// (retour au .env/défaut).
export function setConfig(key, value) {
  const s = byKey[key];
  if (!s) throw new Error(`Réglage inconnu : ${key}`);
  const v = value == null ? '' : String(value);
  if (v === '') {
    setSetting('cfg_' + key, '');
    return;
  }
  setSetting('cfg_' + key, s.secret ? encrypt(v) : v);
}

// Valeur effective d'un réglage non-secret (pour pré-remplir la page de config).
// Les secrets ne sont jamais renvoyés (on n'expose pas leur valeur).
export function configValue(key) {
  const s = byKey[key];
  if (!s || s.secret) return '';
  return get(key) ?? '';
}

// Un secret a-t-il une valeur définie (base ou .env) ? (sans la révéler)
export function isSecretSet(key) {
  const s = byKey[key];
  if (!s || !s.secret) return false;
  return Boolean(get(key));
}

const asBool = (v) => v === 'true' || v === true;
const asInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

// Assombrit une couleur hexa (#rrggbb) pour l'état survol des boutons.
const darken = (hex, f = 0.85) => {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * f));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};

const PROVIDER_DEFS = {
  smartschool: {
    label: 'Compte SmartSchool',
    icon: '/static/icons/smartschool.svg',
    scope: 'userinfo',
    groupScope: 'groupinfo',
  },
  google: {
    label: 'Google',
    icon: '/static/icons/google.svg',
    scope: 'openid email profile',
    groupScope: 'https://www.googleapis.com/auth/cloud-identity.groups.readonly',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  },
  microsoft: {
    label: 'Microsoft 365',
    icon: '/static/icons/microsoft.svg',
    scope: 'openid email profile',
    groupScope: 'GroupMember.Read.All',
    userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
  },
};

// Endpoints dépendant de réglages (plateforme SmartSchool, tenant Microsoft).
function providerEndpoints(id) {
  if (id === 'smartschool') {
    const base = (get('smartschool_base_url') || 'https://oauth.smartschool.be').replace(/\/+$/, '');
    return {
      authorizeUrl: `${base}/OAuth`,
      tokenUrl: `${base}/OAuth/index/token`,
      userinfoUrl: `${base}/Api/V1/userinfo`,
      groupinfoUrl: `${base}/Api/V1/groupinfo`,
    };
  }
  if (id === 'microsoft') {
    const tenant = get('microsoft_tenant') || 'common';
    return {
      authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    };
  }
  return {};
}

function parseGroupDurations() {
  const raw = process.env.GROUP_DURATIONS;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('GROUP_DURATIONS doit être un JSON valide (voir .env.example)');
  }
}

function buildProviders() {
  const out = {};
  for (const [id, def] of Object.entries(PROVIDER_DEFS)) {
    const up = id.toUpperCase();
    const clientId = get(`${id}_client_id`);
    const clientSecret = get(`${id}_client_secret`);
    const redirectUri = get(`${id}_redirect_uri`);
    const configured = Boolean(clientId && clientSecret && redirectUri);
    out[id] = {
      id,
      ...def,
      ...providerEndpoints(id),
      clientId,
      clientSecret,
      redirectUri,
      scope: get(`${id}_scope`) || def.scope,
      configured,
      envEnabled: configured && process.env[`ENABLE_${up}`] !== 'false',
    };
  }
  return out;
}

function buildConfig() {
  return {
    port: asInt(process.env.PORT || '3000', 3000),
    controllerType: (get('controller_type') || 'unifi').toLowerCase(),

    unifi: {
      host: get('unifi_host'),
      port: asInt(get('unifi_port'), 443),
      username: get('unifi_username'),
      password: get('unifi_password'),
      site: get('unifi_site') || 'default',
      sslverify: asBool(get('unifi_ssl_verify')),
    },

    omada: {
      host: get('omada_host'),
      port: asInt(get('omada_port'), 443),
      controllerId: get('omada_controller_id'),
      operator: get('omada_operator_user'),
      operatorPassword: get('omada_operator_password'),
      sslVerify: asBool(get('omada_ssl_verify')),
    },

    authMinutes: asInt(get('auth_minutes'), 480),
    groupDurations: parseGroupDurations(),

    emailEnvEnabled: process.env.ENABLE_EMAIL !== 'false',
    localEnvEnabled: process.env.ENABLE_LOCAL !== 'false',
    facebookPageUrl: get('facebook_page_url') || 'https://www.facebook.com',

    providers: buildProviders(),

    sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || 'changeme',

    portalName: get('portal_name') || 'Wifi Invité',
    portalLogoUrl: get('portal_logo_url') || '',
    portalWelcomeTitle: get('portal_welcome_title') || '',
    portalWelcomeText: get('portal_welcome_text') || '',
    portalPrimaryColor: get('portal_primary_color') || '#1877f2',
    portalPrimaryColorDark: darken(get('portal_primary_color') || '#1877f2'),
    portalBgColor: get('portal_bg_color') || '#f0f2f5',
    portalBgImageUrl: get('portal_bg_image_url') || '',
    portalCustomCss: get('portal_custom_css') || '',

    adminUser: process.env.ADMIN_USER || 'admin',
    adminToken: process.env.ADMIN_TOKEN || '',

    trustProxy: asInt(get('trust_proxy'), 0),
  };
}

export const config = buildConfig();

// Recharge la config depuis la base/.env en MUTANT l'objet existant en place,
// pour que les modules ayant capturé config.unifi / config.providers[x] voient
// la mise à jour sans redémarrage.
export function reloadConfig() {
  const next = buildConfig();
  Object.assign(config.unifi, next.unifi);
  Object.assign(config.omada, next.omada);
  for (const id of Object.keys(next.providers)) {
    if (config.providers[id]) Object.assign(config.providers[id], next.providers[id]);
    else config.providers[id] = next.providers[id];
  }
  config.controllerType = next.controllerType;
  config.authMinutes = next.authMinutes;
  config.facebookPageUrl = next.facebookPageUrl;
  config.portalName = next.portalName;
  config.portalLogoUrl = next.portalLogoUrl;
  config.portalWelcomeTitle = next.portalWelcomeTitle;
  config.portalWelcomeText = next.portalWelcomeText;
  config.portalPrimaryColor = next.portalPrimaryColor;
  config.portalPrimaryColorDark = next.portalPrimaryColorDark;
  config.portalBgColor = next.portalBgColor;
  config.portalBgImageUrl = next.portalBgImageUrl;
  config.portalCustomCss = next.portalCustomCss;
  config.trustProxy = next.trustProxy;
  return config;
}

// Le contrôleur sélectionné est-il configuré (suffisant pour autoriser) ?
export function isControllerConfigured() {
  if (config.controllerType === 'omada') {
    return Boolean(config.omada.host && config.omada.controllerId && config.omada.operator && config.omada.operatorPassword);
  }
  return Boolean(config.unifi.host && config.unifi.username && config.unifi.password);
}
