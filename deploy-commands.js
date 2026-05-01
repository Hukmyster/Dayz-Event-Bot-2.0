const { REST, Routes, ApplicationCommandOptionType } = require("discord.js");
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

const commands = [
  { name: "shop", description: "Alias for shophelp" },
  { name: "shoplist", description: "List all shop items" },
  {
    name: "shopbuyitem",
    description: "Buy an item from the shop",
    options: [
      { name: "item", type: ApplicationCommandOptionType.String, description: "Item name", required: true, autocomplete: true },
      { name: "quantity", type: ApplicationCommandOptionType.Integer, description: "Quantity", required: true },
      { name: "x", type: ApplicationCommandOptionType.Integer, description: "X coordinate", required: true },
      { name: "z", type: ApplicationCommandOptionType.Integer, description: "Z coordinate", required: true }
    ]
  },
  {
    name: "shopadditem",
    description: "Add a new item to the shop",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true },
      { name: "type", type: ApplicationCommandOptionType.String, description: "DayZ type name", required: true },
      { name: "price", type: ApplicationCommandOptionType.Integer, description: "Price", required: true }
    ]
  },
  {
    name: "shopremoveitem",
    description: "Remove an item from the shop",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true }
    ]
  },
  {
    name: "shopeditprice",
    description: "Change the price of an item",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true },
      { name: "price", type: ApplicationCommandOptionType.Integer, description: "New price", required: true }
    ]
  },
  {
    name: "shopeditname",
    description: "Rename an item",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Current item display name", required: true },
      { name: "newname", type: ApplicationCommandOptionType.String, description: "New display name", required: true }
    ]
  },
  { name: "shopqueue", description: "View queued purchases" },
  { name: "shopclearqueue", description: "Clear queued purchases" },
  { name: "shopbuildxml", description: "Build the XML files" },
  { name: "shopviewxml", description: "View the built XML in Discord" },
  { name: "shoppushxml", description: "Push the built XML to the output folder" },
  { name: "shophelp", description: "List all shop commands" },
  { name: "shopstatus", description: "Show bot and shop status" },
  { name: "shopreload", description: "Reload shop data from disk" }
];

async function main() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("[DISCORD] Registering guild commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log("[DISCORD] Commands registered successfully.");
  } catch (err) {
    console.error("[COMMAND REGISTER ERROR]", err);
    process.exit(1);
  }
}

main();
