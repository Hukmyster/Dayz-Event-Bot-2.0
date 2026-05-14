const storage = require("../services/storage");

function normalizePsn(psn) {
  return String(psn || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, "_");
}

function defaultStats(psn) {
  return {
    psn: normalizePsn(psn),
    userId: "notlinked",
    discordName: null,
    kills: 0,
    deaths: 0,
    favoriteWeapon: "unknown",
    maxPvpDistance: 0,
    firstKillAt: null,
    lastKillAt: null,
    lastDeathAt: null
  };
}

function mergeStats(base, incoming = {}) {
  return {
    ...defaultStats(base.psn || incoming.psn),
    ...base,
    ...incoming,
    psn: normalizePsn(base.psn || incoming.psn),
    userId: incoming.userId ?? base.userId ?? "notlinked",
    discordName: incoming.discordName ?? base.discordName ?? null,
    kills: Number(incoming.kills ?? base.kills ?? 0),
    deaths: Number(incoming.deaths ?? base.deaths ?? 0),
    favoriteWeapon: incoming.favoriteWeapon ?? base.favoriteWeapon ?? "unknown",
    maxPvpDistance: Number(incoming.maxPvpDistance ?? base.maxPvpDistance ?? 0),
    firstKillAt: incoming.firstKillAt ?? base.firstKillAt ?? null,
    lastKillAt: incoming.lastKillAt ?? base.lastKillAt ?? null,
    lastDeathAt: incoming.lastDeathAt ?? base.lastDeathAt ?? null
  };
}

async function readPlayerStats(psn) {
  const norm = normalizePsn(psn);
  const data = await storage.loadJson(`playerstats/${norm}.json`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return defaultStats(norm);
  }
  return mergeStats(defaultStats(norm), data);
}

async function writePlayerStats(stats) {
  const normalized = mergeStats(defaultStats(stats.psn), stats);
  await storage.saveJson(`playerstats/${normalized.psn}.json`, normalized);
  return normalized;
}

async function updatePlayerStats(psn, isKiller, distance, weapon, timestamp) {
  const stats = await readPlayerStats(psn);
  const dist = Number(distance || 0);
  const time = timestamp || new Date().toISOString();

  if (isKiller) {
    stats.kills += 1;
    if (stats.kills === 1) {
      stats.favoriteWeapon = weapon || "unknown";
    }
    if (dist > stats.maxPvpDistance) {
      stats.maxPvpDistance = dist;
    }
    if (!stats.firstKillAt) {
      stats.firstKillAt = time;
    }
    stats.lastKillAt = time;
  } else {
    stats.deaths += 1;
    stats.lastDeathAt = time;
  }

  await writePlayerStats(stats);
  return stats;
}

async function recordPvpEvent(event) {
  const killerPsns = Array.isArray(event?.killerPsns) ? event.killerPsns : [];
  const victimPsns = Array.isArray(event?.victimPsns) ? event.victimPsns : [];
  const distance = event?.distance ?? 0;
  const weapon = event?.weapon || "unknown";
  const timestamp = event?.timestamp || new Date().toISOString();

  for (const psn of killerPsns) {
    const norm = normalizePsn(psn);
    if (!norm) continue;
    await updatePlayerStats(norm, true, distance, weapon, timestamp);
  }

  for (const psn of victimPsns) {
    const norm = normalizePsn(psn);
    if (!norm) continue;
    await updatePlayerStats(norm, false, distance, weapon, timestamp);
  }
}

async function getPlayerStats(psn, userId = null) {
  const norm = normalizePsn(psn);
  const stats = await readPlayerStats(norm);

  if (userId && stats.userId !== "notlinked" && String(stats.userId) !== String(userId)) {
    return null;
  }

  const kd = stats.deaths > 0 ? stats.kills / stats.deaths : stats.kills > 0 ? stats.kills : 0;

  return {
    ...stats,
    kd
  };
}

async function linkPsn(psn, discordId, discordName) {
  const stats = await readPlayerStats(psn);
  stats.userId = String(discordId);
  stats.discordName = discordName || null;
  await writePlayerStats(stats);
  return stats;
}

module.exports = {
  recordPvpEvent,
  getPlayerStats,
  linkPsn,
  normalizePsn,
  readPlayerStats,
  writePlayerStats
};
