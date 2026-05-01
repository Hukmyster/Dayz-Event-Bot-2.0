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

    if (res.error) {
        console.error("[SHOP ERROR]", res.error);
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
    new SlashCommandBuilder().setName("shop").setDescription("View shop"),

    new SlashCommandBuilder().setName("additem").setDescription("Add item"),

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
        )
];

// ---------------- MAIN HANDLER ----------------
client.on("interactionCreate", async (interaction) => {

    console.log("====================================");
    console.log("[INTERACTION TYPE]", interaction.type);
    console.log("[COMMAND]", interaction.commandName || interaction.customId);

    // =====================================================
    // 1. AUTOCOMPLETE (FIRST)
    // =====================================================
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

    // =====================================================
    // 2. MODAL SUBMIT (MUST BE FIRST BEFORE ANY DEFER)
    // =====================================================
    if (interaction.type === InteractionType.ModalSubmit &&
        interaction.customId === "additem_modal") {

        console.log("[MODAL SUBMIT] additem");

        const type = interaction.fields.getTextInputValue("type");
        const name = interaction.fields.getTextInputValue("name");
        const price = parseInt(interaction.fields.getTextInputValue("price"));

        const ok = await saveShopItem({
            id: Date.now().toString(),
            type,
            displayName: name,
            price
        });

        return interaction.reply({
            content: ok ? "Item added" : "Failed",
            flags: MessageFlags.Ephemeral
        });
    }

    // =====================================================
    // 3. SLASH COMMANDS ONLY
    // =====================================================
    if (!interaction.isChatInputCommand()) return;

    console.log("[SLASH COMMAND]", interaction.commandName);

    // ---------------- ADD ITEM (MODAL OPEN) ----------------
    if (interaction.commandName === "additem") {

        console.log("[OPEN MODAL] additem");

        const modal = new ModalBuilder()
            .setCustomId("additem_modal")
            .setTitle("Add Shop Item");

        const type = new TextInputBuilder()
            .setCustomId("type")
            .setLabel("DayZ Type")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const name = new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Display Name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const price = new TextInputBuilder()
            .setCustomId("price")
            .setLabel("Price")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(type),
            new ActionRowBuilder().addComponents(name),
            new ActionRowBuilder().addComponents(price)
        );

        // IMPORTANT: NO deferReply here
        return interaction.showModal(modal);
    }

    // =====================================================
    // SAFE DEFER ONLY AFTER NON-MODAL COMMANDS
    // =====================================================
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ---------------- SHOP ----------------
    if (interaction.commandName === "shop") {

        return interaction.editReply(
            shopCache.length
                ? shopCache.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
                : "Empty"
        );
    }

    // ---------------- BUY ----------------
    if (interaction.commandName === "buy") {

        const selected = interaction.options.getString("item");

        const item = shopCache.find(i => i.displayName === selected);

        if (!item) {
            return interaction.editReply("Item not found");
        }

        return interaction.editReply(`Order: ${item.displayName}`);
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

    console.log("[DISCORD] Commands registered");
}

// ---------------- START ----------------
register()
    .then(() => client.login(process.env.DISCORD_TOKEN))
    .catch(console.error);
