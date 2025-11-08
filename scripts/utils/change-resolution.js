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
  const files = fs.readdirSync(sourceFolder);
  console.log("Reading files from " + sourceFolder + " total files: " + files.length);

  for (const file of files) {
    const dir = sourceFolder;
    console.log("Processing file " + file);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    if (file.endsWith(".webp") || file.endsWith(".avif")) {
      const original = path.join(sourceFolder, file);
      const copy = path.join(sourceFolder, file.replace(".webp", "_2x.webp").replace(".avif", "_2x.avif"));

      const image = await sharp(original);
      const sourceMetadata = await image.metadata();

      const dimentions = {
        width: 734,
        height: 1024,
      }

      if (original.includes("/art_only/")) {
        dimentions.width = 734;
        dimentions.height = 603;
      }

      if (original.includes("/art_and_name/")) {
        dimentions.width = 734;
        dimentions.height = 767;
      }

      if (sourceMetadata.width === dimentions.width || sourceMetadata.height === dimentions.height) {
        console.log(`Image ${original} is already ${dimentions.width}x${dimentions.height} Skipping.`);
        continue;
      }

      if (!fs.existsSync(copy)) {
        try {
          fs.copyFileSync(original, copy);
          console.log(`File ${original} copied successfully.`);
        } catch (err) {
          console.error(`Error copying file ${original}:`, err);
        }
      }
      try {
        await resizeImage(copy, original, dimentions);
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
async function resizeImage(from, to, dimentions) {
  console.log(`resizing ${from} ...`);

  const resize = await sharp(from)
    .resize(dimentions.width, dimentions.height)
    .toFile(to)
    .catch(function (err) {
      console.log("Error resizing image: ", from);
      console.log(err);
    });

  return resize;
}

program();
