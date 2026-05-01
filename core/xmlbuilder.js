const fs = require("fs");
const path = require("path");
const shop = require("../modules/shop");

const CUSTOM_DIR = "./custom";
const EVENTS_FILE = path.join(CUSTOM_DIR, "shopevents.xml");
const POS_FILE = path.join(CUSTOM_DIR, "eventposdef.xml");

/* ---------------- ENSURE FOLDER ---------------- */

function ensureDir() {
  if (!fs.existsSync(CUSTOM_DIR)) {
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    console.log("[XML] Created /custom directory");
  }
}

/* ---------------- MAIN BUILDER ---------------- */

async function buildAllXML() {
  ensureDir();

  const orders = shop.getOrders();

  let eventsXML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>\n`;

  let posXML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>\n`;

  for (const order of orders) {
    const eventName = `ShopEvent_${order.id}`;

    const qty = order.quantity || 1;
    const type = order.type;

    /* ---------------- EVENTS ---------------- */
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

    /* ---------------- POSITIONS ---------------- */
    posXML += `
    <event name="${eventName}">
        <pos x="${order.x}" z="${order.z}" a="0" />
    </event>`;
  }

  eventsXML += "\n</events>";
  posXML += "\n</eventposdef>";

  fs.writeFileSync(EVENTS_FILE, eventsXML);
  fs.writeFileSync(POS_FILE, posXML);

  console.log("[XML] Shop + Position XML rebuilt");

  return { eventsXML, posXML };
}

module.exports = {
  buildAllXML
};
