import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Image Transformation Pipeline
 * Converts an input image to both WebP and AVIF formats at 734x1024 resolution
 */

async function transformImage(inputPath, outputDir = null) {
  try {
    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }

    // Get file info
    const parsedPath = path.parse(inputPath);
    const outputDirectory = outputDir || parsedPath.dir;
    const baseName = parsedPath.name;

    // Ensure output directory exists
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }

    // Define target dimensions
    const targetDimensions = {
      width: 734,
      height: 1024
    };

    // Create output paths
    const webpPath = path.join(outputDirectory, `${baseName}.webp`);
    const avifPath = path.join(outputDirectory, `${baseName}.avif`);

    console.log(`Processing: ${inputPath}`);
    console.log(`Target resolution: ${targetDimensions.width}x${targetDimensions.height}`);

    // Load image and get metadata
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    console.log(`Original resolution: ${metadata.width}x${metadata.height}`);

    // Create WebP version
    console.log(`Creating WebP: ${webpPath}`);
    await image
      .clone()
      .resize(targetDimensions.width, targetDimensions.height, {
        fit: 'fill', // You can change this to 'cover', 'contain', 'inside', 'outside' as needed
        withoutEnlargement: false
      })
      .webp({
        quality: 80, // Adjust quality as needed
        effort: 6    // Compression effort (0-6, higher = better compression)
      })
      .toFile(webpPath);

    // Create AVIF version
    console.log(`Creating AVIF: ${avifPath}`);
    await image
      .clone()
      .resize(targetDimensions.width, targetDimensions.height, {
        fit: 'fill', // You can change this to 'cover', 'contain', 'inside', 'outside' as needed
        withoutEnlargement: false
      })
      .avif({
        quality: 50, // AVIF typically needs lower quality settings for good results
        speed: 1     // Compression speed (0-8, lower = better compression)
      })
      .toFile(avifPath);

    console.log(`✅ Transformation complete!`);
    console.log(`  WebP: ${webpPath}`);
    console.log(`  AVIF: ${avifPath}`);

    return {
      webp: webpPath,
      avif: avifPath,
      originalDimensions: { width: metadata.width, height: metadata.height },
      targetDimensions
    };

  } catch (error) {
    console.error(`❌ Error transforming image: ${error.message}`);
    throw error;
  }
}

/**
 * Process multiple images in a directory
 */
async function transformDirectory(inputDir, outputDir = null, filePattern = /\.(jpg|jpeg|png|webp|avif|tiff)$/i) {
  try {
    if (!fs.existsSync(inputDir)) {
      throw new Error(`Input directory does not exist: ${inputDir}`);
    }

    const files = fs.readdirSync(inputDir);
    const imageFiles = files.filter(file => filePattern.test(file));

    console.log(`Found ${imageFiles.length} image files to process in ${inputDir}`);

    const results = [];

    for (const file of imageFiles) {
      const inputPath = path.join(inputDir, file);

      // Skip if it's a directory
      if (fs.statSync(inputPath).isDirectory()) {
        continue;
      }

      try {
        const result = await transformImage(inputPath, outputDir);
        results.push({ file, success: true, result });
      } catch (error) {
        console.error(`Failed to process ${file}: ${error.message}`);
        results.push({ file, success: false, error: error.message });
      }
    }

    return results;

  } catch (error) {
    console.error(`❌ Error processing directory: ${error.message}`);
    throw error;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Image Transformation Pipeline
Usage:
  node image-transformation-pipeline.js <input-path> [output-directory]
  
  input-path: Path to image file or directory
  output-directory: Optional output directory (defaults to same as input)
  
Examples:
  node image-transformation-pipeline.js ./my-image.jpg
  node image-transformation-pipeline.js ./my-image.jpg ./output/
  node image-transformation-pipeline.js ./input-folder/ ./output/
    `);
    process.exit(1);
  }

  const inputPath = args[0];
  const outputDir = args[1] || null;

  (async () => {
    try {
      const stat = fs.statSync(inputPath);

      if (stat.isDirectory()) {
        console.log(`Processing directory: ${inputPath}`);
        const results = await transformDirectory(inputPath, outputDir);
        const successful = results.filter(r => r.success).length;
        console.log(`\n📊 Processing complete: ${successful}/${results.length} files processed successfully`);
      } else {
        console.log(`Processing single file: ${inputPath}`);
        await transformImage(inputPath, outputDir);
      }
    } catch (error) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
  })();
}

export {
  transformImage,
  transformDirectory
};
