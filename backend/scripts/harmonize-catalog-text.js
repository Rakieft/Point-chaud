const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const db = require("../config/db");

const textFixes = [
  ["locations", "name", "Route FrÃ¨res", "Route Frères"],
  ["locations", "address", "Route FrÃ¨res, Port-au-Prince", "Route Frères, Port-au-Prince"],
  ["locations", "name", "PÃ©tion-Ville", "Pétion-Ville"],
  ["locations", "address", "PÃ©tion-Ville", "Pétion-Ville"],
  ["categories", "name", "PÃ¢tÃ©", "Pâté"],
  ["categories", "name", "Cafe & boissons chaudes", "Café & boissons chaudes"],
  ["categories", "name", "Pates", "Pâtés"],
  ["categories", "name", "Extras / Complements", "Extras / Compléments"],
  ["products", "name", "PÃ¢tÃ© poulet", "Pâté poulet"],
  ["products", "description", "PÃ¢tÃ© chaud", "Pâté chaud"],
  ["products", "name", "SÃ²s pwa ak diri blan", "Sòs pwa ak diri blan"],
  ["products", "name", "S?s pwa ak diri blan", "Sòs pwa ak diri blan"],
  ["products", "name", "Bouillon haÃ¯tien", "Bouillon haïtien"],
  ["products", "name", "Bouillon ha?tien", "Bouillon haïtien"],
  ["products", "name", "Cafe", "Café"],
  ["products", "name", "The", "Thé"],
  ["products", "name", "Gateau", "Gâteau"],
  ["products", "name", "Banane pesee", "Banane pesée"],
  ["products", "name", "Pate boeuf", "Pâté boeuf"],
  ["products", "name", "Pate hareng", "Pâté hareng"],
  ["products", "name", "Pate hot-dog", "Pâté hot-dog"],
  ["products", "name", "Pate poulet", "Pâté poulet"],
  ["products", "description", "Jus d orange naturel", "Jus d'orange naturel"],
  ["products", "description", "Boisson malta energisante", "Boisson Malta énergisante"],
  ["products", "description", "Burger classique avec boeuf et salade", "Burger classique avec bœuf et salade"],
  ["products", "description", "Cafe noir chaud", "Café noir chaud"],
  ["products", "description", "The chaud parfume", "Thé chaud parfumé"],
  ["products", "description", "Biscuit sucre ou sale", "Biscuit sucré ou salé"],
  ["products", "description", "Supplement fromage", "Supplément fromage"],
  ["products", "description", "Accras epices et croustillants", "Accras épicés et croustillants"],
  ["products", "description", "Banane plantee frite", "Banane plantain frite"],
  ["products", "description", "Part de gateau du jour", "Part de gâteau du jour"],
  ["products", "description", "Morceaux de poulet frit bien assaisonnes", "Morceaux de poulet frit bien assaisonnés"],
  ["products", "description", "Pain chaud fraichement sorti du four", "Pain chaud fraîchement sorti du four"],
  ["products", "description", "Pain ideal pour sandwichs et garnitures", "Pain idéal pour sandwichs et garnitures"],
  ["products", "description", "Pate haitien au boeuf", "Pâté haïtien au bœuf"],
  ["products", "description", "Pate haitien au hareng", "Pâté haïtien au hareng"],
  ["products", "description", "Pate fourre au hot-dog", "Pâté fourré au hot-dog"],
  ["products", "description", "Pate haitien au poulet", "Pâté haïtien au poulet"],
  ["products", "description", "Pizza au poulet assaisonne", "Pizza au poulet assaisonné"],
  ["products", "description", "Plat chaud riz accompagne de hareng", "Plat chaud de riz accompagné de hareng"],
  ["products", "description", "Plat chaud riz accompagne de poulet", "Plat chaud de riz accompagné de poulet"],
  ["products", "description", "Spaghetti sauce tomate et epices", "Spaghetti sauce tomate et épices"]
];

async function deleteTemporaryCatalogData() {
  await db.query(
    "DELETE FROM categories WHERE name IN ('Test Cat Temp', 'Juzzler') AND id NOT IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL)"
  );
  await db.query("DELETE FROM products WHERE name = 'Juzzler'");
}

async function main() {
  for (const [table, column, from, to] of textFixes) {
    await db.query(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [to, from]);
  }

  await deleteTemporaryCatalogData();

  console.log("Harmonisation du catalogue terminee");
}

main()
  .then(async () => {
    await db.end();
    process.exit(0);
  })
  .catch(async error => {
    console.error(error.message);
    await db.end();
    process.exit(1);
  });
