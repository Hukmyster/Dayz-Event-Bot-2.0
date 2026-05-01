const fs = require("fs");
const db = require("../services/db");

function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

async function buildXML() {

    const orders = db.getOrders();

    let events = [];
    let spawns = [];

    for (const o of orders) {

        if (o.status !== "queued") continue;

        const eventName = makeEventName();

        const lifetime = 3000;
        const restock = 3888000;

        const qty = o.quantity || 1;

        // ---------------- EVENT XML ----------------
        events.push(`
    <event name="${eventName}">
        <nominal>1</nominal>
        <min>1</min>
        <max>1</max>
        <lifetime>${lifetime}</lifetime>
        <restock>${restock}</restock>
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

        // ---------------- SPAWN XML ----------------
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

    fs.writeFileSync("./custom/shopevents.xml", eventXML);
    fs.writeFileSync("./custom/cfgeventspawns.xml", spawnXML);

    db.saveOrders(orders);

    console.log("[XML] Built clean structured XML");
}

module.exports = { buildXML };
