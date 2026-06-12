import { Controller } from 'node-unifi';
import { config } from './config.js';

/**
 * Autorise un appareil invité sur le contrôleur UniFi.
 *
 * @param {{clientMac: string, apMac?: string}} params Paramètres normalisés
 * @param {number} minutes Durée d'autorisation
 */
export async function authorize(params, minutes) {
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
    await controller.authorizeGuest(
      params.clientMac, minutes, undefined, undefined, undefined, params.apMac
    );
  } finally {
    await controller.logout().catch(() => {});
  }
}

/**
 * Révoque l'autorisation d'un appareil invité (le portail captif se réaffichera).
 *
 * @param {string} mac Adresse MAC du client
 */
export async function unauthorize(mac) {
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
    await controller.unauthorizeGuest(mac);
    // Kick immédiat (kick-sta) : force la déconnexion WiFi sans attendre.
    // Best-effort : si l'appareil n'est plus connecté, on ignore l'échec.
    await controller.reconnectClient(mac).catch(() => {});
  } finally {
    await controller.logout().catch(() => {});
  }
}

/**
 * Dé-autorise TOUS les invités actuellement autorisés (déconnexion globale).
 *
 * @returns {Promise<{total:number, ok:number, failed:number}>}
 */
export async function unauthorizeAll() {
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
    const guests = await controller.getGuests();
    const macs = [...new Set((guests || []).map((g) => g.mac).filter(Boolean))];
    let ok = 0;
    let failed = 0;
    for (const mac of macs) {
      try {
        await controller.unauthorizeGuest(mac);
        await controller.reconnectClient(mac).catch(() => {}); // kick immédiat best-effort
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    return { total: macs.length, ok, failed };
  } finally {
    await controller.logout().catch(() => {});
  }
}
