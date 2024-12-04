const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Directory containing images
const imagesDir = path.join(
  __dirname,
  "../public/assets/images/playmats/process",
);

// Output directories for converted images
const outputDirAvif = path.join(
  __dirname,
  "../public/assets/images/playmats-avif",
);
const outputDirWebp = path.join(
  __dirname,
  "../public/assets/images/playmats-webp",
);

if (!fs.existsSync(outputDirAvif)) fs.mkdirSync(outputDirAvif);
if (!fs.existsSync(outputDirWebp)) fs.mkdirSync(outputDirWebp);

fs.readdir(imagesDir, (err, files) => {
  if (err) throw err;

  files.forEach((file) => {
    const inputPath = path.join(imagesDir, file);
    const outputPathAvif = path.join(
      outputDirAvif,
      path.parse(file).name + ".avif",
    );
    const outputPathWebp = path.join(
      outputDirWebp,
      path.parse(file).name + ".webp",
    );

    const trimOptions = {
      background: "white",
      threshold: 0,
      lineArt: false,
    };

    // Convert to AVIF
    sharp(inputPath)
      .trim(trimOptions)
      .resize(1047, 590)
      .toFormat("avif", { quality: 100 })
      .toFile(outputPathAvif, (err, info) => {
        if (err) console.error(`Error processing ${file} to AVIF:`, err);
        else console.log(`Processed ${file} to AVIF:`, info);
      });

    // Convert to WebP
    sharp(inputPath)
      .trim(trimOptions)
      .resize(1047, 590)
      .toFormat("webp", { quality: 100 })
      .toFile(outputPathWebp, (err, info) => {
        if (err) console.error(`Error processing ${file} to WebP:`, err);
        else console.log(`Processed ${file} to WebP:`, info);
      });
  });
});
