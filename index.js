const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// ---------------- DISCORD CLIENT ----------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ---------------- SUPABASE ----------------
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// ---------------- MEMORY CACHE ----------------
let shopCache = [];
let orderCache = [];

// ---------------- FAST LOAD ----------------
async function loadData() {
    const { data: shop } = await supabase.from("shop").select("*");
    const { data: orders } = await supabase.from("orders").select("*");

    shopCache = shop || [];
    orderCache = orders || [];
}

// ---------------- CACHE ACCESS ----------------
const getShop = () => shopCache;
const getOrders = () => orderCache;

// ---------------- SAVE HELPERS ----------------
async function saveShopItem(item) {
    await supabase.from("shop").upsert(item);
    await loadData();
}

async function saveOrder(order) {
    await supabase.from("orders").upsert(order);
    await loadData();
}

// ---------------- BOT READY ----------------
client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await loadData();

    // optional refresh loop
    setInterval(loadData, 10000);
});

// ---------------- SLASH COMMANDS ----------------
const commands = [
    new SlashCommandBuilder().setName("shop").setDescription("View shop"),

    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item name").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X coordinate").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z coordinate").setRequired(true)
        ),

    new SlashCommandBuilder().setName("status").setDescription("View order status"),

    new SlashCommandBuilder().setName("additem").setDescription("Add test item")
];

// ---------------- INTERACTION HANDLER ----------------
client.on("interactionCreate", async (interaction) => {

    if (!interaction.isChatInputCommand()) return;

    // 🔥 ALWAYS ACK FAST (prevents "not responding")
    await interaction.deferReply({ ephemeral: true });

    // ---------------- SHOP ----------------
    if (interaction.commandName === "shop") {
        const shop = getShop();

        return interaction.editReply(
            shop.length
                ? shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
                : "Shop is empty"
        );
    }

    // ---------------- BUY ----------------
    if (interaction.commandName === "buy") {

        const shop = getShop();

        const input = interaction.options.getString("item").toLowerCase();

        const item = shop.find(i =>
            (i.displayName || "").toLowerCase() === input
        );

        if (!item) {
            return interaction.editReply("Item not found in shop");
        }

        const order = {
            id: Date.now(),
            itemType: item.type,
            displayName: item.displayName,
            x: interaction.options.getInteger("x"),
            z: interaction.options.getInteger("z"),
            status: "pending"
        };

        await saveOrder(order);

        return interaction.editReply(
            `Order placed: ${item.displayName} @ ${order.x}, ${order.z}`
        );
    }

    // ---------------- STATUS ----------------
    if (interaction.commandName === "status") {

        const orders = getOrders();

        const count = (s) => orders.filter(o => o.status === s).length;

        return interaction.editReply(
`Pending: ${count("pending")}
Queued: ${count("queued")}
Built: ${count("built")}
Completed: ${count("completed")}`
        );
    }

    // ---------------- ADD ITEM (TEST ONLY) ----------------
    if (interaction.commandName === "additem") {

        const item = {
            id: Date.now().toString(),
            type: "m4",
            displayName: "M4 Rifle",
            price: 3500
        };

        await saveShopItem(item);

        return interaction.editReply("Test item added");
    }

});

// ---------------- REGISTER COMMANDS ----------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );
}

// ---------------- START ----------------
registerCommands()
    .then(() => client.login(process.env.DISCORD_TOKEN));
