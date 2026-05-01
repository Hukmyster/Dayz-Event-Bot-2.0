const shop = require("../modules/shop");

async function buildAllXML() {
  const xml = shop.buildXML();

  return {
    shopEvents: xml.eventsXML,
    shopPositions: xml.positionsXML
  };
}

module.exports = {
  buildAllXML
};
