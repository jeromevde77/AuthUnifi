import { Controller } from 'node-unifi';
import { config } from './config.js';

/**
 * Autorise un appareil invité sur le contrôleur UniFi.
 * Le contrôleur ouvre alors l'accès Internet pour cette adresse MAC.
 *
 * @param {string} mac    Adresse MAC du client (paramètre `id` envoyé par UniFi)
 * @param {string} [apMac] Adresse MAC du point d'accès (paramètre `ap`)
 * @param {number} [minutes] Durée d'autorisation (défaut : config.authMinutes)
 */
export async function authorizeGuest(mac, apMac, minutes = config.authMinutes) {
  const controller = new Controller({
    host: config.unifi.host,
    port: config.unifi.port,
    username: config.unifi.username,
    password: config.unifi.password,
    site: config.unifi.site,
    sslverify: config.unifi.sslverify,
  });

  await controller.login();
  try {
    // authorizeGuest(mac, minutes, up, down, megabytes, ap_mac)
    await controller.authorizeGuest(mac, minutes, undefined, undefined, undefined, apMac);
  } finally {
    await controller.logout().catch(() => {});
  }
}
