const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const roulette = require("./roulette");

function createCasinoEmbed() {
  return new EmbedBuilder()
    .setTitle("🎲 Casino")
    .setDescription("🟢 Roulette")
    .setColor(0x000000);
}

function createCasinoRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("casino:roulette:play")
      .setLabel("Play")
      .setStyle(ButtonStyle.Success)
  );
}

async function handleCasinoInteraction(interaction) {
  const id = String(interaction.customId || "");

  if (interaction.isButton()) {
    if (id === "casino:roulette:play") return roulette.openPrivateSession(interaction);
    if (id === "casino:roulette:setbet") return roulette.handleSetBet(interaction);
    if (id === "casino:roulette:setchoice") return roulette.handleSetChoice(interaction);
    if (id === "casino:roulette:spin") return roulette.handleSpin(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (id === "casino:roulette:choicemenu") {
      return roulette.handleChoiceMenu(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    if (id === "casino:roulette:betmodal") {
      return roulette.handleBetModalSubmit(interaction);
    }
  }

  return false;
}

module.exports = {
  createCasinoEmbed,
  createCasinoRow,
  handleCasinoInteraction
};
