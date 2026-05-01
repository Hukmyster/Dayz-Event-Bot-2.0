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

// ---------------- LOAD DB ----------------
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
            o.setName("item").setDescription("Item").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z").setRequired(true)
        )
];

// ---------------- INTERACTIONS ----------------
client.on("interactionCreate", async (interaction) => {

    console.log("[INTERACTION]", interaction.commandName || interaction.customId);

    // =====================================================
    // 🚨 MODAL SUBMIT (MUST BE FIRST)
    // =====================================================
    if (interaction.type === InteractionType.ModalSubmit &&
        interaction.customId === "additem_modal") {

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
    // 🚨 SLASH COMMANDS
    // =====================================================
    if (!interaction.isChatInputCommand()) return;

    // ---------------- ADD ITEM (MODAL OPEN) ----------------
    if (interaction.commandName === "additem") {

        const modal = new ModalBuilder()
            .setCustomId("additem_modal")
            .setTitle("Add Shop Item");

        const type = new TextInputBuilder()
            .setCustomId("type")
            .setLabel("Item Type (DayZ exact)")
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

        // ⚠️ MUST NOT defer or reply before this
        return interaction.showModal(modal);
    }

    // ---------------- SAFE DEFER AFTER MODAL HANDLES ----------------
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

        const input = interaction.options.getString("item").toLowerCase();

        const item = shopCache.find(i =>
            (i.displayName || "").toLowerCase() === input
        );

        if (!item) {
            return interaction.editReply("Not found");
        }

        return interaction.editReply(`Buying ${item.displayName}`);
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
