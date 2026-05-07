const { Client, GatewayIntentBits, Events } = require("discord.js");
require("dotenv").config();

const killfeed = require("./modules/killfeed");
const eventfeed = require("./modules/eventfeed");
const serverstate = require("./modules/serverstate");
const playerradars = require("./modules/playerradars");
const logger = require("./utils/logger");
const debug = require("./utils/debug");
const { handleInteraction } = require("./indexcommands");

if (typeof debug.initGlobal === "function") {
  debug.initGlobal();
}

if (!process.env.DISCORD_TOKEN) {
  console.error("[FATAL] DISCORD_TOKEN missing");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const feedState = {
  killfeedStarted: false,
  eventfeedStarted: false,
  serverstateStarted: false,
  playerradarsStarted: false
};

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  debug.start("startup", { bot: client.user.tag });
  console.log("[DISCORD] Bot is ready. Commands are handled from Discord now.");

  if (!feedState.killfeedStarted) {
    killfeed.start();
    feedState.killfeedStarted = true;
  }
  console.log("[KILLFEED] module started");

  if (!feedState.eventfeedStarted) {
    eventfeed.start();
    feedState.eventfeedStarted = true;
  }
  console.log("[EVENTFEED] module started");

  if (!feedState.serverstateStarted) {
    serverstate.start();
    feedState.serverstateStarted = true;
  }
  console.log("[SERVERSTATE] module started");

  if (!feedState.playerradarsStarted) {
    playerradars.init(client);
    feedState.playerradarsStarted = true;
  }
  console.log("[PLAYERRADARS] module started");
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.guild) return;
    return handleInteraction(interaction);
  } catch (err) {
    logger.error("INTERACTION ERROR", err);
    debug.fail(interaction.commandName || "unknown", err, {
      user: interaction.user?.tag
    });
    return interaction.reply({ content: "Error executing interaction.", ephemeral: true }).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
