import crypto from 'node:crypto';
import { config } from './config.js';

const ss = config.smartschool;

// --- État OAuth signé (anti-CSRF + transport des paramètres UniFi) ---

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function signState(payload) {
  const data = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyState(state) {
  if (!state || !state.includes('.')) return null;
  const [data, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString());
  } catch {
    return null;
  }
}

// --- Flux OAuth2 SmartSchool ---

// Construit l'URL vers laquelle rediriger l'utilisateur pour se connecter.
export function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: ss.clientId,
    redirect_uri: ss.redirectUri,
    response_type: 'code',
    scope: ss.scope,
    state,
  });
  return `${ss.authorizeUrl}?${params.toString()}`;
}

// Échange le code d'autorisation contre un access token.
async function exchangeCode(code) {
  const res = await fetch(ss.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: ss.clientId,
      client_secret: ss.clientSecret,
      redirect_uri: ss.redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Échec de l'échange du code (${res.status})`);
  const json = await res.json();
  if (!json.access_token) throw new Error('access_token absent de la réponse');
  return json.access_token;
}

// Récupère le profil utilisateur SmartSchool.
async function fetchUserinfo(accessToken) {
  const url = `${ss.userinfoUrl}?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Échec de la récupération du profil (${res.status})`);
  return res.json();
}

// Traite le retour OAuth : renvoie { email, name } du profil SmartSchool.
export async function handleCallback(code) {
  const accessToken = await exchangeCode(code);
  const info = await fetchUserinfo(accessToken);
  const fullName =
    info.fullname || [info.name, info.surname].filter(Boolean).join(' ').trim() || null;
  return { email: info.email || null, name: fullName };
}
