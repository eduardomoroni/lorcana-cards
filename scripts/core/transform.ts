// Image transformation module
// Converts images to WebP and AVIF at target dimensions

import fs from "fs";
import sharp from "sharp";
import path from "path";

export interface TransformOptions {
  width?: number;
  height?: number;
  webpQuality?: number;
  avifQuality?: number;
  webpEffort?: number;
  avifSpeed?: number;
}

export interface TransformResult {
  success: boolean;
  webpPath?: string;
  avifPath?: string;
  error?: string;
}

const DEFAULT_OPTIONS: Required<TransformOptions> = {
  width: 734,
  height: 1024,
  webpQuality: 80,
  avifQuality: 75,
  webpEffort: 6,
  avifSpeed: 5,
};

/**
 * Transform a single image to WebP and AVIF formats
 */
export async function transformImage(
  inputPath: string,
  outputDir: string,
  baseName: string,
  options: TransformOptions = {}
): Promise<TransformResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const webpPath = path.join(outputDir, `${baseName}.webp`);
    const avifPath = path.join(outputDir, `${baseName}.avif`);

    const image = sharp(inputPath);

    // Create WebP version
    await image
      .clone()
      .resize(opts.width, opts.height, {
        fit: "fill",
        withoutEnlargement: false,
      })
      .webp({
        quality: opts.webpQuality,
        effort: opts.webpEffort,
      })
      .toFile(webpPath);

    // Create AVIF version
    await image
      .clone()
      .resize(opts.width, opts.height, {
        fit: "fill",
        withoutEnlargement: false,
      })
      .avif({
        quality: opts.avifQuality,
        speed: opts.avifSpeed,
      })
      .toFile(avifPath);

    return {
      success: true,
      webpPath,
      avifPath,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if both WebP and AVIF files already exist
 */
export function checkTransformExists(
  outputDir: string,
  baseName: string
): boolean {
  const webpPath = path.join(outputDir, `${baseName}.webp`);
  const avifPath = path.join(outputDir, `${baseName}.avif`);
  return fs.existsSync(webpPath) && fs.existsSync(avifPath);
}

/**
 * Transform a downloaded card image
 */
export async function transformCard(
  sourcePath: string,
  outputDir: string,
  cardNumber: string,
  options: TransformOptions = {},
  skipExisting: boolean = true
): Promise<TransformResult> {
  // Check if already transformed
  if (skipExisting && checkTransformExists(outputDir, cardNumber)) {
    return {
      success: true,
      webpPath: path.join(outputDir, `${cardNumber}.webp`),
      avifPath: path.join(outputDir, `${cardNumber}.avif`),
    };
  }

  return transformImage(sourcePath, outputDir, cardNumber, options);
}

/**
 * Cleanup source file after transformation
 */
export function cleanupSource(sourcePath: string): void {
  if (fs.existsSync(sourcePath)) {
    fs.unlinkSync(sourcePath);
  }
}

/**
 * Cleanup JPG files if WebP and AVIF exist
 */
export function cleanupJpgFiles(directory: string): {
  deleted: number;
  skipped: number;
} {
  const stats = {
    deleted: 0,
    skipped: 0,
  };

  if (!fs.existsSync(directory)) {
    return stats;
  }

  const files = fs.readdirSync(directory);

  for (const file of files) {
    if (!file.toLowerCase().endsWith(".jpg") && !file.toLowerCase().endsWith(".jpeg")) {
      continue;
    }

    const filePath = path.join(directory, file);
    const basePath = filePath.replace(/\.(jpg|jpeg)$/i, "");

    // Check if converted versions exist
    if (
      fs.existsSync(`${basePath}.webp`) &&
      fs.existsSync(`${basePath}.avif`)
    ) {
      try {
        fs.unlinkSync(filePath);
        stats.deleted++;
      } catch (error) {
        console.error(`Error deleting ${file}:`, error);
        stats.skipped++;
      }
    } else {
      stats.skipped++;
    }
  }

  return stats;
}

/**
 * Batch transform multiple images
 */
export async function transformCards(
  cards: Array<{ sourcePath: string; cardNumber: string }>,
  outputDir: string,
  options: TransformOptions = {},
  skipExisting: boolean = true,
  onProgress?: (
    current: number,
    total: number,
    cardNumber: string
  ) => void
): Promise<TransformResult[]> {
  const results: TransformResult[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    if (onProgress) {
      onProgress(i + 1, cards.length, card.cardNumber);
    }

    const result = await transformCard(
      card.sourcePath,
      outputDir,
      card.cardNumber,
      options,
      skipExisting
    );
    results.push(result);
  }

  return results;
}

/**
 * Get image metadata
 */
export async function getImageInfo(filePath: string): Promise<{
  width: number;
  height: number;
  format: string;
  size: number;
} | null> {
  try {
    const metadata = await sharp(filePath).metadata();
    const stats = fs.statSync(filePath);
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || "unknown",
      size: stats.size,
    };
  } catch (error) {
    return null;
  }
}

