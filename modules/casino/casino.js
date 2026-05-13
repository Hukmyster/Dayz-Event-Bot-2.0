const roulette = require("./roulette");
const sessionStore = require("./sessionStore");

async function handleCasinoInteraction(interaction) {
  const id = String(interaction.customId || "");

  if (interaction.isButton()) {
    if (id === "casino:roulette:play") {
      return roulette.openPrivateSession(interaction);
    }

    if (id.startsWith("casino:roulette:setbet:")) {
      return roulette.handleSetBet(interaction);
    }

    if (id.startsWith("casino:roulette:spin:")) {
      return roulette.handleSpin(interaction);
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (id.startsWith("casino:roulette:bettype:")) {
      return roulette.handleBetTypeSelect(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    if (id.startsWith("casino:roulette:betmodal:")) {
      return roulette.handleBetModalSubmit(interaction);
    }
  }

  return false;
}

module.exports = {
  handleCasinoInteraction,
  sessionStore
};
