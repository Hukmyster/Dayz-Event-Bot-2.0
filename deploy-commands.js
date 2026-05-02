const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');
require('dotenv').config();

if (!process.env.DISCORD_TOKEN) {
  console.error('[FATAL] DISCORD_TOKEN missing');
  process.exit(1);
}

if (!process.env.GUILD_ID) {
  console.error('[FATAL] GUILD_ID missing');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('[FATAL] CLIENT_ID missing');
  process.exit(1);
}

const commands = [
  { name: 'shop', description: 'Alias for shophelp' },
  { name: 'shoplist', description: 'List all shop items' },
  {
    name: 'shopbuyitem',
    description: 'Buy an item from the shop',
    options: [
      { name: 'item', type: ApplicationCommandOptionType.String, description: 'Item name', required: true, autocomplete: true },
      { name: 'quantity', type: ApplicationCommandOptionType.Integer, description: 'Quantity', required: true },
      { name: 'x', type: ApplicationCommandOptionType.Integer, description: 'X coordinate', required: true },
      { name: 'z', type: ApplicationCommandOptionType.Integer, description: 'Z coordinate', required: true }
    ]
  },
  {
    name: 'shopadditem',
    description: 'Add a new item to the shop',
    options: [
      { name: 'name', type: ApplicationCommandOptionType.String, description: 'Item display name', required: true },
      { name: 'type', type: ApplicationCommandOptionType.String, description: 'DayZ type name', required: true },
      { name: 'price', type: ApplicationCommandOptionType.Integer, description: 'Price', required: true }
    ]
  },
  {
    name: 'shopremoveitem',
    description: 'Remove an item from the shop',
    options: [
      { name: 'name', type: ApplicationCommandOptionType.String, description: 'Item display name', required: true }
    ]
  },
  {
    name: 'shopeditprice',
    description: 'Change the price of an item',
    options: [
      { name: 'name', type: ApplicationCommandOptionType.String, description: 'Item display name', required: true },
      { name: 'price', type: ApplicationCommandOptionType.Integer, description: 'New price', required: true }
    ]
  },
  {
    name: 'shopeditname',
    description: 'Rename an item',
    options: [
      { name: 'name', type: ApplicationCommandOptionType.String, description: 'Current item display name', required: true },
      { name: 'newname', type: ApplicationCommandOptionType.String, description: 'New display name', required: true }
    ]
  },
  { name: 'shopqueue', description: 'View queued purchases' },
  { name: 'shopclearqueue', description: 'Clear queued purchases' },
  { name: 'shopbuildxml', description: 'Build the XML files' },
  { name: 'shopviewxml', description: 'View the built XML in Discord' },
  { name: 'shoppushxml', description: 'Push the built XML to the output folder' },
  { name: 'shophelp', description: 'List all shop commands' },
  { name: 'shopstatus', description: 'Show bot and shop status' },
  { name: 'shopreload', description: 'Reload shop data from disk' },

  { name: 'balance', description: 'Show your wallet and bank balance' },
  {
    name: 'deposit',
    description: 'Move money from your wallet to your bank',
    options: [
      { name: 'amount', type: ApplicationCommandOptionType.Integer, description: 'Amount to deposit', required: true }
    ]
  },
  {
    name: 'withdraw',
    description: 'Move money from your bank to your wallet',
    options: [
      { name: 'amount', type: ApplicationCommandOptionType.Integer, description: 'Amount to withdraw', required: true }
    ]
  },
  {
    name: 'send',
    description: 'Send money to another member',
    options: [
      { name: 'member', type: ApplicationCommandOptionType.User, description: 'Member to send money to', required: true },
      { name: 'amount', type: ApplicationCommandOptionType.Integer, description: 'Amount to send', required: true }
    ]
  },
  { name: 'leaderboard', description: 'Show the richest players in the server' },
  {
    name: 'account',
    description: 'Show your full economy account',
    options: [
      { name: 'member', type: ApplicationCommandOptionType.User, description: 'View another member’s account', required: false }
    ]
  },

  {
    name: 'addmoney',
    description: 'Add money to a member’s wallet',
    options: [
      { name: 'member', type: ApplicationCommandOptionType.User, description: 'The member to give money to', required: true },
      { name: 'amount', type: ApplicationCommandOptionType.Integer, description: 'Amount to add', required: true }
    ]
  },
  {
    name: 'removemoney',
    description: 'Remove money from a member’s wallet',
    options: [
      { name: 'member', type: ApplicationCommandOptionType.User, description: 'The member to remove money from', required: true },
      { name: 'amount', type: ApplicationCommandOptionType.Integer, description: 'Amount to remove', required: true }
    ]
  },
  {
    name: 'resetuser',
    description: 'Reset a member’s wallet and bank to zero',
    options: [
      { name: 'member', type: ApplicationCommandOptionType.User, description: 'The member to reset', required: true }
    ]
  }
];

async function main() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('[DISCORD] Registering guild commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('[DISCORD] Commands registered successfully.');
  } catch (err) {
    console.error('[COMMAND REGISTER ERROR]', err);
    process.exit(1);
  }
}

main();
