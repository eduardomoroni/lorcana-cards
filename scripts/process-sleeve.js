const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const joinImages = require("join-images").joinImages;

// Directory containing images
const imagesDir = path.join(
  __dirname,
  "../public/assets/images/sleeves/process",
);

// Output directories for converted images
const outputDirAvif = path.join(
  __dirname,
  "..//public/assets/images/sleeves/sleeves-avif",
);
const outputDirWebp = path.join(
  __dirname,
  "../public/assets/images/sleeves/sleeves-webp",
);

const trimOptions = {
  background: "white",
  threshold: 0,
  lineArt: false,
};

if (!fs.existsSync(outputDirAvif)) fs.mkdirSync(outputDirAvif);
if (!fs.existsSync(outputDirWebp)) fs.mkdirSync(outputDirWebp);

fs.readdir(imagesDir, (err, files) => {
  if (err) throw err;

  files.forEach(async (file) => {
    if (file.includes(".gitkeep")) return;

    try {
      const inputPath = path.join(imagesDir, file);
      console.log(`Processing file ${inputPath} ...`);
      const outputPathAvif = path.join(
        outputDirAvif,
        path.parse(file).name + ".avif",
      );
      const outputPathWebp = path.join(
        outputDirWebp,
        path.parse(file).name + ".webp",
      );

      // Convert to Avif
      await sharp(inputPath)
        .trim(trimOptions)
        .resize(734, 1024)
        .toFormat("avif", { quality: 100 })
        .toFile(outputPathAvif, (err, info) => {
          if (err) console.error(`Error processing ${file} to AVIF:`, err);
          else console.log(`Processed ${file} to AVIF:`, info);
        });

      // Convert to WebP
      await sharp(inputPath)
        .trim(trimOptions)
        .resize(734, 1024)
        .toFormat("webp", { quality: 100 })
        .toFile(outputPathWebp, (err, info) => {
          if (err) console.error(`Error processing ${file} to WebP:`, err);
          else console.log(`Processed ${file} to WebP:`, info);
        });

      await crop(outputPathAvif, true);
      await crop(outputPathWebp, true);
    } catch (err) {
      console.error(`Error resizing image ${file}:`, err);
    }
  });
});

function crop(file, artOnly) {
  console.log("cropping: " + file);
  const number = 0.943;

  const top = sharp(file)
    .metadata()
    .then(function (metadata) {
      // Calculate the height range to keep (50% to 90%)
      const startHeight = Math.floor(0);

      const endHeight = Math.floor(
        metadata.height * (artOnly ? 1 - number : 1 - 0.925),
      );

      // Perform the crop operation
      return sharp(file)
        .extract({
          left: 0,
          top: startHeight,
          width: metadata.width,
          height: endHeight - startHeight,
        })
        .toFile(file.replace(".webp", "_top.webp"));
    });

  const middle = sharp(file)
    .metadata()
    .then(function (metadata) {
      const imageMiddle =
        Math.floor(metadata.height / 3) + Math.floor(metadata.height * 0.05);
      const cropSize = Math.floor(metadata.height * 0.2382);

      const startHeight = imageMiddle - cropSize;
      const endHeight = imageMiddle + cropSize;

      // Perform the crop operation
      return sharp(file)
        .extract({
          left: 0,
          top: startHeight,
          width: metadata.width,
          height: endHeight - startHeight,
        })
        .toFile(file.replace(".webp", "_middle.webp"));
    });

  const bottom = sharp(file)
    .metadata()
    .then(function (metadata) {
      const startHeight = Math.floor(
        metadata.height * (artOnly ? number : 0.925),
      );
      const endHeight = Math.floor(metadata.height);

      // Perform the crop operation
      return sharp(file)
        .extract({
          left: 0,
          top: startHeight,
          width: metadata.width,
          height: endHeight - startHeight,
        })
        .toFile(file.replace(".webp", "_bottom.webp"));
    });

  return Promise.all([top, middle, bottom]).then(() => {
    joinImages(
      [
        file.replace(".webp", "_top.webp"),
        file.replace(".webp", "_middle.webp"),
        file.replace(".webp", "_bottom.webp"),
      ],
      { direction: "vertical" },
    )
      .then((img) => {
        img.toFile(file.replace(".webp", "-square.webp"));
        console.log("cropped: " + file);
      })
      .then(() => {
        // Delete the top and bottom images
        fs.unlinkSync(file.replace(".webp", "_top.webp"));
        fs.unlinkSync(file.replace(".webp", "_middle.webp"));
        fs.unlinkSync(file.replace(".webp", "_bottom.webp"));
      });
  });
}
