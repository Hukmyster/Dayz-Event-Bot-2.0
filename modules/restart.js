const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const RESTART_INTERVAL_MS = 3 * 60 * 60 * 1000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CUSTOM_DIR = path.join(__dirname, 'custom');
const EVENTS_FILE = path.join(CUSTOM_DIR, 'shopevents.xml');
const POS_FILE = path.join(CUSTOM_DIR, 'eventposdef.xml');

const EVENTS_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>
  <!-- [PURCHASE_SNIPPETS_START] -->`;
const EVENTS_FOOTER = `  <!-- [PURCHASE_SNIPPETS_END] -->
</events>`;

const POS_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>
  <!-- [PURCHASE_SNIPPETS_START] -->`;
const POS_FOOTER = `  <!-- [PURCHASE_SNIPPETS_END] -->
</eventposdef>`;

async function fetchSnippets() {
  const { data, error } = await supabase
    .from('purchase_snippets')
    .select('id, shopevents_snippet, cfgeventspawns_snippet, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

function buildXml(snippets) {
  const eventsList = snippets.map(s => s.shopevents_snippet).filter(Boolean).join('\n');
  const posList = snippets.map(s => s.cfgeventspawns_snippet).filter(Boolean).join('\n');

  const finalEventsXML = `${EVENTS_HEADER}\n${eventsList}\n${EVENTS_FOOTER}`;
  const finalPosXML = `${POS_HEADER}\n${posList}\n${POS_FOOTER}`;

  return { finalEventsXML, finalPosXML };
}

function ensureOutputDir() {
  if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });
}

async function writeFiles(eventsXML, posXML) {
  ensureOutputDir();
  fs.writeFileSync(EVENTS_FILE, eventsXML, 'utf8');
  fs.writeFileSync(POS_FILE, posXML, 'utf8');
}

async function clearProcessedSnippets(ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from('purchase_snippets')
    .delete()
    .in('id', ids);

  if (error) throw error;
}

async function runRestartProcedure() {
  console.log('[RESTART] Starting multi-step procedure...');

  console.log('[RESTART] Fetching snippets from Supabase...');
  const snippets = await fetchSnippets();

  if (!snippets.length) {
    console.log('[RESTART] No snippets found. Skipping XML rebuild.');
    return;
  }

  console.log(`[RESTART] Snippets fetched: ${snippets.length}`);
  const { finalEventsXML, finalPosXML } = buildXml(snippets);

  await writeFiles(finalEventsXML, finalPosXML);
  console.log('[RESTART] XML files rebuilt successfully.');

  await clearProcessedSnippets(snippets.map(s => s.id));
  console.log('[RESTART] Processed snippet rows cleared from Supabase.');

  console.log('[RESTART] Triggering Nitrado restart logic here...');
}

function start() {
  console.log('[RESTART] Restart module initialized.');
  setInterval(async () => {
    try {
      await runRestartProcedure();
    } catch (error) {
      console.error('[RESTART] Restart cycle failed:', error);
    }
  }, RESTART_INTERVAL_MS);
}

module.exports = { start, runRestartProcedure };
