const fs = require('fs');
const path = require('path');
const { createClient } = require("@supabase/supabase-js");

// Configuration
const RESTART_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CUSTOM_DIR = path.join(__dirname, "custom");
const EVENTS_FILE = path.join(CUSTOM_DIR, "shopevents.xml");
const POS_FILE = path.join(CUSTOM_DIR, "eventposdef.xml");

// XML Template parts
const EVENTS_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<events>\n  <!-- [PURCHASE_SNIPPETS_START] -->';
const EVENTS_FOOTER = '  <!-- [PURCHASE_SNIPPETS_END] -->\n</events>';
const POS_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<eventposdef>\n  <!-- [PURCHASE_SNIPPETS_START] -->';
const POS_FOOTER = '  <!-- [PURCHASE_SNIPPETS_END] -->\n</eventposdef>';

async function runRestartProcedure() {
  console.log("[RESTART] Starting multi-step procedure...");
  
  // 1. Pull snippets from Supabase
  console.log("[RESTART] Fetching snippets from Supabase...");
  const { data: snippets, error } = await supabase
    .from('purchase_snippets')
    .select('shopevents_snippet, cfgeventspawns_snippet');
    
  if (error) {
    console.error("[RESTART] Error fetching snippets:", error);
    return;
  }

  // 2. Compile into lists
  const eventsList = snippets.map(s => s.shopevents_snippet).join("\n");
  const posList = snippets.map(s => s.cfgeventspawns_snippet).join("\n");

  // 3. Attach headers and footers
  const finalEventsXML = `${EVENTS_HEADER}\n${eventsList}\n${EVENTS_FOOTER}`;
  const finalPosXML = `${POS_HEADER}\n${posList}\n${POS_FOOTER}`;

  // 4. Save files
  if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR);
  fs.writeFileSync(EVENTS_FILE, finalEventsXML);
  fs.writeFileSync(POS_FILE, finalPosXML);
  
  console.log("[RESTART] XML files rebuilt successfully.");
  console.log("[RESTART] Triggering Nitrado restart logic here...");
}

// ... rest of start logic (setInterval, etc)
module.exports = { runRestartProcedure };
