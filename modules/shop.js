const db = require("../services/db");

function findItem(name) {
    return db.getShop().find(i => i.displayName === name);
}

module.exports = {
    findItem
};
