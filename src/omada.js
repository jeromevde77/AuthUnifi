import https from 'node:https';
import { config } from './config.js';

const o = config.omada;
const base = () => `https://${o.host}:${o.port}/${o.controllerId}/api/v2/hotspot`;

// POST JSON via le module https intégré (gère le certificat auto-signé OC200/OC300).
function postJson(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        rejectUnauthorized: o.sslVerify,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...extraHeaders,
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          let json = {};
          try { json = JSON.parse(chunks); } catch { /* réponse non JSON */ }
          resolve({ headers: res.headers, json });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Autorise un client invité sur le contrôleur Omada (v5.0.15+ / OC200 / OC300).
 * 1) login avec un compte « opérateur » → token CSRF + cookie de session
 * 2) extPortal/auth avec les infos du client (authType 4 = portail externe)
 *
 * @param {{clientMac:string, apMac?:string, ssid?:string, radioId?:string, site?:string}} params
 * @param {number} minutes Durée d'autorisation
 */
export async function authorize(params, minutes) {
  // 1) Connexion de l'opérateur.
  const login = await postJson(`${base()}/login`, {
    name: o.operator,
    password: o.operatorPassword,
  });
  if (login.json.errorCode !== 0) {
    throw new Error(`Omada login: ${login.json.msg || login.json.errorCode}`);
  }
  const token = login.json.result?.token;
  const cookie = (login.headers['set-cookie'] || [])
    .map((c) => c.split(';')[0])
    .join('; ');

  // 2) Autorisation du client (variante EAP/Wi-Fi).
  const auth = await postJson(
    `${base()}/extPortal/auth`,
    {
      clientMac: params.clientMac,
      apMac: params.apMac,
      ssidName: params.ssid,
      radioId: params.radioId != null && params.radioId !== '' ? Number(params.radioId) : undefined,
      site: params.site,
      time: minutes * 60 * 1000, // Omada attend des millisecondes
      authType: 4, // 4 = External Portal Server
    },
    { 'Csrf-Token': token, Cookie: cookie }
  );
  if (auth.json.errorCode !== 0) {
    throw new Error(`Omada auth: ${auth.json.msg || auth.json.errorCode}`);
  }
}
