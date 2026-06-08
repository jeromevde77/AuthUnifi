import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  }
  return value;
}

// Définitions des fournisseurs OAuth disponibles. Les endpoints sont fixes ;
// les identifiants viennent de l'environnement (<ID>_CLIENT_ID, etc.).
const msTenant = process.env.MICROSOFT_TENANT || 'common';
const PROVIDER_DEFS = {
  smartschool: {
    label: 'Compte SmartSchool',
    icon: '🎓',
    scope: 'userinfo',
    authorizeUrl: 'https://oauth.smartschool.be/OAuth',
    tokenUrl: 'https://oauth.smartschool.be/OAuth/index/token',
    userinfoUrl: 'https://oauth.smartschool.be/Api/V1/userinfo',
  },
  google: {
    label: 'Google',
    icon: 'G',
    scope: 'openid email profile',
    // Scope supplémentaire requis pour lire les groupes (si GROUP_DURATIONS défini).
    groupScope: 'https://www.googleapis.com/auth/cloud-identity.groups.readonly',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  },
  microsoft: {
    label: 'Microsoft 365',
    icon: 'M',
    scope: 'openid email profile',
    // Scope supplémentaire requis pour lire les groupes (consentement admin).
    groupScope: 'GroupMember.Read.All',
    authorizeUrl: `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/token`,
    userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
  },
};

// Correspondance groupe → durée (minutes) par fournisseur, depuis GROUP_DURATIONS (JSON).
// Ex. {"google":{"profs@ecole.be":10080},"microsoft":{"<guid>":10080}}
function parseGroupDurations() {
  const raw = process.env.GROUP_DURATIONS;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('GROUP_DURATIONS doit être un JSON valide (voir .env.example)');
  }
}
const groupDurations = parseGroupDurations();

function buildProviders() {
  const out = {};
  for (const [id, def] of Object.entries(PROVIDER_DEFS)) {
    const up = id.toUpperCase();
    const clientId = process.env[`${up}_CLIENT_ID`] || '';
    const clientSecret = process.env[`${up}_CLIENT_SECRET`] || '';
    const redirectUri = process.env[`${up}_REDIRECT_URI`] || '';
    const configured = Boolean(clientId && clientSecret && redirectUri);
    // Des règles de durée par groupe sont-elles définies pour ce fournisseur ?
    const useGroups = Boolean(def.groupScope && groupDurations[id]);
    let scope = process.env[`${up}_SCOPE`] || def.scope;
    if (useGroups) scope = `${scope} ${def.groupScope}`;
    out[id] = {
      id,
      ...def,
      clientId,
      clientSecret,
      redirectUri,
      scope,
      useGroups,
      // Identifiants présents ?
      configured,
      // État par défaut (.env) : configuré et non désactivé via ENABLE_<ID>=false.
      // Peut être surchargé à chaud depuis le panneau admin.
      envEnabled: configured && process.env[`ENABLE_${up}`] !== 'false',
    };
  }
  return out;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  unifi: {
    host: required('UNIFI_HOST'),
    port: parseInt(process.env.UNIFI_PORT || '443', 10),
    username: required('UNIFI_USERNAME'),
    password: required('UNIFI_PASSWORD'),
    site: process.env.UNIFI_SITE || 'default',
    sslverify: process.env.UNIFI_SSL_VERIFY === 'true',
  },

  authMinutes: parseInt(process.env.AUTH_MINUTES || '480', 10),

  // Durées spécifiques selon le groupe (par fournisseur). {} si non utilisé.
  groupDurations,

  // Méthode email + like Facebook : état par défaut (surchargeable depuis l'admin).
  emailEnvEnabled: process.env.ENABLE_EMAIL !== 'false',
  facebookPageUrl: process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com',

  // Fournisseurs OAuth (SmartSchool, Google, Microsoft 365).
  providers: buildProviders(),

  // Secret pour signer l'état OAuth (anti-CSRF). Par défaut : ADMIN_TOKEN.
  sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || 'changeme',

  portalName: process.env.PORTAL_NAME || 'Wifi Invité',
  portalLogoUrl: process.env.PORTAL_LOGO_URL || '',

  adminUser: process.env.ADMIN_USER || 'admin',
  adminToken: process.env.ADMIN_TOKEN || '',

  // Nombre de proxies de confiance devant l'app (reverse-proxy HTTPS).
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),
};
