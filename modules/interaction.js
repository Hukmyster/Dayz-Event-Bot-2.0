if (interaction.commandName === "buy") {

    const itemName = interaction.options.getString("item");
    const x = interaction.options.getInteger("x");
    const z = interaction.options.getInteger("z");

    if (x == null || z == null) {
        return interaction.editReply("Missing coordinates (x/z).");
    }

    const item = shop.findItem(itemName);

    if (!item) {
        return interaction.editReply("Item not found in shop.");
    }

    await orders.createOrder(item, x, z);

    return interaction.editReply(
        `Order placed: ${item.displayName} @ ${x}, ${z}`
    );
}
