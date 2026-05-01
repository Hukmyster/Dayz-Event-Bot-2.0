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
const { Octokit } = require("@octokit/rest");
require("dotenv").config();

// ---------------- DISCORD ----------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ---------------- GITHUB DB ----------------
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const [OWNER, REPO] = process.env.GITHUB_REPO.split("/");

const SHOP_FILE = "database/shop.json";
const ORDERS_FILE = "database/orders.json";

// ---------------- SAFETY ----------------
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ---------------- GITHUB FUNCTIONS ----------------
async function loadFromGitHub(path) {
    try {
        const res = await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path
        });

        return JSON.parse(
            Buffer.from(res.data.content, "base64").toString()
        );
    } catch {
        return [];
    }
}

async function saveToGitHub(path, data) {
    let sha;

    try {
        const res = await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path
        });

        sha = res.data.sha;
    } catch {}

    await octokit.repos.createOrUpdateFileContents({
        owner: OWNER,
        repo: REPO,
        path,
        message: "bot update",
        content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
        sha
    });
}

// wrappers
const getShop = () => loadFromGitHub(SHOP_FILE);
const getOrders = () => loadFromGitHub(ORDERS_FILE);
const saveShop = (d) => saveToGitHub(SHOP_FILE, d);
const saveOrders = (d) => saveToGitHub(ORDERS_FILE, d);

// ---------------- XML PATHS ----------------
const EVENTS_PATH = "./custom/shopevents.xml";
const SPAWNS_PATH = "./custom/cfgeventspawns.xml";

// ---------------- INIT ----------------
function ensureFiles() {
    if (!fs.existsSync("./custom")) fs.mkdirSync("./custom");
}

// ---------------- XML BUILDER ----------------
function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

async function buildXML() {
    const orders = await getOrders();

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
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>${events.join("")}</events>`);

    fs.writeFileSync(SPAWNS_PATH,
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>${spawns.join("")}</eventposdef>`);

    await saveOrders(orders);

    console.log("XML BUILT + STATUS UPDATED");
}

// ---------------- COMMANDS ----------------
const commands = [

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

    new SlashCommandBuilder().setName("additem").setDescription("Add item"),
    new SlashCommandBuilder()
        .setName("removeitem")
        .setDescription("Remove item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item").setAutocomplete(true).setRequired(true)
        ),

    new SlashCommandBuilder().setName("shop").setDescription("View shop"),
    new SlashCommandBuilder().setName("orders").setDescription("View orders"),
    new SlashCommandBuilder().setName("queue").setDescription("Queue orders"),
    new SlashCommandBuilder().setName("build").setDescription("Build XML"),
    new SlashCommandBuilder().setName("cycle").setDescription("Complete cycle"),
    new SlashCommandBuilder().setName("status").setDescription("Status"),
    new SlashCommandBuilder().setName("listcommands").setDescription("Commands list")
];

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
}

// ---------------- READY ----------------
client.once("clientReady", () => {
    ensureFiles();
    console.log(`Logged in as ${client.user.tag}`);
});

// ---------------- MAIN ----------------
client.on("interactionCreate", async (interaction) => {

    ensureFiles();

    // AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused();
        const shop = await getShop();

        return interaction.respond(
            shop
                .filter(i =>
                    i.displayName.toLowerCase().includes(focused.toLowerCase())
                )
                .slice(0, 5)
                .map(i => ({
                    name: `${i.displayName} ($${i.price})`,
                    value: i.id
                }))
        );
    }

    // ---------------- COMMANDS ----------------
    if (!interaction.isChatInputCommand()) return;

    // SHOP
    if (interaction.commandName === "shop") {
        const shop = await getShop();
        return interaction.reply({
            content: shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n") || "Empty",
            flags: 64
        });
    }

    // BUY
    if (interaction.commandName === "buy") {

        const shop = await getShop();
        const item = shop.find(i => i.id === interaction.options.getString("item"));

        if (!item)
            return interaction.reply({ content: "Item not found", flags: 64 });

        const orders = await getOrders();

        orders.push({
            id: Date.now(),
            itemType: item.type,
            displayName: item.displayName,
            x: interaction.options.getInteger("x"),
            z: interaction.options.getInteger("z"),
            status: "pending"
        });

        await saveOrders(orders);

        return interaction.reply({
            content: `Added ${item.displayName} @ ${interaction.options.getInteger("x")},${interaction.options.getInteger("z")}`,
            flags: 64
        });
    }

    // QUEUE
    if (interaction.commandName === "queue") {
        const orders = await getOrders();
        let moved = 0;

        for (const o of orders) {
            if (o.status === "pending") {
                o.status = "queued";
                moved++;
            }
        }

        await saveOrders(orders);

        return interaction.reply({ content: `Queued ${moved}`, flags: 64 });
    }

    // BUILD
    if (interaction.commandName === "build") {
        await buildXML();
        return interaction.reply({ content: "XML built", flags: 64 });
    }

    // CYCLE
    if (interaction.commandName === "cycle") {
        const orders = await getOrders();
        let done = 0;

        for (const o of orders) {
            if (o.status === "built") {
                o.status = "completed";
                done++;
            }
        }

        await saveOrders(orders);

        return interaction.reply({ content: `Completed ${done}`, flags: 64 });
    }

    // STATUS
    if (interaction.commandName === "status") {
        const orders = await getOrders();

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

    // COMMAND LIST
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
/status`,
            flags: 64
        });
    }

});

// ---------------- START ----------------
register().then(() => client.login(process.env.DISCORD_TOKEN));
