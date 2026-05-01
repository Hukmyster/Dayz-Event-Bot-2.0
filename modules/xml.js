const fs = require("fs");

function buildXML(db) {

    const orders = db.getOrders();

    let events = "";
    let spawns = "";

    for (const o of orders) {

        const id = `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 999)}`;

        events += `
<event name="${id}">
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
<child lootmax="0" lootmin="0" max="${o.quantity}" min="${o.quantity}" type="${o.type}"/>
</children>
</event>`;

        spawns += `
<event name="${id}">
<pos x="${o.x}" z="${o.z}" a="0" />
</event>`;
    }

    fs.writeFileSync("./custom/shopevents.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<events>${events}\n</events>`
    );

    fs.writeFileSync("./custom/cfgeventspawns.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<eventposdef>${spawns}\n</eventposdef>`
    );
}

module.exports = { buildXML };
