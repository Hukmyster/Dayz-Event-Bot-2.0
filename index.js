// FIXED PHASE 4 (NO VALIDATION ERRORS)

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
const fs = require("fs");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

const EVENTS_PATH = "./custom/shopevents.xml";
const SPAWNS_PATH = "./custom/cfgeventspawns.xml";

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
    await supabase.from("shop").insert([item]);
    await loadData();
}

async function deleteItem(name) {
    await supabase.from("shop").delete().eq("displayName", name);
    await loadData();
}

async function updatePrice(name, price) {
    await supabase.from("shop").update({ price }).eq("displayName", name);
    await loadData();
}

async function saveOrder(order) {
    await supabase.from("orders").insert([order]);
    await loadData();
}

// ---------------- XML ----------------
function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random()*1000)}`;
}

function ensureDir() {
    if (!fs.existsSync("./custom")) fs.mkdirSync("./custom");
}

async function buildXML() {

    ensureDir();

    let events = [];
    let spawns = [];

    for (let o of orderCache) {

        if (o.status !== "queued") continue;

        const name = makeEventName();

        events.push(`<event name="${name}">
<nominal>1</nominal><min>1</min><max>1</max>
<lifetime>11000</lifetime><restock>0</restock>
<saferadius>0</saferadius><distanceradius>0</distanceradius>
<cleanupradius>0</cleanupradius>
<flags deletable="0" init_random="0" remove_damaged="1"/>
<position>fixed</position><limit>child</limit><active>1</active>
<children><child lootmax="0" lootmin="0" max="1" min="1" type="${o.itemType}"/></children>
</event>`);

        spawns.push(`<event name="${name}">
<pos x="${o.x}" z="${o.z}" a="0" />
</event>`);

        await supabase.from("orders").update({ status: "built" }).eq("id", o.id);
    }

    fs.writeFileSync(EVENTS_PATH,
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><events>${events.join("")}</events>`);

    fs.writeFileSync(SPAWNS_PATH,
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><eventposdef>${spawns.join("")}</eventposdef>`);

    await loadData();

    console.log("XML BUILT");
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
        .setDescription("Add item"),

    new SlashCommandBuilder()
        .setName("removeitem")
        .setDescription("Remove item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item").setAutocomplete(true).setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("setprice")
        .setDescription("Set item price")
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
            o.setName("x").setDescription("X coord").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z coord").setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("orders")
        .setDescription("View orders"),

    new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Queue orders"),

    new SlashCommandBuilder()
        .setName("build")
        .setDescription("Build XML"),

    new SlashCommandBuilder()
        .setName("cycle")
        .setDescription("Complete orders")
];

// ---------------- INTERACTIONS ----------------
client.on("interactionCreate", async (interaction) => {

    if (interaction.isAutocomplete()) {
        const f = interaction.options.getFocused().toLowerCase();

        return interaction.respond(
            shopCache
                .filter(i => i.displayName.toLowerCase().includes(f))
                .slice(0, 5)
                .map(i => ({ name: i.displayName, value: i.displayName }))
        );
    }

    if (interaction.type === InteractionType.ModalSubmit &&
        interaction.customId === "additem_modal") {

        await saveShopItem({
            id: Date.now().toString(),
            type: interaction.fields.getTextInputValue("type"),
            displayName: interaction.fields.getTextInputValue("name"),
            price: parseInt(interaction.fields.getTextInputValue("price"))
        });

        return interaction.reply({ content: "Item added", flags: MessageFlags.Ephemeral });
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "additem") {

        const modal = new ModalBuilder()
            .setCustomId("additem_modal")
            .setTitle("Add Item");

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("type").setLabel("Type").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("name").setLabel("Name").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("price").setLabel("Price").setStyle(TextInputStyle.Short)
            )
        );

        return interaction.showModal(modal);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.commandName === "shop") {
        return interaction.editReply(shopCache.map(i => `• ${i.displayName} ($${i.price})`).join("\n") || "Empty");
    }

    if (interaction.commandName === "removeitem") {
        await deleteItem(interaction.options.getString("item"));
        return interaction.editReply("Removed");
    }

    if (interaction.commandName === "setprice") {
        await updatePrice(
            interaction.options.getString("item"),
            interaction.options.getInteger("price")
        );
        return interaction.editReply("Updated");
    }

    if (interaction.commandName === "buy") {

        const item = shopCache.find(i => i.displayName === interaction.options.getString("item"));

        await saveOrder({
            id: Date.now(),
            itemType: item.type,
            displayName: item.displayName,
            x: interaction.options.getInteger("x"),
            z: interaction.options.getInteger("z"),
            status: "pending"
        });

        return interaction.editReply(`Ordered ${item.displayName}`);
    }

    if (interaction.commandName === "orders") {
        return interaction.editReply(orderCache.map(o => `• ${o.displayName} [${o.status}]`).join("\n") || "None");
    }

    if (interaction.commandName === "queue") {

        for (let o of orderCache) {
            if (o.status === "pending") {
                await supabase.from("orders").update({ status: "queued" }).eq("id", o.id);
            }
        }

        await loadData();

        return interaction.editReply("Queued");
    }

    if (interaction.commandName === "build") {
        await buildXML();
        return interaction.editReply("XML Built");
    }

    if (interaction.commandName === "cycle") {

        for (let o of orderCache) {
            if (o.status === "built") {
                await supabase.from("orders").update({ status: "completed" }).eq("id", o.id);
            }
        }

        await loadData();

        return interaction.editReply("Cycle complete");
    }

});

// ---------------- START ----------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
).then(() => {
    console.log("Commands registered");
    client.login(process.env.DISCORD_TOKEN);
});
