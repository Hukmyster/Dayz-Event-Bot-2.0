const fs = require("fs");
const db = require("../services/db");

const EVENTS_PATH = "./custom/shopevents.xml";
const SPAWNS_PATH = "./custom/cfgeventspawns.xml";

function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function ensureDir() {
    if (!fs.existsSync("./custom")) {
        fs.mkdirSync("./custom");
    }
}

async function buildXML() {

    ensureDir();

    let events = [];
    let spawns = [];

    const orders = db.getOrders();

    for (const o of orders) {

        if (o.status !== "queued") continue;
        if (!o.x || !o.z) continue;

        const name = makeEventName();

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

        // mark built safely (NO await needed here if db is local cache)
        await db.supabase
            .from("orders")
            .update({ status: "built" })
            .eq("id", o.id);
    }

    fs.writeFileSync(
        EVENTS_PATH,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><events>${events.join("")}</events>`
    );

    fs.writeFileSync(
        SPAWNS_PATH,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><eventposdef>${spawns.join("")}</eventposdef>`
    );

    await db.loadData();
}

module.exports = { buildXML };
