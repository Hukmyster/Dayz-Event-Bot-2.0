const fs = require("fs");
const path = require("path");
const db = require("../services/db");

// ALWAYS ensure folder exists BEFORE ANY WRITE
function ensureCustomFolder() {
    const dir = path.join(__dirname, "../custom");

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return dir;
}

function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

async function buildXML() {

    ensureCustomFolder();

    const orders = db.getOrders();

    let events = [];
    let spawns = [];

    for (const o of orders) {

        if (o.status !== "queued") continue;

        const eventName = makeEventName();
        const qty = o.quantity || 1;

        events.push(`
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
        <child lootmax="0" lootmin="0" max="${qty}" min="${qty}" type="${o.itemType}"/>
    </children>
</event>
        `.trim());

        spawns.push(`
<event name="${eventName}">
    <pos x="${o.x}" z="${o.z}" a="0" />
</event>
        `.trim());

        o.status = "built";
    }

    const eventXML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>
${events.join("\n")}
</events>`;

    const spawnXML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>
${spawns.join("\n")}
</eventposdef>`;

    const dir = ensureCustomFolder();

    fs.writeFileSync(path.join(dir, "shopevents.xml"), eventXML);
    fs.writeFileSync(path.join(dir, "cfgeventspawns.xml"), spawnXML);

    db.saveOrders(orders);

    console.log("[XML] Build successful");
}

module.exports = { buildXML };
