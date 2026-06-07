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
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  },
  microsoft: {
    label: 'Microsoft 365',
    icon: 'M',
    scope: 'openid email profile',
    authorizeUrl: `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/token`,
    userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
  },
};

function buildProviders() {
  const out = {};
  for (const [id, def] of Object.entries(PROVIDER_DEFS)) {
    const up = id.toUpperCase();
    const clientId = process.env[`${up}_CLIENT_ID`] || '';
    const clientSecret = process.env[`${up}_CLIENT_SECRET`] || '';
    const redirectUri = process.env[`${up}_REDIRECT_URI`] || '';
    out[id] = {
      id,
      ...def,
      clientId,
      clientSecret,
      redirectUri,
      scope: process.env[`${up}_SCOPE`] || def.scope,
      // Activé si configuré et non désactivé explicitement (ENABLE_<ID>=false).
      enabled:
        Boolean(clientId && clientSecret && redirectUri) &&
        process.env[`ENABLE_${up}`] !== 'false',
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

  // Méthode email + like Facebook : activée sauf si ENABLE_EMAIL=false.
  emailEnabled: process.env.ENABLE_EMAIL !== 'false',
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

// Liste des fournisseurs OAuth actifs.
config.enabledProviders = Object.values(config.providers).filter((p) => p.enabled);
