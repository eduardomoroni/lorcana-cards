// Image validation module
// Validates image dimensions, format, integrity, and checks for missing pairs

import fs from "fs";
import sharp from "sharp";
import path from "path";

export interface ValidationResult {
  filePath: string;
  valid: boolean;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  error?: string;
}

export interface CardValidation {
  cardNumber: string;
  webp?: ValidationResult;
  avif?: ValidationResult;
  hasBothFormats: boolean;
  isValid: boolean;
}

export interface ValidationReport {
  set: string;
  language: string;
  totalCards: number;
  validCards: number;
  invalidCards: number;
  missingCards: number;
  missingWebP: number;
  missingAvif: number;
  invalidDimensions: number;
  corruptedFiles: number;
  cards: CardValidation[];
  timestamp: string;
}

const TARGET_DIMENSIONS = {
  width: 734,
  height: 1024,
};

/**
 * Validate a single image file
 */
export async function validateImage(
  filePath: string
): Promise<ValidationResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        filePath,
        valid: false,
        error: "File does not exist",
      };
    }

    const stats = fs.statSync(filePath);
    const metadata = await sharp(filePath).metadata();

    const isValidDimensions =
      metadata.width === TARGET_DIMENSIONS.width &&
      metadata.height === TARGET_DIMENSIONS.height;

    return {
      filePath,
      valid: isValidDimensions,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: stats.size,
      error: isValidDimensions
        ? undefined
        : `Invalid dimensions: ${metadata.width}x${metadata.height} (expected ${TARGET_DIMENSIONS.width}x${TARGET_DIMENSIONS.height})`,
    };
  } catch (error) {
    return {
      filePath,
      valid: false,
      error: `Corrupted or invalid file: ${(error as Error).message}`,
    };
  }
}

/**
 * Find all card numbers that should exist in a set
 * Based on existing files and expected range
 */
function findExpectedCards(
  setDir: string,
  expectedRange?: { start: number; end: number }
): string[] {
  const cardNumbers = new Set<string>();

  // Find existing cards
  if (fs.existsSync(setDir)) {
    const files = fs.readdirSync(setDir);
    for (const file of files) {
      const match = file.match(/^(\d+)\.(webp|avif|jpg|png)$/);
      if (match) {
        cardNumbers.add(match[1]);
      }
    }
  }

  // Add expected range if provided
  if (expectedRange) {
    for (let i = expectedRange.start; i <= expectedRange.end; i++) {
      cardNumbers.add(String(i).padStart(3, "0"));
    }
  }

  return Array.from(cardNumbers).sort();
}

/**
 * Validate a card (both WebP and AVIF)
 */
export async function validateCard(
  setDir: string,
  cardNumber: string
): Promise<CardValidation> {
  const webpPath = path.join(setDir, `${cardNumber}.webp`);
  const avifPath = path.join(setDir, `${cardNumber}.avif`);

  const webpExists = fs.existsSync(webpPath);
  const avifExists = fs.existsSync(avifPath);

  let webpResult: ValidationResult | undefined;
  let avifResult: ValidationResult | undefined;

  if (webpExists) {
    webpResult = await validateImage(webpPath);
  }

  if (avifExists) {
    avifResult = await validateImage(avifPath);
  }

  const hasBothFormats = webpExists && avifExists;
  const isValid =
    hasBothFormats &&
    webpResult?.valid === true &&
    avifResult?.valid === true;

  return {
    cardNumber,
    webp: webpResult,
    avif: avifResult,
    hasBothFormats,
    isValid,
  };
}

/**
 * Validate all cards in a set
 */
export async function validateSet(
  rootFolder: string,
  set: string,
  language: string,
  expectedRange?: { start: number; end: number },
  onProgress?: (current: number, total: number, cardNumber: string) => void
): Promise<ValidationReport> {
  const setDir = path.join(rootFolder, language, set);
  const cardNumbers = findExpectedCards(setDir, expectedRange);

  const cardValidations: CardValidation[] = [];
  let validCards = 0;
  let invalidCards = 0;
  let missingCards = 0;
  let missingWebP = 0;
  let missingAvif = 0;
  let invalidDimensions = 0;
  let corruptedFiles = 0;

  for (let i = 0; i < cardNumbers.length; i++) {
    const cardNumber = cardNumbers[i];

    if (onProgress) {
      onProgress(i + 1, cardNumbers.length, cardNumber);
    }

    const validation = await validateCard(setDir, cardNumber);
    cardValidations.push(validation);

    if (validation.isValid) {
      validCards++;
    } else {
      invalidCards++;

      // Count specific issues
      if (!validation.webp && !validation.avif) {
        missingCards++;
      } else {
        if (!validation.webp) {
          missingWebP++;
        }
        if (!validation.avif) {
          missingAvif++;
        }
      }

      if (validation.webp && !validation.webp.valid) {
        if (validation.webp.error?.includes("Invalid dimensions")) {
          invalidDimensions++;
        } else if (validation.webp.error?.includes("Corrupted")) {
          corruptedFiles++;
        }
      }

      if (validation.avif && !validation.avif.valid) {
        if (validation.avif.error?.includes("Invalid dimensions")) {
          invalidDimensions++;
        } else if (validation.avif.error?.includes("Corrupted")) {
          corruptedFiles++;
        }
      }
    }
  }

  return {
    set,
    language,
    totalCards: cardNumbers.length,
    validCards,
    invalidCards,
    missingCards,
    missingWebP,
    missingAvif,
    invalidDimensions,
    corruptedFiles,
    cards: cardValidations,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get cards that need fixing
 */
export function getCardsNeedingFix(
  report: ValidationReport
): CardValidation[] {
  return report.cards.filter((card) => !card.isValid);
}

/**
 * Get missing cards
 */
export function getMissingCards(report: ValidationReport): string[] {
  return report.cards
    .filter((card) => !card.webp && !card.avif)
    .map((card) => card.cardNumber);
}

/**
 * Save validation report to file
 */
export function saveReport(
  report: ValidationReport,
  outputPath?: string
): string {
  const filename =
    outputPath ||
    `validation-report-${report.set}-${report.language}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

/**
 * Print validation summary to console
 */
export function printSummary(report: ValidationReport): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 Validation Summary");
  console.log("=".repeat(60));
  console.log(`Set:                   ${report.set}`);
  console.log(`Language:              ${report.language}`);
  console.log(`Total cards:           ${report.totalCards}`);
  console.log(`Valid cards:           ${report.validCards}`);
  console.log(`Invalid cards:         ${report.invalidCards}`);
  console.log(`Missing cards:         ${report.missingCards}`);
  console.log(`Missing WebP only:     ${report.missingWebP}`);
  console.log(`Missing AVIF only:     ${report.missingAvif}`);
  console.log(`Invalid dimensions:    ${report.invalidDimensions}`);
  console.log(`Corrupted files:       ${report.corruptedFiles}`);
  console.log("=".repeat(60));

  if (report.invalidCards === 0) {
    console.log("\n✅ All images are valid!");
  } else {
    console.log(`\n⚠️  Found ${report.invalidCards} issues`);
  }
}

