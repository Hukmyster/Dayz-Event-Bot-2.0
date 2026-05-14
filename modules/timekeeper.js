const TIMEZONE = "America/Los_Angeles";

function getPartsInTZ(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short"
  }).formatToParts(date);

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday
  };
}

function getModeForRun(date = new Date()) {
  const parts = getPartsInTZ(date, TIMEZONE);

  if (parts.weekday === "Fri" && parts.hour === 17 && parts.minute === 58) {
    return "weekend";
  }

  if (parts.weekday === "Sun" && parts.hour === 20 && parts.minute === 58) {
    return "weekday";
  }

  return null;
}

function isModeSwitchRun(date = new Date()) {
  return getModeForRun(date) !== null;
}

module.exports = {
  TIMEZONE,
  getModeForRun,
  isModeSwitchRun
};
