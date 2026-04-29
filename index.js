const API_BASE = 'https://api.nitrado.net';

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const LOOP_TIME = 60 * 1000;

let lastFile = null;
let lastSize = 0;

/**
 * =========================
 * 🔥 EXACT LOOTMAX MAPPING
 * =========================
 */

const TRIGGERS = {
    // HACKED CRATES
    1: { type: "💻 Hacked Crate", location: "NEAF", coords: "12326 12445" },
    2: { type: "💻 Hacked Crate", location: "SWAF", coords: "5049 2440" },
    3: { type: "💻 Hacked Crate", location: "NWAF", coords: "4704 9823" },

    // HORDES
    4: { type: "🧟 Horde", location: "Cherno West" },
    5: { type: "🧟 Horde", location: "Cherno East" },
    6: { type: "🧟 Horde", location: "Berezino West" },
    7: { type: "🧟 Horde", location: "Berezino East" },
    8: { type: "🧟 Horde", location: "Electro" },
    9: { type: "🧟 Horde", location: "Svet" },
    10:{ type: "🧟 Horde", location: "Novo" },
    11:{ type: "🧟 Horde", location: "Severograd" },
    12:{ type: "🧟 Horde", location: "Novaya" },
    13:{ type: "🧟 Horde", location: "Lopatino" },
    14:{ type: "🧟 Horde", location: "Pustoshka" },
    15:{ type: "🧟 Horde", location: "Pavlovo" },

    // AIRDROPS
    16:{ type: "🪂 AirDrop", location: "VMC" },
    17:{ type: "🪂 AirDrop", location: "Altar" },
    18:{ type: "🪂 AirDrop", location: "Kamensk" },
    19:{ type: "🪂 AirDrop", location: "Tisy" },
    20:{ type: "🪂 AirDrop", location: "NWAF" },
    21:{ type: "🪂 AirDrop", location: "NEAF" },
    22:{ type: "🪂 AirDrop", location: "Balota" },
    23:{ type: "🪂 AirDrop", location: "Pavlovo" },
    24:{ type: "🪂 AirDrop", location: "Green Mountain" },
    25:{ type: "🪂 AirDrop", location: "Myshkino" }
};

/**
 * =========================
 * API
 * =========================
 */
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

function getNewest(files, ext) {
    return files
        .filter(f => f.toLowerCase().endsWith(ext))
        .sort()
        .pop();
}

async function download(filePath) {
    const res = await api(
        `/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(filePath)}`
    );

    const url = res.data.token.url;
    const fileRes = await fetch(url);
    return await fileRes.text();
}

/**
 * =========================
 * TRIGGER ENGINE
 * =========================
 */
function handleTrigger(line) {
    if (!line.includes('SpawnRandomLoot')) return;

    const match = line.match(/lootmax:\s*(\d+)/i);
    if (!match) return;

    const lootmax = parseInt(match[1]);

    console.log(`🎯 LOOTMAX → ${lootmax}`);

    const trigger = TRIGGERS[lootmax];

    if (!trigger) {
        console.log(`⚠️ UNKNOWN LOOTMAX: ${lootmax}`);
        return;
    }

    console.log(`🚨 EVENT: ${trigger.type}`);
    console.log(`📍 LOCATION: ${trigger.location}`);

    if (trigger.coords) {
        console.log(`🧭 COORDS: ${trigger.coords}`);
    }
}

/**
 * =========================
 * MAIN LOOP
 * =========================
 */
async function run() {
    console.log('\n==============================');
    console.log('🔄 NEW LOOP');
    console.log('==============================');

    const files = await getLogs();
    const newest = getNewest(files, '.rpt');

    console.log('Latest:', newest);

    if (!newest) return;

    if (newest !== lastFile) {
        console.log('🆕 NEW FILE:', newest);
        lastFile = newest;
        lastSize = 0;
    }

    const content = await download(newest);
    const lines = content.split('\n');

    const newLines = lines.slice(lastSize);

    console.log(`[RPT] total: ${lines.length} | new: ${newLines.length}`);

    for (const line of newLines) {
        if (!line.trim()) continue;

        console.log('🔥', line);
        handleTrigger(line);
    }

    lastSize = lines.length;

    console.log('🔌 LOOP END');
}

/**
 * =========================
 * START
 * =========================
 */
console.log('Bot starting (EXACT LOOTMAX SYSTEM)');
run();
setInterval(run, LOOP_TIME);
