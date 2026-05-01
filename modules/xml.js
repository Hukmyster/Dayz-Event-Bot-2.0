const fs = require("fs");
const path = require("path");

const CUSTOM_DIR = "./custom";
const EVENTS_FILE = path.join(CUSTOM_DIR, "cfgeventspawns.xml");
const SHOP_FILE = path.join(CUSTOM_DIR, "shopevents.xml");

// Ensure folder exists (FIXES YOUR ERROR)
function ensureDir() {
  if (!fs.existsSync(CUSTOM_DIR)) {
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    console.log("[XML] Created /custom directory");
  }
}

// Build FULL XML from orders
function buildXML(orders) {
  ensureDir();

  let eventsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<events>\n`;
  let posXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<eventposdef>\n`;

  orders.forEach(order => {
    const eventName = `ShopEvent_${order.id}`;

    const quantity = order.quantity || 1;
    const type = order.type; // MUST be types.xml name

    // --- EVENTS FILE ---
    eventsXML += `    <event name="${eventName}">\n`;
    eventsXML += `        <nominal>1</nominal>\n`;
    eventsXML += `        <min>1</min>\n`;
    eventsXML += `        <max>1</max>\n`;
    eventsXML += `        <lifetime>3000</lifetime>\n`;
    eventsXML += `        <restock>3888000</restock>\n`;
    eventsXML += `        <saferadius>0</saferadius>\n`;
    eventsXML += `        <distanceradius>0</distanceradius>\n`;
    eventsXML += `        <cleanupradius>0</cleanupradius>\n`;
    eventsXML += `        <flags deletable="0" init_random="0" remove_damaged="1"/>\n`;
    eventsXML += `        <position>fixed</position>\n`;
    eventsXML += `        <limit>child</limit>\n`;
    eventsXML += `        <active>1</active>\n`;
    eventsXML += `        <children>\n`;
    eventsXML += `            <child lootmax="0" lootmin="0" max="${quantity}" min="${quantity}" type="${type}"/>\n`;
    eventsXML += `        </children>\n`;
    eventsXML += `    </event>\n`;

    // --- POSITION FILE ---
    posXML += `    <event name="${eventName}">\n`;
    posXML += `        <pos x="${order.x}" z="${order.z}" a="0" />\n`;
    posXML += `    </event>\n`;
  });

  eventsXML += `</events>`;
  posXML += `</eventposdef>`;

  // Write files
  fs.writeFileSync(SHOP_FILE, eventsXML);
  fs.writeFileSync(EVENTS_FILE, posXML);

  console.log("[XML] Files built successfully");

  return {
    eventsXML,
    posXML
  };
}

module.exports = {
  buildXML
};
