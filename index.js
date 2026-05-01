const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const { Octokit } = require("@octokit/rest");
require("dotenv").config();

// ---------------- DISCORD ----------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ---------------- GITHUB ----------------
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const [OWNER, REPO] = process.env.GITHUB_REPO.split("/");

const SHOP_FILE = "database/shop.json";
const ORDERS_FILE = "database/orders.json";

// ---------------- MEMORY CACHE (CRITICAL FIX) ----------------
let shopCache = [];
let ordersCache = [];
let lastSync = 0;
const SYNC_INTERVAL = 8000; // 8 seconds (prevents GitHub spam)

// ---------------- SAFE INIT ----------------
function ensureLocal() {
    if (!fs.existsSync("./custom")) fs.mkdirSync("./custom");
}

// ---------------- GITHUB LOAD ----------------
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

// ---------------- GITHUB SAVE ----------------
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

// ---------------- BACKGROUND SYNC (NOT BLOCKING COMMANDS) ----------------
async function syncFromGitHub() {
    try {
        shopCache = await loadFromGitHub(SHOP_FILE);
        ordersCache = await loadFromGitHub(ORDERS_FILE);
        lastSync = Date.now();
    } catch (err) {
        console.error("Sync error:", err);
    }
}

async function saveShop(data) {
    shopCache = data;
    await saveToGitHub(SHOP_FILE, data);
}

async function saveOrders(data) {
    ordersCache = data;
    await saveToGitHub(ORDERS_FILE, data);
}

// ---------------- FAST ACCESSORS ----------------
function getShop() {
    return shopCache;
}

function getOrders() {
    return ordersCache;
}

// ---------------- XML BUILDER ----------------
function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

async function buildXML() {
    const orders = getOrders();

    let events = [];
    let spawns = [];

    for (const o of orders) {

        if (o.status !== "queued") continue;

        const eventName = makeEventName();

        events.push(`
<event name="${eventName}">
<nominal>1</nominal><min>1</min><max>1</max>
<lifetime>11000</lifetime><restock>0</restock>
<saferadius>0</saferadius><distanceradius>0</distanceradius>
<cleanupradius>0</cleanupradius>
<flags deletable="0" init_random="0" remove_damaged="1"/>
<position>fixed</position>
<limit>child</limit>
<active>1</active>
<children>
<child lootmax="0" lootmin="0" max="1" min="1" type="${o.itemType}"/>
</children>
</event>`);

        spawns.push(`
<event name="${eventName}">
<pos x="${o.x}" z="${o.z}" a="0"/>
</event>`);

        o.status = "built";
    }

    fs.writeFileSync("./custom/shopevents.xml",
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>${events.join("")}</events>`);

    fs.writeFileSync("./custom/cfgeventspawns.xml",
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>${spawns.join("")}</eventposdef>`);

    await saveOrders(orders);

    console.log("XML BUILT");
}

// ---------------- COMMANDS ----------------
const commands = [
    new SlashCommandBuilder().setName("shop").setDescription("View shop"),

    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item ID").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z").setRequired(true)
        ),

    new SlashCommandBuilder().setName("additem").setDescription("Add item"),
    new SlashCommandBuilder().setName("removeitem").setDescription("Remove item"),
    new SlashCommandBuilder().setName("orders").setDescription("View orders"),
    new SlashCommandBuilder().setName("queue").setDescription("Queue orders"),
    new SlashCommandBuilder().setName("build").setDescription("Build XML"),
    new SlashCommandBuilder().setName("status").setDescription("System status")
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

// ---------------- START SYNC LOOP ----------------
setInterval(syncFromGitHub, SYNC_INTERVAL);

// initial load
syncFromGitHub();

// ---------------- READY ----------------
client.once("clientReady", () => {
    ensureLocal();
    console.log(`Logged in as ${client.user.tag}`);
});

// ---------------- INTERACTIONS ----------------
client.on("interactionCreate", async (interaction) => {

    ensureLocal();

    // ================= SHOP =================
    if (interaction.commandName === "shop") {
        await interaction.deferReply({ ephemeral: true });

        const shop = getShop();

        return interaction.editReply(
            shop.length
                ? shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
                : "Shop empty"
        );
    }

    // ================= BUY =================
    if (interaction.commandName === "buy") {
        await interaction.deferReply({ ephemeral: true });

        const shop = getShop();
        const item = shop.find(i => i.id === interaction.options.getString("item"));

        if (!item)
            return interaction.editReply("Item not found");

        const orders = getOrders();

        orders.push({
            id: Date.now(),
            itemType: item.type,
            displayName: item.displayName,
            x: interaction.options.getInteger("x"),
            z: interaction.options.getInteger("z"),
            status: "pending"
        });

        await saveOrders(orders);

        return interaction.editReply(`Added ${item.displayName}`);
    }

    // ================= ADD ITEM =================
    if (interaction.commandName === "additem") {
        await interaction.deferReply({ ephemeral: true });

        const shop = getShop();

        shop.push({
            id: Date.now().toString(),
            type: "m4",
            displayName: "M4 Rifle",
            price: 3500
        });

        await saveShop(shop);

        return interaction.editReply("Item added");
    }

    // ================= REMOVE ITEM =================
    if (interaction.commandName === "removeitem") {
        await interaction.deferReply({ ephemeral: true });

        const shop = getShop();

        const newShop = shop.slice(1);

        await saveShop(newShop);

        return interaction.editReply("Item removed");
    }

    // ================= ORDERS =================
    if (interaction.commandName === "orders") {
        await interaction.deferReply({ ephemeral: true });

        const orders = getOrders();

        return interaction.editReply(
            orders.map(o => `• ${o.displayName} [${o.status}]`).join("\n") || "No orders"
        );
    }

    // ================= QUEUE =================
    if (interaction.commandName === "queue") {
        await interaction.deferReply({ ephemeral: true });

        const orders = getOrders();

        let moved = 0;

        for (const o of orders) {
            if (o.status === "pending") {
                o.status = "queued";
                moved++;
            }
        }

        await saveOrders(orders);

        return interaction.editReply(`Queued ${moved}`);
    }

    // ================= BUILD =================
    if (interaction.commandName === "build") {
        await interaction.deferReply({ ephemeral: true });

        await buildXML();

        return interaction.editReply("XML built");
    }

    // ================= STATUS =================
    if (interaction.commandName === "status") {
        await interaction.deferReply({ ephemeral: true });

        const orders = getOrders();

        const count = s => orders.filter(o => o.status === s).length;

        return interaction.editReply(
`Pending: ${count("pending")}
Queued: ${count("queued")}
Built: ${count("built")}
Completed: ${count("completed")}`
        );
    }

});

// ---------------- START ----------------
register().then(() => client.login(process.env.DISCORD_TOKEN));
