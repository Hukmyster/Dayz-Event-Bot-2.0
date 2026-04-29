const API_BASE = 'https://api.nitrado.net';

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

/**
 * BASIC API CALL
 */
async function api(path) {
    const url = `${API_BASE}${path}`;

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: 'application/json'
        }
    });

    const text = await res.text();
    let json;

    try {
        json = JSON.parse(text);
    } catch {
        json = null;
    }

    return {
        status: res.status,
        ok: res.ok,
        json,
        raw: text
    };
}

/**
 * =========================
 * FILE READER (NEW STEP)
 * =========================
 * Attempts download endpoint safely
 */
async function readFile(filePath) {
    const res = await api(
        `/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(filePath)}`
    );

    const tokenUrl = res.json?.data?.token?.url;

    if (!tokenUrl) {
        console.log(`⚠️ NO READ ACCESS: ${filePath}`);
        return null;
    }

    try {
        const fileRes = await fetch(tokenUrl);

        if (!fileRes.ok) {
            console.log(`❌ FETCH FAIL: ${filePath}`);
            return null;
        }

        return await fileRes.text();
    } catch (err) {
        console.log(`❌ READ ERROR: ${filePath}`);
        return null;
    }
}

/**
 * =========================
 * TRIGGER SCANNERS
 * =========================
 */
function scanRPT(line) {
    if (line.toLowerCase().includes('lootmax')) {
        console.log('\n🔥 RPT TRIGGER (LOOTMAX FOUND)');
        console.log(line);
    }
}

function scanADM(line) {
    if (line.toLowerCase().includes('killed by')) {
        console.log('\n💀 ADM KILL EVENT FOUND');
        console.log(line);
    }
}

/**
 * =========================
 * TEST 1 — GAME SERVER INFO
 * =========================
 */
async function testGameServerLogs() {
    console.log('\n==============================');
    console.log('🔍 TEST 1: game_specific.log_files');
    console.log('==============================');

    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    if (!res.ok) {
        console.log('❌ FAILED:', res.status);
        return [];
    }

    const logs =
        res.json?.data?.gameserver?.game_specific?.log_files || [];

    if (!logs.length) {
        console.log('⚠️ NO LOG FILES FOUND');
        return [];
    }

    console.log('✅ FOUND LOG FILES:');
    logs.forEach(l => console.log('📄', l));

    return logs;
}

/**
 * =========================
 * PROCESS FILES (NEW STEP)
 * =========================
 */
async function processFiles(files) {
    const rptFiles = files.filter(f => f.toLowerCase().endsWith('.rpt'));
    const admFiles = files.filter(f => f.toLowerCase().endsWith('.adm'));

    console.log('\n==============================');
    console.log('🔍 FILE SCAN START');
    console.log(`📄 RPT: ${rptFiles.length}`);
    console.log(`📄 ADM: ${admFiles.length}`);
    console.log('==============================');

    /**
     * RPT SCAN
     */
    for (const file of rptFiles) {
        console.log(`\n📥 RPT FILE: ${file}`);

        const content = await readFile(file);

        if (!content) continue;

        const lines = content.split('\n');

        for (const line of lines) {
            scanRPT(line);
        }
    }

    /**
     * ADM SCAN
     */
    for (const file of admFiles) {
        console.log(`\n📥 ADM FILE: ${file}`);

        const content = await readFile(file);

        if (!content) continue;

        const lines = content.split('\n');

        for (const line of lines) {
            scanADM(line);
        }
    }

    console.log('\n==============================');
    console.log('🔌 FILE SCAN COMPLETE');
    console.log('==============================');
}

/**
 * TEST 2 — /games/dayz/log endpoint
 */
async function testDirectLogEndpoint() {
    console.log('\n==============================');
    console.log('🔍 TEST 2: /games/dayz/log');
    console.log('==============================');

    const res = await api(
        `/services/${SERVICE_ID}/gameservers/file_server/games/dayz/log`
    );

    console.log('STATUS:', res.status);

    if (!res.ok) {
        console.log('❌ FAILED');
        return;
    }

    console.log(res.raw.substring(0, 500));
}

/**
 * TEST 3 — FILE SERVER ROOT
 */
async function testFileServerRoot() {
    console.log('\n==============================');
    console.log('🔍 TEST 3: file_server/list root');
    console.log('==============================');

    const res = await api(
        `/services/${SERVICE_ID}/gameservers/file_server/list?dir=/`
    );

    console.log('STATUS:', res.status);

    if (!res.ok) {
        console.log('❌ FAILED');
        return;
    }

    const entries = res.json?.data?.entries || [];

    console.log('📂 ENTRIES:', entries.length);

    entries.forEach(e => {
        console.log(`${e.type === 'dir' ? '📁' : '📄'} ${e.path}`);
    });
}

/**
 * RUN ALL TESTS
 */
async function run() {
    console.log('\n🚀 MULTI-METHOD DETECTOR START');

    const files = await testGameServerLogs();

    await testDirectLogEndpoint();
    await testFileServerRoot();

    await processFiles(files);

    console.log('\n==============================');
    console.log('✅ DETECTOR COMPLETE');
    console.log('==============================');
}

console.log('Bot starting (DETECTOR + TRIGGER SCANNER MODE)');
run();
