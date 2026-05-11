const { REST, Routes, ApplicationCommandOptionType, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();

if (!process.env.DISCORD_TOKEN) {
  console.error("[FATAL] DISCORD_TOKEN missing");
  process.exit(1);
}

if (!process.env.GUILD_ID) {
  console.error("[FATAL] GUILD_ID missing");
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error("[FATAL] CLIENT_ID missing");
  process.exit(1);
}

// ✅ This is your current command list with:
//    - /shop, /account, /shopstatus, /shopreload, /eventfeed, /killfeed, /serverstate removed
const commands = [
  { name: "shophelp", description: "Show shop and economy help commands" },
  { name: "shoplist", description: "List all shop items" },

  {
    name: "shopbuyitem",
    description: "Buy an item from the shop",
    options: [
      { name: "item", type: ApplicationCommandOptionType.String, description: "Item name", required: true, autocomplete: true },
      { name: "quantity", type: ApplicationCommandOptionType.Integer, description: "Quantity", required: true },
      { name: "x", type: ApplicationCommandOptionType.Integer, description: "X coordinate", required: true },
      { name: "y", type: ApplicationCommandOptionType.Integer, description: "Y coordinate", required: true },
      { name: "z", type: ApplicationCommandOptionType.Integer, description: "Z coordinate", required: true },
      {
        name: "method",
        type: ApplicationCommandOptionType.String,
        description: "Purchase method",
        required: false,
        choices: [
          { name: "Wallet", value: "wallet" },
          { name: "Bank", value: "bank" }
        ]
      }
    ]
  },

  { name: "balance", description: "Show your wallet and bank balance" },

  {
    name: "deposit",
    description: "Move money from your wallet to your bank",
    options: [
      { name: "amount", type: ApplicationCommandOptionType.Integer, description: "Amount to deposit", required: true }
    ]
  },
  {
    name: "withdraw",
    description: "Move money from your bank to your wallet",
    options: [
      { name: "amount", type: ApplicationCommandOptionType.Integer, description: "Amount to withdraw", required: true }
    ]
  },
  {
    name: "send",
    description: "Send money to another member",
    options: [
      { name: "member", type: ApplicationCommandOptionType.User, description: "Member to send money to", required: true },
      { name: "amount", type: ApplicationCommandOptionType.Integer, description: "Amount to send", required: true }
    ]
  },

  { name: "leaderboard", description: "Show the richest players in the server" },
  { name: "daily", description: "Claim your daily reward" },
  { name: "info", description: "Show bot and economy info (combined commands and status)" },

  {
    name: "addmoney",
    description: "Add money to a member’s wallet",
    options: [
      { name: "member", type: ApplicationCommandOptionType.User, description: "The member to give money to", required: true },
      { name: "amount", type: ApplicationCommandOptionType.Integer, description: "Amount to add", required: true }
    ]
  },
  {
    name: "removemoney",
    description: "Remove money from a member’s wallet",
    options: [
      { name: "member", type: ApplicationCommandOptionType.User, description: "The member to remove money from", required: true },
      { name: "amount", type: ApplicationCommandOptionType.Integer, description: "Amount to remove", required: true }
    ]
  },
  {
    name: "resetuser",
    description: "Reset a member’s wallet and bank to zero",
    options: [
      { name: "member", type: ApplicationCommandOptionType.User, description: "The member to reset", required: true }
    ]
  },

  {
    name: "shopadditem",
    description: "Add a new item to the shop",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true },
      { name: "type", type: ApplicationCommandOptionType.String, description: "Item type", required: true },
      { name: "price", type: ApplicationCommandOptionType.Integer, description: "Item price", required: true }
    ]
  },
  {
    name: "shopeditprice",
    description: "Change the price of an item",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true, autocomplete: true },
      { name: "price", type: ApplicationCommandOptionType.Integer, description: "New price", required: true }
    ]
  },
  {
    name: "shopremoveitem",
    description: "Remove an item from the shop",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true }
    ]
  },

  { name: "whereami", description: "Show your latest known location" },
  {
    name: "linkgamertag",
    description: "Link your in‑game gamer tag to your Discord account",
    options: [
      { name: "gamertag", type: ApplicationCommandOptionType.String, description: "Exact in‑game account name", required: true }
    ]
  },

  {
    name: "radaradd",
    description: "Add a player radar in this channel",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Radar name", required: true },
      { name: "x", type: ApplicationCommandOptionType.Number, description: "X coordinate", required: true },
      { name: "z", type: ApplicationCommandOptionType.Number, description: "Z coordinate", required: true },
      {
        name: "radius",
        type: ApplicationCommandOptionType.Integer,
        description: "Radar radius",
        required: true,
        choices: [
          { name: "100m", value: 100 },
          { name: "200m", value: 200 },
          { name: "300m", value: 300 },
          { name: "400m", value: 400 },
          { name: "500m", value: 500 }
        ]
      }
    ]
  },
  {
    name: "radarremove",
    description: "Remove a player radar",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Radar name", required: true }
    ]
  },
  { name: "radarview", description: "View all player radars" },
  {
    name: "radaradmin",
    description: "Add or remove radar admins",
    options: [
      {
        name: "action",
        type: ApplicationCommandOptionType.String,
        description: "Add or remove admin",
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "remove", value: "remove" }
        ]
      },
      { name: "name", type: ApplicationCommandOptionType.String, description: "Radar name", required: true },
      { name: "user", type: ApplicationCommandOptionType.User, description: "User to add or remove", required: true }
    ]
  },
  {
    name: "radarignore",
    description: "Add or remove ignored players",
    options: [
      {
        name: "action",
        type: ApplicationCommandOptionType.String,
        description: "Add or remove ignored player",
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "remove", value: "remove" },
          { name: "list", value: "list" }
        ]
      },
      { name: "name", type: ApplicationCommandOptionType.String, description: "Radar name", required: true },
      { name: "player", type: ApplicationCommandOptionType.String, description: "Player name", required: false }
    ]
  },

  {
    name: "reactionrolecreate",
    description: "Create a reaction role button",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      { name: "message", type: ApplicationCommandOptionType.String, description: "Embed title and button label", required: true },
      { name: "role", type: ApplicationCommandOptionType.Role, description: "Role to assign on click", required: true }
    ]
  },

  { name: "serverrestart", description: "Run the JSON build, upload, and restart process now" },

  // <<< ✅ ADD ROULETTE SETUP COMMAND HERE >>> ///
  { name: "addroulette", description: "Create a Roulette game panel in this channel" }
];

async function main() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("[DISCORD] Registering guild commands...");
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log(`[DISCORD] Commands registered successfully: ${data.length}`);
  } catch (err) {
    console.error("[COMMAND REGISTER ERROR]", err);
    process.exit(1);
  }
}

main();
