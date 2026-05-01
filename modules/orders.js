async function createOrder(item, x, z) {

    const order = {
        id: Date.now().toString(),
        itemType: item.type,
        displayName: item.displayName,
        x: Number(x),
        z: Number(z),
        status: "pending"
    };

    const { error } = await db.supabase
        .from("orders")
        .insert([order]);

    if (error) {
        console.log("[ORDER INSERT ERROR]", error);
        return;
    }

    await db.loadData();
}
