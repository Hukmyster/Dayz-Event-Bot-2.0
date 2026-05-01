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

// ---------------- CACHE SYSTEM (FIX) ----------------
let shopCache = [];
let ordersCache = [];
let lastLoad = 0;
const CACHE_TTL = 5000;

// ---------------- SAFETY ----------------
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

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

// ---------------- CACHE GETTERS (FIX) ----------------
async function getShop() {
    if (Date.now() - lastLoad > CACHE_TTL) {
        shopCache = await loadFromGitHub(SHOP_FILE);
        lastLoad = Date.now();
    }
    return shopCache;
}

async function getOrders() {
    if (Date.now() - lastLoad > CACHE_TTL) {
        ordersCache = await loadFromGitHub(ORDERS_FILE);
        lastLoad = Date.now();
    }
    return ordersCache;
}

// ---------------- CACHE SAVERS ----------------
async function saveShop(data) {
    shopCache = data;
    await saveToGitHub(SHOP_FILE, data);
}

async function saveOrders(data) {
    ordersCache = data;
    await saveToGitHub(ORDERS_FILE, data);
}

// ---------------- READY ----------------
client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ---------------- COMMANDS ----------------
client.on("interactionCreate", async (interaction) => {

    if (!interaction.isChatInputCommand()) return;

    // ================= SHOP =================
    if (interaction.commandName === "shop") {

        await interaction.deferReply({ ephemeral: true });

        const shop = await getShop();

        return interaction.editReply({
            content: shop.length
                ? shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
                : "Shop is empty"
        });
    }

    // ================= BUY =================
    if (interaction.commandName === "buy") {

        await interaction.deferReply({ ephemeral: true });

        const shop = await getShop();
        const itemId = interaction.options.getString("item");
        const item = shop.find(i => i.id === itemId);

        if (!item)
            return interaction.editReply("Item not found");

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

        return interaction.editReply(
            `Added ${item.displayName} @ ${interaction.options.getInteger("x")},${interaction.options.getInteger("z")}`
        );
    }

    // ================= ADD ITEM =================
    if (interaction.commandName === "additem") {

        await interaction.deferReply({ ephemeral: true });

        const shop = await getShop();

        const item = {
            id: Date.now().toString(),
            type: "m4",
            displayName: "M4 Rifle",
            price: 3500
        };

        shop.push(item);

        await saveShop(shop);

        return interaction.editReply("Item added");
    }

    // ================= REMOVE ITEM =================
    if (interaction.commandName === "removeitem") {

        await interaction.deferReply({ ephemeral: true });

        const shop = await getShop();
        const id = interaction.options.getString("item");

        const newShop = shop.filter(i => i.id !== id);

        await saveShop(newShop);

        return interaction.editReply("Item removed");
    }

    // ================= ORDERS =================
    if (interaction.commandName === "orders") {

        await interaction.deferReply({ ephemeral: true });

        const orders = await getOrders();

        return interaction.editReply(
            orders.map(o => `• ${o.displayName} [${o.status}]`).join("\n") || "No orders"
        );
    }

    // ================= QUEUE =================
    if (interaction.commandName === "queue") {

        await interaction.deferReply({ ephemeral: true });

        const orders = await getOrders();
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

    // ================= BUILD XML =================
    if (interaction.commandName === "build") {

        await interaction.deferReply({ ephemeral: true });

        const orders = await getOrders();

        let events = [];
        let spawns = [];

        for (const o of orders) {

            if (o.status !== "queued") continue;

            const name = `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 999)}`;

            events.push(`
<event name="${name}">
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
<event name="${name}">
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

        return interaction.editReply("XML built");
    }

    // ================= STATUS =================
    if (interaction.commandName === "status") {

        await interaction.deferReply({ ephemeral: true });

        const orders = await getOrders();

        const count = s => orders.filter(o => o.status === s).length;

        return interaction.editReply(
`Pending: ${count("pending")}
Queued: ${count("queued")}
Built: ${count("built")}
Completed: ${count("completed")}`
        );
    }

});

// ---------------- REGISTER COMMANDS ----------------
const commands = [
    new SlashCommandBuilder().setName("shop").setDescription("View shop"),
    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item ID").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X coord").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z coord").setRequired(true)
        ),

    new SlashCommandBuilder().setName("additem").setDescription("Add item"),
    new SlashCommandBuilder()
        .setName("removeitem")
        .setDescription("Remove item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item ID").setRequired(true)
        ),

    new SlashCommandBuilder().setName("orders").setDescription("View orders"),
    new SlashCommandBuilder().setName("queue").setDescription("Queue orders"),
    new SlashCommandBuilder().setName("build").setDescription("Build XML"),
    new SlashCommandBuilder().setName("status").setDescription("System status")
];

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

// ---------------- START ----------------
register().then(() => client.login(process.env.DISCORD_TOKEN));
