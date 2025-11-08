// Image cropping module
// Creates art-only and art+name variants from full card images

import fs from "fs";
import sharp from "sharp";
import { joinImages } from "join-images";
import path from "path";

export interface CropResult {
  success: boolean;
  artOnlyPath?: string;
  artAndNamePath?: string;
  error?: string;
}

export interface CropDimensions {
  artOnly: {
    expectedHeight: number;
    topPercent: number;
    bottomStartPercent: number;
  };
  artAndName: {
    expectedHeight: number;
    topPercent: number;
    bottomStartPercent: number;
  };
}

// Standard dimensions for 734x1024 source images
const CROP_CONFIG: CropDimensions = {
  artOnly: {
    expectedHeight: 603, // Actual cropped height from testing
    topPercent: 0.52,
    bottomStartPercent: 0.931,
  },
  artAndName: {
    expectedHeight: 767, // Actual cropped height from testing
    topPercent: 0.674,
    bottomStartPercent: 0.925,
  },
};

/**
 * Crop a single image into art-only or art+name variant
 */
async function cropImage(
  sourceFile: string,
  destinationFile: string,
  artOnly: boolean
): Promise<void> {
  const config = artOnly ? CROP_CONFIG.artOnly : CROP_CONFIG.artAndName;
  const metadata = await sharp(sourceFile).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions");
  }

  const topHeight = Math.floor(metadata.height * config.topPercent);
  const bottomStart = Math.floor(metadata.height * config.bottomStartPercent);
  const bottomHeight = metadata.height - bottomStart;

  // Create temporary files
  const topFile = destinationFile.replace(/\.(webp|avif)$/, "_top.$1");
  const bottomFile = destinationFile.replace(/\.(webp|avif)$/, "_bottom.$1");

  try {
    // Extract top portion
    await sharp(sourceFile)
      .extract({
        left: 0,
        top: 0,
        width: metadata.width,
        height: topHeight,
      })
      .toFile(topFile);

    // Extract bottom portion
    await sharp(sourceFile)
      .extract({
        left: 0,
        top: bottomStart,
        width: metadata.width,
        height: bottomHeight,
      })
      .toFile(bottomFile);

    // Join the two portions
    const joined = await joinImages([topFile, bottomFile], {
      direction: "vertical",
    });

    await joined.toFile(destinationFile);

    // Clean up temporary files
    fs.unlinkSync(topFile);
    fs.unlinkSync(bottomFile);
  } catch (error) {
    // Clean up temp files on error
    if (fs.existsSync(topFile)) fs.unlinkSync(topFile);
    if (fs.existsSync(bottomFile)) fs.unlinkSync(bottomFile);
    throw error;
  }
}

/**
 * Create both art-only and art+name variants for a card
 */
export async function cropCard(
  sourceWebpPath: string,
  sourceAvifPath: string,
  outputDir: string,
  cardNumber: string,
  set: string,
  language: string
): Promise<CropResult> {
  try {
    // Verify source files exist
    if (!fs.existsSync(sourceWebpPath) || !fs.existsSync(sourceAvifPath)) {
      return {
        success: false,
        error: "Source files not found",
      };
    }

    // Create output directories
    const artOnlyDir = path.join(
      outputDir.replace(`/${language}/${set}`, `/${set}/art_only`)
    );
    const artAndNameDir = path.join(outputDir, "art_and_name");

    if (!fs.existsSync(artOnlyDir)) {
      fs.mkdirSync(artOnlyDir, { recursive: true });
    }
    if (!fs.existsSync(artAndNameDir)) {
      fs.mkdirSync(artAndNameDir, { recursive: true });
    }

    // Define output paths
    const artOnlyWebp = path.join(artOnlyDir, `${cardNumber}.webp`);
    const artOnlyAvif = path.join(artOnlyDir, `${cardNumber}.avif`);
    const artAndNameWebp = path.join(artAndNameDir, `${cardNumber}.webp`);
    const artAndNameAvif = path.join(artAndNameDir, `${cardNumber}.avif`);

    // Crop art-only variants
    await cropImage(sourceWebpPath, artOnlyWebp, true);
    await cropImage(sourceAvifPath, artOnlyAvif, true);

    // Crop art+name variants
    await cropImage(sourceWebpPath, artAndNameWebp, false);
    await cropImage(sourceAvifPath, artAndNameAvif, false);

    return {
      success: true,
      artOnlyPath: artOnlyWebp,
      artAndNamePath: artAndNameWebp,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if cropped versions exist
 */
export function croppedVersionsExist(
  rootFolder: string,
  set: string,
  language: string,
  cardNumber: string
): {
  artOnly: { webp: boolean; avif: boolean };
  artAndName: { webp: boolean; avif: boolean };
} {
  const artOnlyDir = path.join(rootFolder, set, "art_only");
  const artAndNameDir = path.join(rootFolder, language, set, "art_and_name");

  return {
    artOnly: {
      webp: fs.existsSync(path.join(artOnlyDir, `${cardNumber}.webp`)),
      avif: fs.existsSync(path.join(artOnlyDir, `${cardNumber}.avif`)),
    },
    artAndName: {
      webp: fs.existsSync(path.join(artAndNameDir, `${cardNumber}.webp`)),
      avif: fs.existsSync(path.join(artAndNameDir, `${cardNumber}.avif`)),
    },
  };
}

/**
 * Get expected dimensions for cropped images
 */
export function getExpectedCroppedDimensions(): {
  artOnly: { width: number; height: number };
  artAndName: { width: number; height: number };
} {
  return {
    artOnly: {
      width: 734,
      height: CROP_CONFIG.artOnly.expectedHeight,
    },
    artAndName: {
      width: 734,
      height: CROP_CONFIG.artAndName.expectedHeight,
    },
  };
}

/**
 * Batch crop multiple cards
 */
export async function cropCards(
  cards: Array<{
    sourceWebpPath: string;
    sourceAvifPath: string;
    cardNumber: string;
  }>,
  outputDir: string,
  set: string,
  language: string,
  onProgress?: (current: number, total: number, cardNumber: string) => void
): Promise<CropResult[]> {
  const results: CropResult[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    if (onProgress) {
      onProgress(i + 1, cards.length, card.cardNumber);
    }

    const result = await cropCard(
      card.sourceWebpPath,
      card.sourceAvifPath,
      outputDir,
      card.cardNumber,
      set,
      language
    );
    results.push(result);
  }

  return results;
}

