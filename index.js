const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");

const fs = require("fs");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ---------------- PATHS ----------------
const DB_PATH = "./database/orders.json";
const SHOP_PATH = "./database/shop.json";
const EVENTS_PATH = "./custom/shopevents.xml";
const SPAWNS_PATH = "./custom/cfgeventspawns.xml";

// ---------------- SAFETY ----------------
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ---------------- INIT ----------------
function ensureFiles() {
    if (!fs.existsSync("./database")) fs.mkdirSync("./database");
    if (!fs.existsSync("./custom")) fs.mkdirSync("./custom");

    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "[]");
    if (!fs.existsSync(SHOP_PATH)) fs.writeFileSync(SHOP_PATH, "[]");
}

// ---------------- LOAD/SAVE ----------------
function load(path) {
    try {
        return JSON.parse(fs.readFileSync(path, "utf-8"));
    } catch {
        return [];
    }
}

function save(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

const getShop = () => load(SHOP_PATH);
const getOrders = () => load(DB_PATH);

// ---------------- XML ----------------
function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function buildXML() {
    const orders = getOrders();

    let events = [];
    let spawns = [];

    for (const o of orders) {

        if (o.status !== "queued") continue;

        const eventName = makeEventName();

        events.push(
`<event name="${eventName}">
<nominal>1</nominal><min>1</min><max>1</max>
<lifetime>11000</lifetime><restock>0</restock>
<saferadius>0</saferadius><distanceradius>0</distanceradius>
<cleanupradius>0</cleanupradius>
<flags deletable="0" init_random="0" remove_damaged="1"/>
<position>fixed</position><limit>child</limit><active>1</active>
<children>
<child lootmax="0" lootmin="0" max="1" min="1" type="${o.itemType}"/>
</children>
</event>`
        );

        spawns.push(
`<event name="${eventName}">
<pos x="${o.x}" z="${o.z}" a="0" />
</event>`
        );

        o.status = "built";
    }

    fs.writeFileSync(EVENTS_PATH,
`<?xml version="1.0" encoding="UTF-8"?><events>${events.join("")}</events>`);

    fs.writeFileSync(SPAWNS_PATH,
`<?xml version="1.0" encoding="UTF-8"?><eventposdef>${spawns.join("")}</eventposdef>`);

    save(DB_PATH, orders);

    console.log("XML BUILT + STATUS UPDATED");
}

// ---------------- COMMANDS ----------------
const commands = [

    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Purchase item")
        .addStringOption(o =>
            o.setName("item").setDescription("Select item").setAutocomplete(true).setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X coord").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z coord").setRequired(true)
        ),

    new SlashCommandBuilder().setName("additem").setDescription("Add item to shop"),

    new SlashCommandBuilder()
        .setName("removeitem")
        .setDescription("Remove item from shop")
        .addStringOption(o =>
            o.setName("item").setDescription("Item").setAutocomplete(true).setRequired(true)
        ),

    new SlashCommandBuilder().setName("shop").setDescription("View shop"),
    new SlashCommandBuilder().setName("orders").setDescription("View orders"),
    new SlashCommandBuilder().setName("queue").setDescription("Move pending → queued"),
    new SlashCommandBuilder().setName("build").setDescription("Build XML"),
    new SlashCommandBuilder().setName("cycle").setDescription("Complete restart cycle"),
    new SlashCommandBuilder().setName("status").setDescription("System status"),
    new SlashCommandBuilder().setName("viewxml").setDescription("View XML"),
    new SlashCommandBuilder().setName("dumpshop").setDescription("Debug shop"),
    new SlashCommandBuilder().setName("dumporders").setDescription("Debug orders"),
    new SlashCommandBuilder().setName("listcommands").setDescription("List commands")
];

// ---------------- REGISTER ----------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function register() {
    await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
    );
}

// ---------------- READY ----------------
client.once("clientReady", () => {
    ensureFiles();
    console.log(`Logged in as ${client.user.tag}`);
});

