const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";
const DEBUG = true;

function dbg(tag, data) {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? (typeof data === "object" ? JSON.stringify(data) : String(data)) : "";
  console.log(`[killfeed][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function warn(tag, data) {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? (typeof data === "object" ? JSON.stringify(data) : String(data)) : "";
  console.warn(`[killfeed][${ts}][WARN:${tag}]${dataStr ? " " + dataStr : ""}`);
}

async function nitradoRequest(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/json",
      ...(opts.headers || {})
    }
  });
  const text = await res.text().catch(() => "");
  dbg("http:response", { url, status: res.status, body: text.slice(0, 500) });
  if (!res.ok) throw new Error(`Nitrado HTTP ${res.status}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizePath(p) {
  const s = String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!s) return "/";
  return s.startsWith("/") ? s : `/${s}`;
}

async function fetchGameServerInfo() {
  const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers`;
  return await nitradoRequest(url);
}

function collectPrimaryCandidates(gameServerJson) {
  const gs = gameServerJson?.data?.gameserver || {};
  const username = gs?.username || "";
  const files = gs?.game_specific?.log_files || [];
  const candidates = [];

  for (const item of Array.isArray(files) ? files : []) {
    const raw = typeof item === "string" ? item : (item?.path || item?.file || item?.name || item?.filename || "");
    const base = String(raw || "").trim();
    if (!base) continue;
    candidates.push(base);
    const filename = base.split("/").pop();
    if (username) {
      candidates.push(`/games/${username}/noftp/${filename}`);
      candidates.push(`/games/${username}/noftp/${base.replace(/^\/+/, "")}`);
    }
  }

  return { username, paths: [...new Set(candidates.map(normalizePath))] };
}

async function getDownloadToken(filePath) {
  const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(filePath)}`;
  const json = await nitradoRequest(url);
  dbg("download:json", json);
  const tokenUrl = json?.data?.token?.url || null;
  const token = json?.data?.token?.token || null;
  dbg("download:parsed", { filePath, hasTokenUrl: !!tokenUrl, hasToken: !!token, tokenUrl });
  return { tokenUrl, token, raw: json };
}

async function fetchFileViaToken(tokenUrl, token) {
  const u = new URL(tokenUrl);
  if (token) u.searchParams.set("token", token);
  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/octet-stream,*/*"
    }
  });
  const text = await res.text().catch(() => "");
  dbg("token:response", { url: u.toString(), status: res.status, body: text.slice(0, 500) });
  if (!res.ok) throw new Error(`Token fetch HTTP ${res.status}`);
  return text;
}

async function main() {
  dbg("START", { serviceId: SERVICE_ID });
  const serverJson = await fetchGameServerInfo();
  const { username, paths } = collectPrimaryCandidates(serverJson);
  dbg("primary:paths", { username, count: paths.length, paths });

  for (const p of paths.slice(0, 3)) {
    try {
      dbg("candidate:start", { path: p });
      const { tokenUrl, token } = await getDownloadToken(p);
      if (!tokenUrl || !token) {
        warn("candidate:no-token", { path: p });
        continue;
      }
      const content = await fetchFileViaToken(tokenUrl, token);
      dbg("candidate:success", { path: p, bytes: content.length, preview: content.slice(0, 200) });
      break;
    } catch (err) {
      warn("candidate:failed", { path: p, error: err.message });
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
