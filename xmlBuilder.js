const fs = require("fs");
const path = require("path");

const CUSTOM_DIR = path.join(__dirname, "custom");
const EVENTS_FILE = path.join(CUSTOM_DIR, "shopevents.xml");
const POS_FILE = path.join(CUSTOM_DIR, "eventposdef.xml");

function ensureDir() {
  if (!fs.existsSync(CUSTOM_DIR)) {
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    console.log("[XML] Created /custom directory");
  }
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function buildAllXML(orders = []) {
  ensureDir();

  let eventsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<events>\n`;
  let posXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<eventposdef>\n`;

  for (const order of orders) {
    const eventName = `ShopEvent_${order.id}`;
    const qty = Number(order.qty ?? order.quantity ?? 1) || 1;
    const type = escapeXml(order.type);
    const x = Number(order.x) || 0;
    const z = Number(order.z) || 0;

    eventsXML += `
  <event name="${eventName}">
    <nominal>1</nominal>
    <min>1</min>
    <max>1</max>
    <lifetime>3000</lifetime>
    <restock>3888000</restock>
    <saferadius>0</saferadius>
    <distanceradius>0</distanceradius>
    <cleanupradius>0</cleanupradius>
    <flags deletable="0" init_random="0" remove_damaged="1"/>
    <position>fixed</position>
    <limit>child</limit>
    <active>1</active>
    <children>
      <child lootmax="0" lootmin="0" max="${qty}" min="${qty}" type="${type}"/>
    </children>
  </event>`;

    posXML += `
  <event name="${eventName}">
    <pos x="${x}" z="${z}" a="0" />
  </event>`;
  }

  eventsXML += "\n</events>\n";
  posXML += "\n</eventposdef>\n";

  fs.writeFileSync(EVENTS_FILE, eventsXML);
  fs.writeFileSync(POS_FILE, posXML);

  console.log("[XML] Shop + Position XML rebuilt");

  return { eventsXML, posXML, eventsFile: EVENTS_FILE, posFile: POS_FILE };
}

module.exports = {
  buildAllXML
};
