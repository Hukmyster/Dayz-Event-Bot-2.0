const API_BASE = 'https://api.nitrado.net';

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const LOOP_TIME = 60 * 1000;

let lastFile = null;
let lastSize = 0;

const TRIGGERS = {
    1: { type: "💻 Hacked Crate", location: "NEAF" },
    2: { type: "💻 Hacked Crate", location: "SWAF" },
    3: { type: "💻 Hacked Crate", location: "NWAF" },

    10: { type: "🧟 Horde", location: "Novo" },
    20: { type: "🪂 AirDrop", location: "NWAF" },
    23: { type: "🪂 AirDrop", location: "Pavlovo" }
};

async function api(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: 'application/json'
        }
    });

    return await res.json();
}

async function getLogs() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);
    return res.data.gameserver.game_specific.log_files || [];
}

/**
 * 🔥 NEW: direct file read (NO token.url)
 */
async function readFile(filePath) {
    const res = await api(
        `/services/${SERVICE_ID}/gameservers/file_server/read?file=${encodeURIComponent(filePath)}`
    );

    console.log('📦 READ RESPONSE:', JSON.stringify(res, null, 2));

    return res?.data?.content || null;
}

function getNewest(files, ext) {
    return files.filter(f => f.toLowerCase().endsWith(ext)).sort().pop();
}

function handleTrigger(line) {
    if (!line.includes('SpawnRandomLoot')) return;

    const match = line.match(/lootmax:\s*(\d+)/i);
    if (!match) return;

    const lootmax = parseInt(match[1]);

    console.log(`🎯 LOOTMAX → ${lootmax}`);

    const t = TRIGGERS[lootmax];

    if (!t) return;

    console.log(`🚨 ${t.type}`);
    console.log(`📍 ${t.location}`);
}

async function run() {
    console.log('\n==============================');
    console.log('🔄 LOOP START (NO DOWNLOAD MODE)');
    console.log('==============================');

    const files = await getLogs();
    const newest = getNewest(files, '.rpt');

    console.log('Latest:', newest);

    if (!newest) return;

    const content = await readFile(newest);

    if (!content) {
        console.log('❌ NO FILE CONTENT RETURNED');
        return;
    }

    const lines = content.split('\n');

    const newLines = lines.slice(lastSize);

    console.log(`[RPT] total=${lines.length} new=${newLines.length}`);

    for (const line of newLines) {
        console.log('🔥', line);
        handleTrigger(line);
    }

    lastSize = lines.length;

    console.log('🔌 LOOP END');
}

console.log('Bot starting (READ FILE MODE)');
run();
setInterval(run, LOOP_TIME);
