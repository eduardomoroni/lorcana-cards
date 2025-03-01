const sharp = require("sharp");
const fs = require("fs");
const { edition, languages, rootFolder } = require("./shared.js");
const path = require("path");

const dirs = [
  `${rootFolder}/${edition}/art_only/`, // given the card is art_only, we do not store one for each language
];
languages.forEach((language) => {
  dirs.push(`${rootFolder}/${language}/${edition}/`);
  dirs.push(`${rootFolder}/${language}/${edition}/art_and_name/`);
});

async function program() {
for (const sourceFolder of dirs) {
  console.log("Reading files from " + sourceFolder);
  const files = fs.readdirSync(sourceFolder);

  for (const file of files) {
    const dir = sourceFolder;
console.log("Processing file " + file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    if (file.endsWith(".webp") && !file.endsWith("_2x.webp")) {
      const original = path.join(sourceFolder, file);
      const copy = path.join(sourceFolder, file.replace(".webp", "_2x.webp"));

      const image = await sharp(original);
      const sourceMetadata = await image.metadata();

      if (sourceMetadata.width === 734 || sourceMetadata.height === 1024) {
        console.log(`Image ${original} is already 734x1024. Skipping.`);
        return;
      }

      if (!fs.existsSync(copy)) {
        fs.copyFileSync(original, copy, (err) => {
          if (err) {
            console.error(`Error copying file ${original}:`, err);
          } else {
            console.log(`File ${original} copied successfully.`);
          }
        });
      }
      try {
        await resizeImage(copy, original);
      } catch (err) {
        console.error(`Error resizing image ${copy}:`, err);
      }

      fs.unlinkSync(copy, (err) => {
        if (err) {
          console.error(`Error deleting file ${copy}:`, err);
        } else {
          console.log(`File ${copy} deleted successfully.`);
        }
      });
    }
  }
}
}


// I'd like to use sharp JS to change image's resolution
// taking half of height and half of width
async function resizeImage(from, to) {
  console.log(`resizing ${from} ...`);

  const resize = await image
    .resize(Math.round(734), Math.round(1024))
    .toFile(to)
    .catch(function (err) {
      console.log("Error resizing image: ", from);
      console.log(err);
    });

  return resize;
}

program();
