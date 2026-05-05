const DEFAULT_SCALE = 0.9999998807907105;

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value, fallback = "") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function buildObjectEntry(item = {}) {
  return {
    name: normalizeText(item.name || item.type || item.classname),
    pos: [
      normalizeNumber(item.x),
      normalizeNumber(item.y),
      normalizeNumber(item.z)
    ],
    ypr: [
      normalizeNumber(item.yaw),
      normalizeNumber(item.pitch),
      normalizeNumber(item.roll)
    ],
    scale: normalizeNumber(item.scale, DEFAULT_SCALE),
    enableCEPersistency: Number.isFinite(Number(item.enableCEPersistency)) ? Number(item.enableCEPersistency) : 0,
    customString: normalizeText(item.customString, "")
  };
}

function buildJsonFile(entries = []) {
  return {
    Objects: entries.map(buildObjectEntry)
  };
}

function buildSingleEntry(item = {}) {
  return buildJsonFile([item]);
}

function stackEntries(...groups) {
  const entries = [];
  for (const group of groups) {
    if (Array.isArray(group)) entries.push(...group);
    else if (group && typeof group === "object") entries.push(group);
  }
  return buildJsonFile(entries);
}

module.exports = {
  DEFAULT_SCALE,
  buildObjectEntry,
  buildJsonFile,
  buildSingleEntry,
  stackEntries
};
