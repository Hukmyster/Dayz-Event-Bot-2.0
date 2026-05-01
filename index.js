const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    InteractionType,
    MessageFlags
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// ---------------- DISCORD ----------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ---------------- SUPABASE ----------------
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// ---------------- CACHE ----------------
let shopCache = [];
let orderCache = [];

// ---------------- LOAD DATA ----------------
async function loadData() {
    console.log("[DB] Loading data...");

    const shopRes = await supabase.from("shop").select("*");
    const orderRes = await supabase.from("orders").select("*");

    if (shopRes.error) console.error("[SHOP LOAD ERROR]", shopRes.error);
    if (orderRes.error) console.error("[ORDER LOAD ERROR]", orderRes.error);

    shopCache = shopRes.data || [];
    orderCache = orderRes.data || [];

    console.log(`[DB] Shop items: ${shopCache.length}`);
    console.log(`[DB] Orders: ${orderCache.length}`);
}

// ---------------- HELPERS ----------------
const getShop = () => shopCache;
const getOrders = () => orderCache;

// ---------------- INSERT SHOP ITEM ----------------
async function saveShopItem(item) {
    console.log("[DB] Adding shop item:", item);

    const res = await supabase.from("shop").insert([item]);

    if (res.error) {
        console.error("[SHOP INSERT ERROR]", res.error);
        return false;
    }

    await loadData();
    return true;
}

// ---------------- INSERT ORDER ----------------
async function saveOrder(order) {
    console.log("[DB] Adding order:", order);

    const res = await supabase.from("orders").insert([order]);

    if (res.error) {
        console.error("[ORDER INSERT ERROR]", res.error);
        return false;
    }

    await loadData();
    return true;
}

// ---------------- READY ----------------
client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await loadData();

    setInterval(loadData, 15000);
});

// ---------------- COMMANDS ----------------
const commands = [
    new SlashCommandBuilder()
        .setName("shop")
        .setDescription("View shop"),

    new SlashCommandBuilder()
        .setName("additem")
        .setDescription("Add test item to shop"),

    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item name").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z").setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("status")
        .setDescription("View system status")
];

// ---------------- INTERACTIONS ----------------
client.on("interactionCreate", async (interaction) => {

    console.log("[INTERACTION]", interaction.type, interaction.commandName);

    if (!interaction.isChatInputCommand()) return;

    // ALWAYS ACK FAST (fixes "not responding")
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ---------------- SHOP ----------------
    if (interaction.commandName === "shop") {
        const shop = getShop();

        return interaction.editReply(
            shop.length
                ? shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
                : "Shop is empty"
        );
    }

    // ---------------- ADD ITEM ----------------
    if (interaction.commandName === "additem") {

        const item = {
            id: Date.now().toString(),
            type: "m4",
            displayName: "M4 Rifle",
            price: 3500
        };

        const ok = await saveShopItem(item);

        return interaction.editReply(
            ok ? "Item added successfully" : "FAILED to add item (check logs)"
        );
    }

    // ---------------- BUY ----------------
    if (interaction.commandName === "buy") {

        const shop = getShop();
        const input = interaction.options.getString("item").toLowerCase();

        console.log("[BUY INPUT]", input);

        const item = shop.find(i =>
            (i.displayName || "").toLowerCase() === input
        );

        if (!item) {
            return interaction.editReply("Item not found");
        }

        const order = {
            id: Date.now(),
            itemType: item.type,
            displayName: item.displayName,
            x: interaction.options.getInteger("x"),
            z: interaction.options.getInteger("z"),
            status: "pending"
        };

        const ok = await saveOrder(order);

        return interaction.editReply(
            ok ? `Order placed: ${item.displayName}` : "Order failed"
        );
    }

    // ---------------- STATUS ----------------
    if (interaction.commandName === "status") {

        const orders = getOrders();

        const count = (s) => orders.filter(o => o.status === s).length;

        return interaction.editReply(
`SHOP DEBUG:
Items: ${shopCache.length}

ORDERS:
Pending: ${count("pending")}
Queued: ${count("queued")}
Built: ${count("built")}
Completed: ${count("completed")}`
        );
    }
});

// ---------------- REGISTER COMMANDS ----------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function register() {
    console.log("[DISCORD] Registering commands...");

    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );

    console.log("[DISCORD] Commands registered");
}

// ---------------- START ----------------
register()
    .then(() => client.login(process.env.DISCORD_TOKEN))
    .catch(console.error);
