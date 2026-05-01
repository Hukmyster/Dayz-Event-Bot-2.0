const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    InteractionType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// ---------------- CACHE ----------------
let shopCache = [];
let orderCache = [];

// ---------------- LOAD ----------------
async function loadData() {
    const shopRes = await supabase.from("shop").select("*");
    const orderRes = await supabase.from("orders").select("*");

    shopCache = shopRes.data || [];
    orderCache = orderRes.data || [];

    console.log(`[DB] Shop:${shopCache.length} Orders:${orderCache.length}`);
}

// ---------------- SAVE ----------------
async function saveShopItem(item) {
    const res = await supabase.from("shop").insert([item]);
    if (res.error) return console.error(res.error);
    await loadData();
}

async function deleteItem(displayName) {
    const res = await supabase.from("shop").delete().eq("displayName", displayName);
    if (res.error) return console.error(res.error);
    await loadData();
}

async function updatePrice(displayName, price) {
    const res = await supabase
        .from("shop")
        .update({ price })
        .eq("displayName", displayName);

    if (res.error) return console.error(res.error);
    await loadData();
}

async function saveOrder(order) {
    const res = await supabase.from("orders").insert([order]);
    if (res.error) return console.error(res.error);
    await loadData();
}

// ---------------- READY ----------------
client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await loadData();
    setInterval(loadData, 15000);
});

// ---------------- COMMANDS ----------------
const commands = [

    new SlashCommandBuilder().setName("shop").setDescription("View shop"),

    new SlashCommandBuilder().setName("additem").setDescription("Add item"),

    new SlashCommandBuilder()
        .setName("removeitem")
        .setDescription("Remove item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item").setAutocomplete(true).setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("setprice")
        .setDescription("Update item price")
        .addStringOption(o =>
            o.setName("item").setDescription("Item").setAutocomplete(true).setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("price").setDescription("New price").setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item").setAutocomplete(true).setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z").setRequired(true)
        ),

    new SlashCommandBuilder().setName("orders").setDescription("View orders"),

    new SlashCommandBuilder().setName("queue").setDescription("Queue orders")
];

// ---------------- INTERACTIONS ----------------
client.on("interactionCreate", async (interaction) => {

    // AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused().toLowerCase();

        const results = shopCache
            .filter(i => (i.displayName || "").toLowerCase().includes(focused))
            .slice(0, 5);

        return interaction.respond(
            results.map(i => ({
                name: i.displayName,
                value: i.displayName
            }))
        );
    }

    // MODAL SUBMIT
    if (interaction.type === InteractionType.ModalSubmit &&
        interaction.customId === "additem_modal") {

        const type = interaction.fields.getTextInputValue("type");
        const name = interaction.fields.getTextInputValue("name");
        const price = parseInt(interaction.fields.getTextInputValue("price"));

        await saveShopItem({
            id: Date.now().toString(),
            type,
            displayName: name,
            price
        });

        return interaction.reply({
            content: "Item added",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!interaction.isChatInputCommand()) return;

    // ---------------- ADD ITEM ----------------
    if (interaction.commandName === "additem") {

        const modal = new ModalBuilder()
            .setCustomId("additem_modal")
            .setTitle("Add Item");

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("type")
                    .setLabel("DayZ Type")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("name")
                    .setLabel("Display Name")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("price")
                    .setLabel("Price")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

        return interaction.showModal(modal);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ---------------- SHOP ----------------
    if (interaction.commandName === "shop") {
        return interaction.editReply(
            shopCache.map(i => `• ${i.displayName} ($${i.price})`).join("\n") || "Empty"
        );
    }

    // ---------------- REMOVE ITEM ----------------
    if (interaction.commandName === "removeitem") {

        const item = interaction.options.getString("item");

        await deleteItem(item);

        return interaction.editReply(`Removed: ${item}`);
    }

    // ---------------- SET PRICE ----------------
    if (interaction.commandName === "setprice") {

        const item = interaction.options.getString("item");
        const price = interaction.options.getInteger("price");

        await updatePrice(item, price);

        return interaction.editReply(`Updated ${item} → $${price}`);
    }

    // ---------------- BUY ----------------
    if (interaction.commandName === "buy") {

        const selected = interaction.options.getString("item");
        const item = shopCache.find(i => i.displayName === selected);

        if (!item) return interaction.editReply("Not found");

        await saveOrder({
            id: Date.now(),
            itemType: item.type,
            displayName: item.displayName,
            x: interaction.options.getInteger("x"),
            z: interaction.options.getInteger("z"),
            status: "pending"
        });

        return interaction.editReply(`Ordered: ${item.displayName}`);
    }

    // ---------------- ORDERS ----------------
    if (interaction.commandName === "orders") {

        return interaction.editReply(
            orderCache.length
                ? orderCache.map(o => `• ${o.displayName} [${o.status}]`).join("\n")
                : "No orders"
        );
    }

    // ---------------- QUEUE ----------------
    if (interaction.commandName === "queue") {

        let moved = 0;

        for (let o of orderCache) {
            if (o.status === "pending") {
                o.status = "queued";
                moved++;
            }
        }

        for (let o of orderCache) {
            await supabase
                .from("orders")
                .update({ status: o.status })
                .eq("id", o.id);
        }

        await loadData();

        return interaction.editReply(`Queued: ${moved}`);
    }

});

// ---------------- REGISTER ----------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function register() {
    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );

    console.log("Commands registered");
}

// ---------------- START ----------------
register().then(() => client.login(process.env.DISCORD_TOKEN));
