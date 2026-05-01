const fs = require("fs");
const db = require("../services/db");

const EVENT_FILE = "./custom/shopevents.xml";
const SPAWN_FILE = "./custom/cfgeventspawns.xml";

function makeName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 999)}`;
}

async function buildXML() {

    if (!fs.existsSync("./custom")) {
        fs.mkdirSync("./custom");
    }

    const orders = db.getOrders();

    let events = [];
    let spawns = [];

    for (const o of orders) {

        if (o.status !== "queued") continue;
        if (!o.x || !o.z) continue;

        const name = makeName();

        events.push(
`<event name="${name}">
<nominal>1</nominal><min>1</min><max>1</max>
<lifetime>11000</lifetime><restock>0</restock>
<saferadius>0</saferadius><distanceradius>0</distanceradius>
<cleanupradius>0</cleanupradius>
<flags deletable="0" init_random="0" remove_damaged="1"/>
<position>fixed</position><limit>child</limit><active>1</active>
<children>
<child lootmax="0" lootmin="0" max="1" min="1" type="${o.itemType}"/>
</children>
</event>`
        );

        spawns.push(
`<event name="${name}">
<pos x="${o.x}" z="${o.z}" a="0" />
</event>`
        );

        o.status = "built";
    }

    fs.writeFileSync(EVENT_FILE, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><events>${events.join("")}</events>`);
    fs.writeFileSync(SPAWN_FILE, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><eventposdef>${spawns.join("")}</eventposdef>`);

    await db.saveOrders(orders);
}

module.exports = { buildXML };
