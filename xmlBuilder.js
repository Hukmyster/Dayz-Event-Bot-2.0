const fs = require("fs");
const path = require("path");

const CUSTOM_DIR = path.join(__dirname, "custom");
const EVENTS_FILE = path.join(CUSTOM_DIR, "shopevents.xml");
const POS_FILE = path.join(CUSTOM_DIR, "eventposdef.xml");

function ensureDir() {
  if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildAllXML(orders = []) {
  ensureDir();

  const nl = "\r\n";
  const events = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<events>'];
  const pos = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<eventposdef>'];

  for (const order of orders) {
    const eventName = `ShopEvent_${order.id}`;
    const qty = Number(order.qty ?? order.quantity ?? 1) || 1;
    const type = escapeXml(order.type);
    const x = Number(order.x) || 0;
    const z = Number(order.z) || 0;

    events.push(`  <event name="${eventName}">`);
    events.push(`   <nominal>1</nominal>`);
    events.push(`   <min>1</min>`);
    events.push(`   <max>1</max>`);
    events.push(`   <lifetime>3000</lifetime>`);
    events.push(`   <restock>3888000</restock>`);
    events.push(`   <saferadius>0</saferadius>`);
    events.push(`   <distanceradius>0</distanceradius>`);
    events.push(`   <cleanupradius>0</cleanupradius>`);
    events.push(`   <flags deletable="0" init_random="0" remove_damaged="1"/>`);
    events.push(`   <position>fixed</position>`);
    events.push(`   <limit>child</limit>`);
    events.push(`   <active>1</active>`);
    events.push(`   <children>`);
    events.push(`     <child lootmax="0" lootmin="0" max="${qty}" min="${qty}" type="${type}"/>`);
    events.push(`   </children>`);
    events.push(`  </event>`);

    pos.push(`    <event name="${eventName}">`);
    pos.push(`        <pos x="${x}" z="${z}" a="0" />`);
    pos.push(`    </event>`);
  }

  events.push('</events>');
  pos.push('</eventposdef>');

  const eventsXML = events.join(nl);
  const posXML = pos.join(nl);

  fs.writeFileSync(EVENTS_FILE, eventsXML);
  fs.writeFileSync(POS_FILE, posXML);

  return { eventsXML, posXML, eventsFile: EVENTS_FILE, posFile: POS_FILE };
}

module.exports = {
  buildAllXML
};
