const fs = require("fs");
const path = require("path");

function ensure(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([]));
}

function read(file) {
  ensure(file);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function write(file, data) {
  ensure(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {
  read,
  write
};
