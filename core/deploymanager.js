const fs = require("fs");
const path = require("path");
const { buildAllXML } = require("./xmlBuilder");

async function deploy() {
  const xml = await buildAllXML();

  const out = path.join(__dirname, "../custom");

  if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

  fs.writeFileSync(`${out}/shopevents.xml`, xml.shopEvents);
  fs.writeFileSync(`${out}/eventposdef.xml`, xml.shopPositions);

  return "Deployed XML successfully";
}

module.exports = {
  deploy
};
