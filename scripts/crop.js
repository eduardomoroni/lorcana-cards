// Make sure you've downloaded the assets
// next step is to convert.js the images to avif format
// git clean -f -X -e '*_top.webp' -e '*_bottom.webp' sometimes is needed

const sharp = require("sharp");
const joinImages = require("join-images").joinImages;
const fs = require("fs");
const path = require("path");
const { rootFolder, languages, edition } = require("./shared.js");

async function program(language, artOnly) {
  const sourceFolder = `${rootFolder}/${language}/${edition}/`;
  const destinationFolder = artOnly
    ? `${rootFolder}/${edition}/art_only/`
    : sourceFolder + "art_and_name/";

  fs.readdirSync(sourceFolder).forEach((file) => {
    if (!fs.existsSync(destinationFolder)) {
      fs.mkdirSync(destinationFolder);
    }

    if (
      file.endsWith(".webp") &&
      !file.endsWith("_top.webp") &&
      !file.endsWith("_bottom.webp") &&
      !file.endsWith(".avif")
    ) {
      const sourceFile = path.join(sourceFolder, file);
      const destinationFile = path.join(destinationFolder, file);

      fs.copyFile(sourceFile, destinationFile, (err) => {
        if (err) {
          console.error(`Error copying file ${file}:`, err);
        } else {
          console.log(`File ${file} copied successfully.`);
          crop(destinationFile, artOnly);
        }
      });
    }
  });
}

function crop(file, artOnly) {
  console.log("cropping: " + file);

  const top = sharp(file)
    .metadata()
    .then(function (metadata) {
      // Calculate the height range to keep (50% to 90%)
      const startHeight = Math.floor(0);
      const endHeight = Math.floor(metadata.height * (artOnly ? 0.52 : 0.674));

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

  const bottom = sharp(file)
    .metadata()
    .then(function (metadata) {
      const startHeight = Math.floor(
        metadata.height * (artOnly ? 0.931 : 0.925),
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

  return Promise.all([top, bottom]).then(() => {
    joinImages(
      [
        file.replace(".webp", "_top.webp"),
        file.replace(".webp", "_bottom.webp"),
      ],
      { direction: "vertical" },
    )
      .then((img) => {
        img.toFile(file);
        console.log("cropped: " + file);
      })
      .then(() => {
        // Delete the top and bottom images
        fs.unlinkSync(file.replace(".webp", "_top.webp"));
        fs.unlinkSync(file.replace(".webp", "_bottom.webp"));
      });
  });
}

function deleteFilesRecursively(folder) {
  fs.readdirSync(folder).forEach((item) => {
    const itemPath = path.join(folder, item);

    console.log(`Checking item: ${itemPath}`);

    if (fs.statSync(itemPath).isDirectory()) {
      console.log(`Deleting files in the directory: ${itemPath}`);
      deleteFilesRecursively(itemPath);
    } else if (item.endsWith("_top.webp") || item.endsWith("_bottom.webp")) {
      fs.unlinkSync(itemPath);
      console.log(`Deleted file: ${itemPath}`);
    }
  });
}

async function main() {


  languages.forEach((language) => {
    program(language, false);
  });

  await deleteFilesRecursively(rootFolder);
}

main();