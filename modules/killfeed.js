const { getFiles, start: startServerState } = require("./serverstate");
const playerstats = require("./playerstats");

const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";
const LOOP_MS = Number(process.env.KILLFEED_INTERNAL_MS || 30000);
const DEBUG_ENABLED = String(process.env.KILLFEED_DEBUG || "false").toLowerCase() === "true";

const EXPLOSIVE_KILLERS = new Set([
  "6-M7 Frag Grenade",
  "LandMineTrap",
  "Land Mine",
  "Grenade",
  "M67 Grenade"
]);

const state = {
  started: false,
  timer: null,
  running: false,
  startedAt: new Date().toISOString(),
  username: "",
  fileState: new Map(),
  sentEventIds: new Set()
};

function logLoop(tag, data) {
  if (!DEBUG_ENABLED) return;
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? JSON.stringify(data) : "";
  console.log(`[killfeed][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function debugLog(tag, data) {
  if (!DEBUG_ENABLED) return;
  console.log(`[KILLFEED][${tag}]`, data);
}

function errorLog(tag, data) {
  console.log(`[KILLFEED][${tag}]`, data);
}

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
}

function cleanVictim(name) {
  const n = String(name || "").trim();
  return n ? n : "NPC";
}

function cleanKillerName(name) {
  const n = String(name || "").trim();
  return n ? n : "Unknown";
}

function isExplosiveKiller(killer) {
  return EXPLOSIVE_KILLERS.has(cleanKillerName(killer));
}

function extractLocation(line) {
  const m = line.match(/pos=<([^>]+)>/i);
  if (!m) return "";
  const parts = m[1].split(",").map(s => s.trim());
  if (parts.length < 2) return "";
  return `${parts[0]}, ${parts[1]}`;
}

function izurviveLinkFromLocation(location) {
  const parts = String(location || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (parts.length < 2) return location || "Unknown";

  const x = parts[0];
  const y = parts[1];
  const label = `${x}, ${y}`;
  return `[${label}](https://www.izurvive.com/chernarusplussatmap/#location=${x};${y};8)`;
}

function parseKillLine(line) {
  if (!line.includes("killed by")) return null;

  const timeMatch = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)\s*\|\s*/);
  const victimMatch = line.match(/Player\s+"([^"]*)"\s+\(DEAD\)/i);

  const playerKillMatch = line.match(
    /killed by\s+Player\s+"([^"]*)"\s+\(id=.*?\)\s+with\s+(.+?)\s+from\s+([0-9.]+)\s+meters/i
  );

  const explosiveKillMatch = line.match(
    /killed by\s+(LandMineTrap|Land Mine|6-M7 Frag Grenade|Grenade|M67 Grenade)\s*$/i
  );

  const location = extractLocation(line);

  if (playerKillMatch) {
    const killer = cleanKillerName(playerKillMatch[1]);
    return {
      time: timeMatch ? timeMatch[1] : "unknown",
      victim: cleanVictim(victimMatch?.[1] || ""),
      killer,
      weapon: playerKillMatch[2].trim(),
      distance: playerKillMatch[3],
      location: "",
      explosive: isExplosiveKiller(killer),
      raw: line
    };
  }

  if (explosiveKillMatch) {
    const killer = cleanKillerName(explosiveKillMatch[1]);
    return {
      time: timeMatch ? timeMatch[1] : "unknown",
      victim: cleanVictim(victimMatch?.[1] || ""),
      killer,
      weapon: "",
      distance: "",
      location,
      explosive: true,
      raw: line
    };
  }

  return null;
}

function buildEventId(fileName, evt) {
  return [fileName, evt.time, evt.victim, evt.killer, evt.weapon, evt.distance, evt.location, evt.raw].join("|");
}

function formatEmbed(evt) {
  const fields = [
    { name: "Victim", value: evt.victim || "NPC", inline: true },
    { name: "Killer", value: evt.killer || "Unknown", inline: true }
  ];

  if (!evt.explosive) {
    fields.push({ name: "Weapon", value: evt.weapon || "Unknown", inline: true });
    fields.push({ name: "Distance", value: `${evt.distance || "0"}m`, inline: true });
  } else {
    if (evt.location) fields.push({ name: "Location", value: izurviveLinkFromLocation(evt.location), inline: true });
  }

  fields.push({ name: "Time", value: evt.time || "unknown", inline: true });

  return {
    title: "💀 KILL CONFIRMED",
    color: 0xc0392b,
    fields
  };
}

async function postWebhook(evt) {
  if (!WEBHOOK_URL) {
    errorLog("WEBHOOK_SKIP", { reason: "missing WEBHOOK_URL" });
    return;
  }

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [formatEmbed(evt)] })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook HTTP ${res.status}: ${text.slice(0, 250)}`);
  }
}

async function loopOnce() {
  logLoop("loop:start", { loopMs: LOOP_MS });
  if (state.running) {
    logLoop("loop:end", { skipped: true });
    return;
  }

  state.running = true;
  try {
    const files = getFiles();
    let newEvents = 0;

    for (const file of files) {
      if (!/\.adm$/i.test(file.path || "")) continue;
      const lines = String(file.content || "").split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
      const previous = state.fileState.get(file.path) || { lineCount: 0, lastLine: "" };
      const currentLineCount = lines.length;
      let startIndex = 0;

      if (currentLineCount >= previous.lineCount && previous.lineCount > 0) {
        startIndex = previous.lineCount;
      }

      debugLog("FILE_STATE", { remotePath: file.path, current: file.current || { lineCount: currentLineCount, firstLine: "", lastLine: "" }, previous, startIndex });

      const events = [];
      for (let i = startIndex; i < lines.length; i++) {
        const line = normalizeLine(lines[i]);
        if (!line.includes("killed by")) continue;

        const evt = parseKillLine(line);
        if (!evt) continue;

        const eventId = buildEventId(file.path.split("/").pop() || file.path, evt);
        const duplicate = state.sentEventIds.has(eventId);

        debugLog("MATCH", {
          file: file.path,
          line,
          parsed: evt,
          duplicate
        });

        if (duplicate) continue;

        state.sentEventIds.add(eventId);
        events.push(evt);
      }

      state.fileState.set(file.path, {
        lineCount: currentLineCount,
        lastLine: normalizeLine(lines[lines.length - 1] || "")
      });

      debugLog("EVENTS_FOUND", { remotePath: file.path, count: events.length });

      for (const evt of events) {
        newEvents++;

        await postWebhook(evt);

        await playerstats.recordPvpEvent({
          killerPsns: evt.killer && evt.killer !== "NPC" && evt.killer !== "Unknown" ? [evt.killer] : [],
          victimPsns: evt.victim && evt.victim !== "NPC" ? [evt.victim] : [],
          distance: Number(evt.distance || 0),
          weapon: evt.weapon || "unknown",
          timestamp: new Date().toISOString()
        });
      }
    }

    logLoop("new:events", { count: newEvents });
  } finally {
    state.running = false;
    logLoop("loop:end", {});
  }
}

function start() {
  if (state.started) return;
  state.started = true;
  startServerState();
  loopOnce().catch(() => {});
  state.timer = setInterval(() => {
    loopOnce().catch(() => {});
  }, LOOP_MS);
}

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
  state.started = false;
}

module.exports = { start, stop, state };
