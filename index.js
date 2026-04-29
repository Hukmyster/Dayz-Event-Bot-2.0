const API_BASE = 'https://api.nitrado.net';

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const LOOP_TIME = 60 * 1000;

let visited = new Set();
let lastSeen = new Set();

/**
 * API CALL
 */
async function api(dir) {
    const url = `${API_BASE}/services/${SERVICE_ID}/gameservers/file_server/list?dir=${encodeURIComponent(dir)}`;

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: 'application/json'
        }
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || json?.status !== 'success') {
        throw new Error(`API error: ${res.status}`);
    }

    return json.data?.entries ?? [];
}

/**
 * RECURSIVE SCAN
 */
async function scan(dir, found = []) {
    if (visited.has(dir)) return found;
    visited.add(dir);

    let entries = [];

    try {
        entries = await api(dir);
    } catch (err) {
        console.log('❌ Failed dir:', dir);
        return found;
    }

    for (const entry of entries) {
        const name = (entry.name || '').toLowerCase();
        const path = entry.path || '';
        const type = entry.type;

        // FILE MATCH
        if (type === 'file') {
            if (name.endsWith('.adm') || name.endsWith('.rpt')) {
                found.push(path);
                console.log('🔥 FOUND:', path);
            }
        }

        // FOLDER RECURSION
        if (type === 'dir') {
            await scan(path, found);
        }
    }

    return found;
}

/**
 * MAIN LOOP
 */
async function run() {
    console.log('\n==============================');
    console.log('🔄 NEW LOOP → SCANNING FILES');
    console.log('==============================');

    visited = new Set();

    const logs = await scan('/');

    console.log('\n📊 TOTAL LOGS:', logs.length);

    const newFiles = logs.filter(f => !lastSeen.has(f));

    console.log('🆕 NEW FILES:', newFiles.length);

    for (const f of newFiles) {
        console.log('🆕', f);
    }

    lastSeen = new Set(logs);

    console.log('🔌 LOOP END');
}

/**
 * START BOT
 */
console.log('Bot starting (NODE FILE SCANNER)');
run();
setInterval(run, LOOP_TIME);
