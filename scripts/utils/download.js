// First you download, then you crop

const fs = require("fs");
const client = require("https");
const { edition, languages, rootFolder } = require("./shared.js");

export async function program() {
  try {
    for (let i = 230; i <= 232; i++) {
      for (const language of languages) {
        await downloadImage(i, language, edition);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

const errors = []

export async function downloadImage(cardNumber, language, edition) {
  const cardNumberPadded = cardNumber.toString().padStart(3, "0");
  const editionPadded = edition.toString().padStart(3, "0");
  const url = `https://cdn.dreamborn.ink/images/${language.toLowerCase()}/cards/${editionPadded}-${cardNumberPadded}`;
  const destination = `${rootFolder}/${language.toUpperCase()}/${editionPadded}/${cardNumberPadded}.webp`;

  //if folder does not exist, create it
  const folder = destination.replace(/\/[^/]+$/, "");
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  if (fs.existsSync(destination)) {
    console.log(`File ${destination} already exists, skipping`);
  } else {
    // put errors in a log file
    await download(url, destination).catch(console.error);
  }

  if (errors.length) {
    fs.writeFileSync("errors.log", errors.join("\n"));
  }
}

function download(url, filepath) {
  console.log(`Downloading ${url} and saving to ${filepath}`);

  return new Promise((resolve, reject) => {
    client.get(url, (res) => {
      if (res.statusCode === 200) {
        res
          .pipe(fs.createWriteStream(filepath))
          .on("error", reject)
          .once("close", () => resolve(filepath));
      } else {
        // Consume response data to free up memory
        res.resume();
        console.log(`Downloading failed ${url}`);
        errors.push(url);
        reject(
          new Error(`Request Failed With a Status Code: ${res.statusCode}`),
        );
      }
    });
  });
}

program();
