// modules/playerstats.js
const fs = require("fs");
const path = require("path");
const storage = require("../services/storage");

const STATS_DIR = "custom/server/playerstats";

/**
 * Normalize PSN for file name (no slashes, lowercase, safe path).
 */
function normalizePsn(psn) {
  return psn.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "_");
}

/**
 * Safely read a playerstats file, or return default empty object.
 */
async function readPlayerStats(psn) {
  const norm = normalizePsn(psn);
  const remotePath = `${STATS_DIR}/${norm}.json`;

  try {
    const data = await storage.loadJson(remotePath);
    // ensure required fields exist
    return {
      psn: norm,
      userId: data.userId || "notlinked",
      discordName: data.discordName || null,
      kills: data.kills || 0,
      deaths: data.deaths || 0,
      favoriteWeapon: data.favoriteWeapon || "unknown",
      maxPvpDistance: data.maxPvpDistance || 0.0,
      firstKillAt: data.firstKillAt || null,
      lastKillAt: data.lastKillAt || null,
      lastDeathAt: data.lastDeathAt || null
    };
  } catch (err) {
    // assume no file or corrupted; start fresh
    return {
      psn: norm,
      userId: "notlinked",
      discordName: null,
      kills: 0,
      deaths: 0,
      favoriteWeapon: "unknown",
      maxPvpDistance: 0.0,
      firstKillAt: null,
      lastKillAt: null,
      lastDeathAt: null
    };
  }
}

/**
 * Write a playerstats file back to Nitrado.
 */
async function writePlayerStats(stats) {
  const remotePath = `${STATS_DIR}/${stats.psn}.json`;
  const data = {
    psn: stats.psn,
    userId: stats.userId,
    discordName: stats.discordName,
    kills: stats.kills,
    deaths: stats.deaths,
    favoriteWeapon: stats.favoriteWeapon,
    maxPvpDistance: stats.maxPvpDistance,
    firstKillAt: stats.firstKillAt,
    lastKillAt: stats.lastKillAt,
    lastDeathAt: stats.lastDeathAt
  };
  await storage.saveJson(remotePath, data);
}

/**
 * Update a player's stats (kill or death).
 * Does NOT compute K/D; that is done in the command embed.
 */
async function updatePlayerStats(psn, isKiller, distance, weapon, timestamp) {
  const stats = await readPlayerStats(psn);

  if (isKiller) {
    stats.kills += 1;
    // update favorite weapon on first kill, or later if you want most‑used
    if (stats.kills === 1) {
      stats.favoriteWeapon = weapon;
    }
    if (distance > stats.maxPvpDistance) {
      stats.maxPvpDistance = distance;
    }
    if (!stats.firstKillAt) {
      stats.firstKillAt = timestamp;
    }
    stats.lastKillAt = timestamp;
  } else {
    stats.deaths += 1;
    stats.lastDeathAt = timestamp;
  }

  await writePlayerStats(stats);
}

/**
 * Handle one PvP event from killfeed.
 * event = {
 *   killerPsns: ["hukmyster", ...],
 *   victimPsns: ["verydarkwizard", ...],
 *   distance: 345.6,
 *   weapon: "mlock91",
 *   timestamp: "2026-05-12T..."
 * }
 */
async function recordPvpEvent(event) {
  const { killerPsns, victimPsns, distance, weapon, timestamp } = event;

  // process each killer PSN
  for (const psn of killerPsns) {
    const norm = normalizePsn(psn);
    await updatePlayerStats(norm, true, distance, weapon, timestamp);
  }

  // process each victim PSN
  for (const psn of victimPsns) {
    const norm = normalizePsn(psn);
    await updatePlayerStats(norm, false, distance, weapon, timestamp);
  }
}

/**
 * Fetch a player's stats for /playerstats command.
 * returns: full stats object + computed K/D.
 */
async function getPlayerStats(psn, userId = null) {
  const norm = normalizePsn(psn);
  const stats = await readPlayerStats(norm);

  // if userId is given, verify it matches
  if (userId && stats.userId !== "notlinked" && stats.userId !== userId) {
    return null; // stats for this PSN belong to another Discord
  }

  // compute K/D
  const kd =
    stats.deaths && stats.deaths > 0 ? stats.kills / stats.deaths : 0.0;

  return {
    ...stats,
    kd
  };
}

module.exports = {
  recordPvpEvent,   // called by killfeed
  getPlayerStats    // called by /playerstats command
};
