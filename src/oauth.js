import crypto from 'node:crypto';
import { config } from './config.js';

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

// --- Mapping du profil userinfo vers { email, name } selon le fournisseur ---

const USERINFO_MAP = {
  smartschool: (j) => ({
    email: j.email || null,
    name: j.fullname || [j.name, j.surname].filter(Boolean).join(' ').trim() || null,
  }),
  // Google et Microsoft (OIDC) renvoient des champs standard.
  google: (j) => ({ email: j.email || null, name: j.name || null }),
  microsoft: (j) => ({ email: j.email || j.preferred_username || null, name: j.name || null }),
};

// --- Flux OAuth2 générique ---

// Construit l'URL d'autorisation. `withGroups` ajoute le scope de lecture des
// groupes (requis quand des règles de durée par groupe existent).
export function buildAuthorizeUrl(provider, state, withGroups = false) {
  const scope = withGroups && provider.groupScope
    ? `${provider.scope} ${provider.groupScope}`
    : provider.scope;
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: 'code',
    scope,
    state,
  });
  return `${provider.authorizeUrl}?${params.toString()}`;
}

// Échange le code d'autorisation contre un access token.
async function exchangeCode(provider, code) {
  const res = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: provider.redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Échec de l'échange du code (${res.status})`);
  const json = await res.json();
  if (!json.access_token) throw new Error('access_token absent de la réponse');
  return json.access_token;
}

// Récupère le profil utilisateur (token en en-tête Bearer + en query pour SmartSchool).
async function fetchUserinfo(provider, accessToken) {
  const url = `${provider.userinfoUrl}?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Échec de la récupération du profil (${res.status})`);
  return res.json();
}

// Récupère les groupes de l'utilisateur (identifiants à matcher contre GROUP_DURATIONS).
// Renvoie un tableau de chaînes (GUID + nom pour MS, email + nom pour Google).
async function fetchGroups(provider, accessToken, email) {
  if (provider.id === 'microsoft') {
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName',
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`Graph memberOf a échoué (${res.status})`);
    const json = await res.json();
    return (json.value || []).flatMap((g) => [g.id, g.displayName].filter(Boolean));
  }
  if (provider.id === 'google') {
    const query = encodeURIComponent(`member_key_id == '${email}'`);
    const res = await fetch(
      `https://cloudidentity.googleapis.com/v1/groups/-/memberships:searchTransitiveGroups?query=${query}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`Cloud Identity a échoué (${res.status})`);
    const json = await res.json();
    return (json.memberships || []).flatMap((m) =>
      [m.groupKey?.id, m.displayName].filter(Boolean)
    );
  }
  if (provider.id === 'smartschool') {
    const url = `${provider.groupinfoUrl}?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`groupinfo SmartSchool a échoué (${res.status})`);
    const json = await res.json();
    // Format non documenté : on aplatit les entrées et on extrait les identifiants
    // lisibles (name/code/desc) pour pouvoir les matcher.
    const entries = Array.isArray(json)
      ? json
      : Object.values(json || {}).flat().filter((x) => x && typeof x === 'object');
    return entries.flatMap((g) => [g.name, g.code, g.desc].filter((v) => typeof v === 'string'));
  }
  return [];
}

// Traite le retour OAuth : renvoie { email, name, groups } normalisés.
// `withGroups` déclenche la récupération des groupes (durées par groupe activées).
export async function handleCallback(provider, code, withGroups = false) {
  const accessToken = await exchangeCode(provider, code);
  const info = await fetchUserinfo(provider, accessToken);
  const map = USERINFO_MAP[provider.id] || ((j) => ({ email: j.email || null, name: j.name || null }));
  const { email, name } = map(info);

  let groups = [];
  if (withGroups) {
    try {
      groups = await fetchGroups(provider, accessToken, email);
    } catch (err) {
      // Ne bloque pas la connexion : on retombera sur la durée par défaut.
      console.error(`Lecture des groupes ${provider.id} échouée :`, err.message);
    }
  }
  return { email, name, groups };
}