// ---------------- INTERACTIONS ----------------
client.on("interactionCreate", async (interaction) => {

    ensureFiles();

    // AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused();
        const shop = getShop();

        return interaction.respond(
            shop
                .filter(i => i.displayName.toLowerCase().includes(focused.toLowerCase()))
                .slice(0, 5)
                .map(i => ({
                    name: `${i.displayName} ($${i.price})`,
                    value: i.id
                }))
        );
    }

    // ---------------- COMMANDS ----------------
    if (interaction.isChatInputCommand()) {

        // ADD ITEM
        if (interaction.commandName === "additem") {

            const modal = new ModalBuilder()
                .setCustomId("addItemModal")
                .setTitle("Add Item");

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("type").setLabel("types.xml name").setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("name").setLabel("Display name").setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("price").setLabel("Price").setStyle(TextInputStyle.Short)
                )
            );

            return interaction.showModal(modal);
        }

        // BUY
        if (interaction.commandName === "buy") {
            const shop = getShop();
            const item = shop.find(i => i.id === interaction.options.getString("item"));

            if (!item) return interaction.reply({ content: "Item not found", flags: 64 });

            const orders = getOrders();

            orders.push({
                id: Date.now(),
                itemType: item.type,
                displayName: item.displayName,
                x: interaction.options.getInteger("x"),
                z: interaction.options.getInteger("z"),
                status: "pending"
            });

            save(DB_PATH, orders);

            console.log("ORDER SAVED:", orders[orders.length - 1]);

            return interaction.reply({
                content: `✅ ${item.displayName} @ ${interaction.options.getInteger("x")},${interaction.options.getInteger("z")} (pending)`,
                flags: 64
            });
        }

        // REMOVE ITEM
        if (interaction.commandName === "removeitem") {
            const id = interaction.options.getString("item");
            let shop = getShop();

            shop = shop.filter(i => i.id !== id);
            save(SHOP_PATH, shop);

            return interaction.reply({ content: "Item removed", flags: 64 });
        }

        // SHOP
        if (interaction.commandName === "shop") {
            const shop = getShop();
            return interaction.reply({
                content: shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n") || "Empty",
                flags: 64
            });
        }

        // ORDERS
        if (interaction.commandName === "orders") {
            const orders = getOrders();
            return interaction.reply({
                content: orders.map(o => `• ${o.displayName} [${o.status}]`).join("\n") || "None",
                flags: 64
            });
        }

        // QUEUE
        if (interaction.commandName === "queue") {
            const orders = getOrders();
            let moved = 0;

            for (const o of orders) {
                if (o.status === "pending" && moved < 10) {
                    o.status = "queued";
                    moved++;
                }
            }

            save(DB_PATH, orders);

            return interaction.reply({ content: `Queued ${moved}`, flags: 64 });
        }

        // BUILD
        if (interaction.commandName === "build") {
            buildXML();
            return interaction.reply({ content: "XML built", flags: 64 });
        }

        // CYCLE
        if (interaction.commandName === "cycle") {
            const orders = getOrders();
            let done = 0;

            for (const o of orders) {
                if (o.status === "built") {
                    o.status = "completed";
                    done++;
                }
            }

            save(DB_PATH, orders);

            return interaction.reply({ content: `Completed ${done}`, flags: 64 });
        }

        // STATUS
        if (interaction.commandName === "status") {
            const orders = getOrders();
            const count = s => orders.filter(o => o.status === s).length;

            return interaction.reply({
                content:
`Pending: ${count("pending")}
Queued: ${count("queued")}
Built: ${count("built")}
Completed: ${count("completed")}`,
                flags: 64
            });
        }

        // VIEW XML
        if (interaction.commandName === "viewxml") {
            try {
                const xml = fs.readFileSync(EVENTS_PATH, "utf-8");
                return interaction.reply({
                    content: "```xml\n" + xml.slice(0, 1800) + "\n```",
                    flags: 64
                });
            } catch {
                return interaction.reply({ content: "No XML yet", flags: 64 });
            }
        }

        // DEBUG
        if (interaction.commandName === "dumpshop") {
            return interaction.reply({
                content: "```json\n" + JSON.stringify(getShop(), null, 2).slice(0, 1800),
                flags: 64
            });
        }

        if (interaction.commandName === "dumporders") {
            return interaction.reply({
                content: "```json\n" + JSON.stringify(getOrders(), null, 2).slice(0, 1800),
                flags: 64
            });
        }

        if (interaction.commandName === "listcommands") {
            return interaction.reply({
                content:
`/buy
/additem
/removeitem
/shop
/orders
/queue
/build
/cycle
/status
/viewxml
/dumpshop
/dumporders
/listcommands`,
                flags: 64
            });
        }
    }

    // ---------------- MODAL FIX ----------------
    if (interaction.isModalSubmit()) {

        if (interaction.customId === "addItemModal") {

            const shop = getShop();

            const item = {
                id: Date.now().toString(),
                type: interaction.fields.getTextInputValue("type"),
                displayName: interaction.fields.getTextInputValue("name"),
                price: Number(interaction.fields.getTextInputValue("price"))
            };

            shop.push(item);
            save(SHOP_PATH, shop);

            console.log("ITEM ADDED:", item);

            return interaction.reply({
                content: "Item added",
                flags: 64
            });
        }
    }
});

// ---------------- START ----------------
register().then(() => client.login(process.env.DISCORD_TOKEN));
