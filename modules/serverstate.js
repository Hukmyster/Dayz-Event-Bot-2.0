const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";
const LOOP_MS = Number(process.env.SERVERSTATE_INTERNAL_MS || 30000);
const DEBUG_ENABLED = String(process.env.SERVERSTATE_DEBUG || "false").toLowerCase() === "true";
const MAX_FILES = 5;

const state = {
  started: false,
  timer: null,
  running: false,
  startedAt: new Date().toISOString(),
  username: "",
  fileState: new Map(),
  files: new Map()
};

function dbg(tag, data) {
  if (!DEBUG_ENABLED) return;
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? JSON.stringify(data) : "";
  console.log(`[serverstate][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function normalizePath(p) {
  const s = String(p || "").replace(/\\\\/g, "/").replace(/\\/+/g, "/");
  if (!s) return "/";
  return s.startsWith("/") ? s : `/${s}`;
}

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
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
  if (!res.ok) throw new Error(`Nitrado HTTP ${res.status}: ${text.slice(0, 250)}`);
  return JSON.parse(text);
}

async function fetchServerInfo() {
  return await nitradoRequest(`https://api.nitrado.net/services/${SERVICE_ID}/gameservers`);
}

function parseLogTimestamp(filename) {
  const m = String(filename || "").match(/_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) || 0;
}

function collectCandidates(serverJson) {
  const gs = serverJson?.data?.gameserver || {};
  const username = gs?.username || "";
  const files = gs?.game_specific?.log_files || [];
  const list = [];

  for (const item of Array.isArray(files) ? files : []) {
    const raw = typeof item === "string" ? item : (item?.path || item?.file || item?.name || item?.filename || "");
    const base = String(raw || "").trim();
    if (!base) continue;
    const filename = base.split("/").pop();
    if (!/\.(adm|rpt)$/i.test(filename)) continue;

    list.push({
      filename,
      sortKey: parseLogTimestamp(filename),
      candidates: [
        `/games/${username}/noftp/dayzps/config/${filename}`,
        `/games/${username}/noftp/${base.replace(/^\/+/, "")}`,
        base
      ]
    });
  }

  list.sort((a, b) => b.sortKey - a.sortKey || a.filename.localeCompare(b.filename));
  const chosen = list.slice(0, MAX_FILES);
  const paths = [...new Set(chosen.flatMap(x => x.candidates).map(normalizePath))];

  dbg("CANDIDATES", { username, paths });

  return { username, paths };
}

async function getDownloadToken(filePath) {
  const json = await nitradoRequest(`https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(filePath)}`);
  const tokenUrl = json?.data?.token?.url || null;
  const token = json?.data?.token?.token || null;
  return { tokenUrl, token };
}

async function fetchFile(tokenUrl, token) {
  const u = new URL(tokenUrl);
  if (token) u.searchParams.set("token", token);
  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/octet-stream,*/*"
    }
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Token fetch HTTP ${res.status}: ${text.slice(0, 250)}`);
  return text;
}

function candidateReadPaths(originalPath, username) {
  const filename = String(originalPath || "").split("/").pop();
  return [...new Set([
    `/games/${username}/noftp/dayzps/config/${filename}`,
    `/games/${username}/noftp/${filename}`,
    normalizePath(originalPath)
  ])];
}

async function readRemoteFile(remotePath, username) {
  const candidates = candidateReadPaths(remotePath, username);
  dbg("READ_TRY", { remotePath, candidates });

  for (const candidate of candidates) {
    try {
      const { tokenUrl, token } = await getDownloadToken(candidate);
      if (!tokenUrl || !token) throw new Error("No token returned");
      const content = await fetchFile(tokenUrl, token);
      dbg("READ_OK", { remotePath, candidate, bytes: content.length });
      return { pathUsed: candidate, content };
    } catch (err) {
      dbg("READ_FAIL", { remotePath, candidate, error: err?.message || String(err) });
    }
  }

  throw new Error(`All read attempts failed for ${remotePath}`);
}

function fingerprint(content) {
  const lines = content.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  return {
    lineCount: lines.length,
    firstLine: normalizeLine(lines[0] || ""),
    lastLine: normalizeLine(lines[lines.length - 1] || "")
  };
}

async function loopOnce() {
  dbg("loop:start", { loopMs: LOOP_MS });
  if (state.running) {
    dbg("loop:end", { skipped: true });
    return;
  }

  state.running = true;
  try {
    const serverJson = await fetchServerInfo();
    const { username, paths } = collectCandidates(serverJson);
    state.username = username;

    const nextFiles = new Map();

    for (const remotePath of paths) {
      try {
        const result = await readRemoteFile(remotePath, username);
        const current = fingerprint(result.content);
        const previous = state.fileState.get(remotePath) || { lineCount: 0, lastLine: "" };
        nextFiles.set(remotePath, {
          path: remotePath,
          pathUsed: result.pathUsed,
          content: result.content,
          current,
          previous
        });
        state.fileState.set(remotePath, {
          lineCount: current.lineCount,
          lastLine: current.lastLine
        });
        dbg("FILE_READY", { remotePath, bytes: result.content.length });
      } catch (err) {
        console.log("[SERVERSTATE][READ_ERROR]", JSON.stringify({
          file: remotePath,
          error: err?.message || String(err)
        }));
      }
    }

    state.files = nextFiles;
    dbg("FILES_READY", { count: state.files.size });
  } finally {
    state.running = false;
    dbg("loop:end", {});
  }
}

function start() {
  if (state.started) return;
  state.started = true;
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

function getFiles() {
  return [...state.files.values()].map(x => ({ ...x }));
}

function getFileContent(filePath) {
  return state.files.get(filePath)?.content || "";
}

function getFileState(filePath) {
  return state.fileState.get(filePath) || { lineCount: 0, lastLine: "" };
}

module.exports = { start, stop, state, getFiles, getFileContent, getFileState };
