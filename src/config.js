import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  }
  return value;
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

  facebookPageUrl: process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com',

  // OAuth SmartSchool : activé automatiquement si client id/secret sont fournis.
  smartschool: {
    clientId: process.env.SMARTSCHOOL_CLIENT_ID || '',
    clientSecret: process.env.SMARTSCHOOL_CLIENT_SECRET || '',
    // URL de callback publique (HTTPS) déclarée auprès de SmartSchool.
    redirectUri: process.env.SMARTSCHOOL_REDIRECT_URI || '',
    scope: process.env.SMARTSCHOOL_SCOPE || 'userinfo',
    authorizeUrl: 'https://oauth.smartschool.be/OAuth',
    tokenUrl: 'https://oauth.smartschool.be/OAuth/index/token',
    userinfoUrl: 'https://oauth.smartschool.be/Api/V1/userinfo',
  },

  // Secret pour signer l'état OAuth (anti-CSRF). Par défaut : ADMIN_TOKEN.
  sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || 'changeme',

  portalName: process.env.PORTAL_NAME || 'Wifi Invité',
  portalLogoUrl: process.env.PORTAL_LOGO_URL || '',

  adminUser: process.env.ADMIN_USER || 'admin',
  adminToken: process.env.ADMIN_TOKEN || '',

  // Nombre de proxies de confiance devant l'app (reverse-proxy HTTPS).
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),
};

config.smartschool.enabled = Boolean(
  config.smartschool.clientId &&
  config.smartschool.clientSecret &&
  config.smartschool.redirectUri
);
