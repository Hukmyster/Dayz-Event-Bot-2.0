const fs = require("fs");
const path = require("path");
const { buildAllXML } = require("./xmlBuilder");
const shop = require("./modules/shop");

async function deploy() {
  const orders = shop.getOrders();
  const xml = await buildAllXML(orders);

  const out = path.join(__dirname, "custom");
  if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

  fs.writeFileSync(path.join(out, "shopevents.xml"), xml.eventsXML);
  fs.writeFileSync(path.join(out, "eventposdef.xml"), xml.posXML);

  return "Deployed XML successfully";
}

module.exports = {
  deploy
};
