const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeComment(purchase) {
  return `<!-- player:${purchase.playerId} amount:${purchase.totalCost} -->`;
}

function buildPurchaseSnippets(purchase = {}) {
  const eventName = `ShopEvent_${purchase.id}`;
  const qty = Number(purchase.qty ?? 1) || 1;
  const type = escapeXml(purchase.type);
  const x = Number(purchase.x) || 0;
  const z = Number(purchase.z) || 0;
  const comment = makeComment(purchase);

  const shopeventsSnippet = [
    `\t<event name="${eventName}">`,
    `    <nominal>1</nominal>`,
    `    <min>1</min>`,
    `    <max>1</max>`,
    `    <lifetime>10800</lifetime>`,
    `    <restock>3888000</restock>`,
    `    <saferadius>0</saferadius>`,
    `    <distanceradius>0</distanceradius>`,
    `    <cleanupradius>0</cleanupradius>`,
    `    <flags deletable="1" init_random="0" remove_damaged="0"/>`,
    `    <position>fixed</position>`,
    `    <limit>child</limit>`,
    `    <active>1</active>`,
    `\t<children>`,
    `    <child lootmax="0" lootmin="0" max="${qty}" min="${qty}" type="${type}"/>`,
    `    </children>`,
    `    </event>`
  ].join("\n");

  const cfgeventspawnsSnippet = [
    comment,
    `<event name="${eventName}">`,
    `      <pos x="${x}" z="${z}" a="0" />`,
    `    </event>`
  ].join("\n");

  return {
    purchase_id: purchase.id,
    player_id: purchase.playerId,
    purchase_price: purchase.totalCost,
    shopevents_snippet: shopeventsSnippet,
    cfgeventspawns_snippet: cfgeventspawnsSnippet
  };
}

async function savePurchaseSnippets(purchase) {
  if (!supabase) throw new Error("Supabase client not configured");

  const record = buildPurchaseSnippets(purchase);

  const { data, error } = await supabase
    .from("purchase_snippets")
    .insert([record])
    .select();

  if (error) throw error;

  return { saved: true, record, data };
}

async function buildPurchaseSnippetsAndSave(purchase) {
  return await savePurchaseSnippets(purchase);
}

module.exports = {
  buildPurchaseSnippets,
  savePurchaseSnippets,
  buildPurchaseSnippetsAndSave
};
