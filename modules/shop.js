const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

const db = require("../services/db");
const xml = require("./xml");

// --- SHOW MODAL ---
function showAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("add_item_modal")
    .setTitle("Add Shop Item");

  const name = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Display Name")
    .setStyle(TextInputStyle.Short);

  const type = new TextInputBuilder()
    .setCustomId("type")
    .setLabel("Type (types.xml name)")
    .setStyle(TextInputStyle.Short);

  modal.addComponents(
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(type)
  );

  return interaction.showModal(modal);
}

// --- HANDLE MODAL ---
function handleModal(interaction) {
  if (interaction.customId !== "add_item_modal") return;

  const name = interaction.fields.getTextInputValue("name");
  const type = interaction.fields.getTextInputValue("type");

  const shop = db.getShop();
  shop.push({ name, type });

  db.saveShop(shop);

  return interaction.reply({
    content: `Added ${name} (${type})`,
    flags: 64
  });
}

// --- AUTOCOMPLETE ---
function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();

  const shop = db.getShop();

  const choices = shop
    .filter(i => i.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(i => ({
      name: i.name,
      value: i.name
    }));

  return interaction.respond(choices);
}

// --- BUY ---
function buy(interaction) {
  const itemName = interaction.options.getString("item");
  const x = interaction.options.getInteger("x");
  const z = interaction.options.getInteger("z");
  const quantity = interaction.options.getInteger("quantity") || 1;

  const shop = db.getShop();
  const item = shop.find(i => i.name === itemName);

  if (!item) {
    return interaction.reply({ content: "Item not found", flags: 64 });
  }

  const orders = db.getOrders();

  orders.push({
    id: Date.now(),
    type: item.type,
    x,
    z,
    quantity
  });

  db.saveOrders(orders);

  return interaction.reply({
    content: `Ordered ${quantity}x ${item.name}`,
    flags: 64
  });
}

// --- VIEW XML ---
function viewXML(interaction) {
  const orders = db.getOrders();
  const built = xml.buildXML(orders);

  return interaction.reply({
    content: "```xml\n" + built.eventsXML + "\n```",
    flags: 64
  });
}

module.exports = {
  showAddModal,
  handleModal,
  autocomplete,
  buy,
  viewXML
};
