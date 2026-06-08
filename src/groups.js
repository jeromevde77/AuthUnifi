import { config } from './config.js';
import {
  getGroupRules, listGroupRules, upsertGroupRule, deleteGroupRule,
  countGroupRules, getSetting, setSetting,
} from './db.js';

// Fournisseurs OAuth capables de fournir des groupes (ceux ayant un groupScope).
export const groupProviderIds = Object.values(config.providers)
  .filter((p) => p.groupScope)
  .map((p) => p.id);

// Amorçage unique : copie GROUP_DURATIONS (.env) dans la base au premier démarrage.
// Ensuite, la table est gérée depuis le panneau admin.
export function seedFromEnv() {
  if (getSetting('group_rules_seeded') === '1') return;
  for (const [provider, rules] of Object.entries(config.groupDurations)) {
    for (const [groupKey, minutes] of Object.entries(rules || {})) {
      if (typeof minutes === 'number') upsertGroupRule({ provider, groupKey, minutes });
    }
  }
  setSetting('group_rules_seeded', '1');
}

// Des règles existent-elles pour ce fournisseur ? (décide d'ajouter le scope groupes)
export function hasGroupRules(providerId) {
  return Object.keys(getGroupRules(providerId)).length > 0;
}

// Durée (minutes) selon les groupes : la plus longue l'emporte ; sinon défaut.
export function durationForGroups(providerId, groups) {
  const rules = getGroupRules(providerId);
  if (!groups || groups.length === 0) return config.authMinutes;

  let best = null;
  for (const g of groups) {
    const mins = rules[g];
    if (typeof mins === 'number' && (best === null || mins > best)) best = mins;
  }
  return best ?? config.authMinutes;
}

// --- Gestion depuis l'admin ---

export function listRules() {
  return listGroupRules();
}
export function addRule(provider, groupKey, minutes) {
  if (!groupProviderIds.includes(provider)) return false;
  const m = parseInt(minutes, 10);
  if (!groupKey || !Number.isFinite(m) || m <= 0) return false;
  upsertGroupRule({ provider, groupKey: groupKey.trim(), minutes: m });
  return true;
}
export function removeRule(id) {
  deleteGroupRule(id);
}
export { countGroupRules };
