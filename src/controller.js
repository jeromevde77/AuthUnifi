import { config } from './config.js';
import * as unifi from './unifi.js';
import * as omada from './omada.js';

const impl = config.controllerType === 'omada' ? omada : unifi;

// Autorise le client sur le contrôleur sélectionné (UniFi ou Omada).
export function authorizeClient(params, minutes) {
  return impl.authorize(params, minutes);
}

// Révoque l'autorisation d'un client (déconnexion forcée depuis l'admin).
export function unauthorizeClient(mac) {
  if (!impl.unauthorize) {
    throw new Error(`Déconnexion non supportée pour le contrôleur ${config.controllerType}`);
  }
  return impl.unauthorize(mac);
}

// Dé-autorise tous les invités actuellement autorisés (déconnexion globale).
export function unauthorizeAllClients() {
  if (!impl.unauthorizeAll) {
    throw new Error(`Déconnexion globale non supportée pour le contrôleur ${config.controllerType}`);
  }
  return impl.unauthorizeAll();
}

// Liste les MAC des invités actuellement autorisés sur le contrôleur.
// Renvoie null si le contrôleur ne le supporte pas (ex. Omada).
export function activeGuestMacs() {
  if (!impl.activeGuests) return null;
  return impl.activeGuests();
}

// Traduit les paramètres de redirection du contrôleur vers un format normalisé.
// Appelé uniquement sur le premier hop (le contrôleur redirige vers "/").
export function extractParams(q) {
  if (config.controllerType === 'omada') {
    return {
      clientMac: q.clientMac,
      apMac: q.apMac,
      ssid: q.ssidName,
      radioId: q.radioId,
      site: q.site,
      redirectUrl: q.redirectUrl,
      t: q.t,
    };
  }
  // UniFi
  return {
    clientMac: q.id,
    apMac: q.ap,
    ssid: q.ssid,
    radioId: undefined,
    site: undefined,
    redirectUrl: q.url,
    t: q.t,
  };
}
