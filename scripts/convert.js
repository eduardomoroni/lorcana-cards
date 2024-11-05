// Make sure you ran crop.js before running this script
// Next and final script is change-resolution.js

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { languages, edition, rootFolder } = require("./shared.js");

const dirs = [
  `${rootFolder}/${edition}/art_only/`, // given the card is art_only, we do not store one for each language
];
languages.forEach((language) => {
  dirs.push(`${rootFolder}/${language}/${edition}/`);
  dirs.push(`${rootFolder}/${language}/${edition}/art_and_name/`);
});

try {
  dirs.forEach((sourceFolder) => {
    fs.readdir(sourceFolder, async (err, files) => {
      console.log(
        "Found " + files.length + " files. Converting now, please be patient..",
      );

      for (const file of files) {
        const filePath = path.join(sourceFolder, file);
        if (fs.statSync(filePath).isDirectory()) {
          console.log("Skipping directory " + filePath);
          continue;
        }

        if (fs.existsSync(filePath.replace(".webp", ".avif"))) {
          console.log("Already converted skipping file " + filePath);
          continue;
        }

        if (filePath.endsWith(".avif") || filePath.endsWith("_2x.webp")) {
          console.log("Skipping file " + filePath);
          continue;
        }

        if (file.endsWith(".webp") && !file.endsWith("_2x.webp")) {
          await convert();
          return;
        }

        async function convert() {
          console.log("Converting: " + filePath);
          await sharp(sourceFolder + file)
            .avif({ quality: 50, speed: 1 })
            .toFile(sourceFolder + path.parse(file).name + ".avif");
        }

        console.log("Skipping file " + filePath);
      }
    });
  });
} catch (e) {
  console.error("Error converting files: ", e);
}
