const storage = require("../services/storage");

const STATS_DIR = "custom/server/playerstats";

function normalizePsn(psn) {
  return String(psn || "").trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "_");
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

async function readPlayerStats(psn) {
  const norm = normalizePsn(psn);
  const remotePath = `${STATS_DIR}/${norm}.json`;

  try {
    const data = await storage.loadJson(remotePath);
    if (!data || typeof data !== "object") return defaultStats(norm);

    return {
      ...defaultStats(norm),
      ...data,
      psn: norm,
      userId: data.userId ?? "notlinked",
      discordName: data.discordName ?? null,
      kills: Number(data.kills ?? 0),
      deaths: Number(data.deaths ?? 0),
      favoriteWeapon: data.favoriteWeapon ?? "unknown",
      maxPvpDistance: Number(data.maxPvpDistance ?? 0),
      firstKillAt: data.firstKillAt ?? null,
      lastKillAt: data.lastKillAt ?? null,
      lastDeathAt: data.lastDeathAt ?? null
    };
  } catch {
    return defaultStats(norm);
  }
}

async function writePlayerStats(stats) {
  const normalized = {
    psn: normalizePsn(stats.psn),
    userId: stats.userId ?? "notlinked",
    discordName: stats.discordName ?? null,
    kills: Number(stats.kills ?? 0),
    deaths: Number(stats.deaths ?? 0),
    favoriteWeapon: stats.favoriteWeapon ?? "unknown",
    maxPvpDistance: Number(stats.maxPvpDistance ?? 0),
    firstKillAt: stats.firstKillAt ?? null,
    lastKillAt: stats.lastKillAt ?? null,
    lastDeathAt: stats.lastDeathAt ?? null
  };

  await storage.saveJson(`${STATS_DIR}/${normalized.psn}.json`, normalized);
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

  if (userId && stats.userId !== "notlinked" && stats.userId !== userId) {
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

async function getLinkedPsnByDiscordId(discordId) {
  const target = String(discordId);
  const list = await storage.loadJson(STATS_DIR).catch(() => null);
  if (Array.isArray(list)) return null;
  return null;
}

module.exports = {
  recordPvpEvent,
  getPlayerStats,
  linkPsn,
  getLinkedPsnByDiscordId,
  normalizePsn
};
