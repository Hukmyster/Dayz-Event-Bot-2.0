for (let o of db.getOrders()) {

    if (o.status !== "queued") continue;

    if (!o.x || !o.z) {
        console.log("[SKIP ORDER - NO COORDS]", o);
        continue;
    }

    const name = makeEventName();

    events.push(`<event name="${name}">
<nominal>1</nominal><min>1</min><max>1</max>
<lifetime>11000</lifetime><restock>0</restock>
<saferadius>0</saferadius><distanceradius>0</distanceradius>
<cleanupradius>0</cleanupradius>
<flags deletable="0" init_random="0" remove_damaged="1"/>
<position>fixed</position><limit>child</limit><active>1</active>
<children>
<child lootmax="0" lootmin="0" max="1" min="1" type="${o.itemType}"/>
</children>
</event>`);

    spawns.push(`<event name="${name}">
<pos x="${o.x}" z="${o.z}" a="0" />
</event>`);

    await db.supabase
        .from("orders")
        .update({ status: "built" })
        .eq("id", o.id);
}
