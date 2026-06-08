import { config } from './config.js';

// Durée (minutes) pour un utilisateur selon ses groupes : la plus longue l'emporte.
// Retombe sur authMinutes si aucun groupe mappé ne correspond.
export function durationForGroups(providerId, groups) {
  const rules = config.groupDurations[providerId];
  if (!rules || !groups || groups.length === 0) return config.authMinutes;

  let best = null;
  for (const g of groups) {
    const mins = rules[g];
    if (typeof mins === 'number' && (best === null || mins > best)) best = mins;
  }
  return best ?? config.authMinutes;
}
