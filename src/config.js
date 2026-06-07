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

  portalName: process.env.PORTAL_NAME || 'Wifi Invité',
  portalLogoUrl: process.env.PORTAL_LOGO_URL || '',

  adminUser: process.env.ADMIN_USER || 'admin',
  adminToken: process.env.ADMIN_TOKEN || '',

  // Nombre de proxies de confiance devant l'app (reverse-proxy HTTPS).
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),
};
