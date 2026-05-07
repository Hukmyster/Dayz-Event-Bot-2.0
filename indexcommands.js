const { handleAutocomplete, handleButton, handleCommand } = require("./indexcommandscore");

async function handleInteraction(interaction) {
  if (interaction.isAutocomplete()) {
    return handleAutocomplete(interaction);
  }

  if (interaction.isButton()) {
    const handled = await handleButton(interaction);
    if (handled !== false) return handled;
  }

  if (!interaction.isChatInputCommand()) return;

  return handleCommand(interaction);
}

module.exports = { handleInteraction };
