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
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("casino:label:roulette")
      .setLabel("Roulette")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

async function handleCasinoInteraction(interaction) {
  if (interaction.isButton()) {
    const id = String(interaction.customId || "");

    if (id === "casino:roulette:play") {
      return roulette.openPrivateSession(interaction);
    }

    if (id === "casino:roulette:amount") {
      return roulette.handleAmountButton(interaction);
    }

    if (id === "casino:roulette:bet") {
      return roulette.handleBetButton(interaction);
    }

    if (id === "casino:roulette:spin") {
      return roulette.handleSpin(interaction);
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "casino:roulette:betselect") {
      return roulette.handleBetSelect(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "casino:roulette:amountmodal") {
      return roulette.handleAmountModal(interaction);
    }
  }

  return false;
}

module.exports = {
  createCasinoEmbed,
  createCasinoRow,
  handleCasinoInteraction
};
