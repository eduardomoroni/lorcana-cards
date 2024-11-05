const path = require("path");
const fs = require("fs");
const { downloadImage } = require("./download.js");

// In this script I try to do all the image manipulation in one script

// First I will check card cards are missing images
const setNumber = "006";
const pathToCards = path.join(
  __dirname,
  `../../../simulator/engine/src/cards/${setNumber}/index.ts`,
);

const all006Cards = require(pathToCards);
const allCards = all006Cards.all006Cards.map((card) => card.number);
const cardsMissingImages = allCards.filter(
  (card) =>
    !fs.existsSync(
      path.join(
        __dirname,
        `../../../card-database/public/assets/images/cards/EN/${setNumber}/${card}.webp`,
      ),
    ),
);

for (const card of cardsMissingImages) {
  await downloadImage(card, "en", setNumber);
}

console.log(cardsMissingImages);
