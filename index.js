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
 * TEST 1 — GAME SERVER INFO (log_files method)
 */
async function testGameServerLogs() {
    console.log('\n==============================');
    console.log('🔍 TEST 1: game_specific.log_files');
    console.log('==============================');

    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    if (!res.ok) {
        console.log('❌ FAILED:', res.status);
        return;
    }

    const logs = res.json?.data?.gameserver?.game_specific?.log_files;

    if (!logs || logs.length === 0) {
        console.log('⚠️ NO LOG FILES FOUND IN INDEX');
        return;
    }

    console.log('✅ FOUND LOG FILES:');
    logs.forEach(l => console.log('📄', l));
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

    console.log('📦 RESPONSE:');
    console.log(res.raw.substring(0, 500));
}

/**
 * TEST 3 — FILE SERVER ROOT (we know this fails but confirm)
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

    console.log('📂 ENTRIES COUNT:', entries.length);

    entries.forEach(e => {
        console.log(`${e.type === 'dir' ? '📁' : '📄'} ${e.path}`);
    });
}

/**
 * RUN ALL TESTS
 */
async function run() {
    console.log('\n🚀 MULTI-METHOD DETECTOR START');

    await testGameServerLogs();
    await testDirectLogEndpoint();
    await testFileServerRoot();

    console.log('\n==============================');
    console.log('✅ DETECTOR COMPLETE');
    console.log('==============================');
}

console.log('Bot starting (DETECTOR MODE)');
run();
