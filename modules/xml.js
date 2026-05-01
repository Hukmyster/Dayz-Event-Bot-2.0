const fs = require("fs");

function ensure() {
    if (!fs.existsSync("./custom")) {
        fs.mkdirSync("./custom", { recursive: true });
    }
}

async function buildXML(db) {

    ensure();

    const orders = db.getOrders();

    let events = [];
    let spawns = [];

    for (const o of orders) {

        if (o.status !== "queued") continue;

        const qty = o.quantity || 1;
        const name = `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

        events.push(`
<event name="${name}">
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
        <child max="${qty}" min="${qty}" type="${o.type}"/>
    </children>
</event>`);

        spawns.push(`
<event name="${name}">
    <pos x="${o.x}" z="${o.z}" a="0"/>
</event>`);

        o.status = "built";
    }

    fs.writeFileSync("./custom/shopevents.xml",
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>${events.join("\n")}</events>`);

    fs.writeFileSync("./custom/cfgeventspawns.xml",
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>${spawns.join("\n")}</eventposdef>`);

    db.saveOrders(orders);

    console.log("[XML] Built");
}

module.exports = { buildXML };
