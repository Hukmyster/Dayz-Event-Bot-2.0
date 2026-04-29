const API_BASE = 'https://api.nitrado.net';

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const LOOP_TIME = 60 * 1000;

let visited = new Set();

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
        console.log('❌ API FAIL:', dir, '| STATUS:', res.status);
        return [];
    }

    return json.data?.entries ?? [];
}

/**
 * RECURSIVE PATH FINDER
 */
async function scan(dir, depth = 0) {
    if (visited.has(dir)) return;
    visited.add(dir);

    let entries = [];

    try {
        entries = await api(dir);
    } catch (err) {
        console.log('❌ ERROR DIR:', dir);
        return;
    }

    const indent = '  '.repeat(depth);

    console.log(`\n📂 DIR: ${dir}`);
    console.log(`   Entries: ${entries.length}`);

    for (const entry of entries) {
        const name = entry.name || '';
        const path = entry.path || '';
        const type = entry.type;

        if (type === 'dir') {
            console.log(`${indent}📁 ${path}`);
            await scan(path, depth + 1);
        }

        if (type === 'file') {
            console.log(`${indent}📄 ${path}`);

            const lower = name.toLowerCase();

            if (lower.endsWith('.adm') || lower.endsWith('.rpt')) {
                console.log(`${indent}🔥 LOG FILE FOUND → ${path}`);
            }
        }
    }
}

/**
 * MAIN LOOP
 */
async function run() {
    console.log('\n==============================');
    console.log('🔍 FULL API PATH SCAN');
    console.log('==============================');

    visited = new Set();

    await scan('/');

    console.log('\n==============================');
    console.log('✅ SCAN COMPLETE');
    console.log('==============================');
}

/**
 * START
 */
console.log('Bot starting (API PATH FINDER MODE)');
run();

// Only run once per minute (like you wanted)
setInterval(run, LOOP_TIME);
