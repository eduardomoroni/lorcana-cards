// Auto-fix module
// Fixes issues found during validation
// Includes cropping to generate art-only and art+name variants

import fs from "fs";
import path from "path";
import {
  CardValidation,
  ValidationReport,
  getCardsNeedingFix,
  getMissingCards,
} from "./validate.js";
import { downloadCard, CardInfo } from "./download.js";
import { transformCard, cleanupSource } from "./transform.js";
import { cropCard } from "./crop.js";

export interface FixResult {
  cardNumber: string;
  success: boolean;
  action:
    | "downloaded"
    | "transformed"
    | "cropped"
    | "skipped"
    | "failed";
  error?: string;
  croppedVariants?: boolean;
}

export interface FixOptions {
  rootFolder: string;
  set: string;
  language: string;
  autoFix: boolean;
  verbose?: boolean;
}

/**
 * Fix a single card (including cropped variants)
 */
export async function fixCard(
  card: CardValidation,
  options: FixOptions
): Promise<FixResult> {
  const { rootFolder, set, language } = options;
  const outputDir = path.join(rootFolder, language, set);
  let croppedVariants = false;

  // Case 1: Both files missing - need to download and transform
  if (!card.webp && !card.avif) {
    const cardInfo: CardInfo = {
      set,
      cardNumber: card.cardNumber,
      language,
    };

    const downloadResult = await downloadCard(cardInfo, rootFolder, false);

    if (!downloadResult.success || !downloadResult.filePath) {
      return {
        cardNumber: card.cardNumber,
        success: false,
        action: "failed",
        error: downloadResult.error || "Download failed",
      };
    }

    // Transform downloaded file
    const transformResult = await transformCard(
      downloadResult.filePath,
      outputDir,
      card.cardNumber,
      {},
      false
    );

    // Cleanup source file
    cleanupSource(downloadResult.filePath);

    if (!transformResult.success) {
      return {
        cardNumber: card.cardNumber,
        success: false,
        action: "failed",
        error: transformResult.error,
      };
    }

    // Generate cropped variants
    await generateCroppedVariants(card, rootFolder, set, language);
    croppedVariants = true;

    return {
      cardNumber: card.cardNumber,
      success: true,
      action: "downloaded",
      croppedVariants,
    };
  }

  // Case 2: Only one format missing - need to transform from existing
  if (!card.webp || !card.avif) {
    const existingFile = card.webp
      ? path.join(outputDir, `${card.cardNumber}.webp`)
      : path.join(outputDir, `${card.cardNumber}.avif`);

    const transformResult = await transformCard(
      existingFile,
      outputDir,
      card.cardNumber,
      {},
      false
    );

    if (!transformResult.success) {
      return {
        cardNumber: card.cardNumber,
        success: false,
        action: "failed",
        error: transformResult.error,
      };
    }

    // Generate cropped variants if they're missing
    const needsCropping =
      (card.artOnly && !card.artOnly.isValid) ||
      (card.artAndName && !card.artAndName.isValid);
    if (needsCropping) {
      await generateCroppedVariants(card, rootFolder, set, language);
      croppedVariants = true;
    }

    return {
      cardNumber: card.cardNumber,
      success: true,
      action: "transformed",
      croppedVariants,
    };
  }

  // Case 3: Both exist but have invalid dimensions - re-download and transform
  if ((card.webp && !card.webp.valid) || (card.avif && !card.avif.valid)) {
    const cardInfo: CardInfo = {
      set,
      cardNumber: card.cardNumber,
      language,
    };

    const downloadResult = await downloadCard(cardInfo, rootFolder, false);

    if (!downloadResult.success || !downloadResult.filePath) {
      return {
        cardNumber: card.cardNumber,
        success: false,
        action: "failed",
        error: downloadResult.error || "Download failed",
      };
    }

    // Transform downloaded file
    const transformResult = await transformCard(
      downloadResult.filePath,
      outputDir,
      card.cardNumber,
      {},
      false
    );

    // Cleanup source file
    cleanupSource(downloadResult.filePath);

    if (!transformResult.success) {
      return {
        cardNumber: card.cardNumber,
        success: false,
        action: "failed",
        error: transformResult.error,
      };
    }

    // Generate cropped variants
    await generateCroppedVariants(card, rootFolder, set, language);
    croppedVariants = true;

    return {
      cardNumber: card.cardNumber,
      success: true,
      action: "downloaded",
      croppedVariants,
    };
  }

  // Case 4: Full card is valid but cropped variants need fixing
  const needsCropping =
    (card.artOnly && !card.artOnly.isValid) ||
    (card.artAndName && !card.artAndName.isValid);

  if (needsCropping) {
    const cropResult = await generateCroppedVariants(
      card,
      rootFolder,
      set,
      language
    );

    if (!cropResult) {
      return {
        cardNumber: card.cardNumber,
        success: false,
        action: "failed",
        error: "Failed to generate cropped variants",
      };
    }

    return {
      cardNumber: card.cardNumber,
      success: true,
      action: "cropped",
      croppedVariants: true,
    };
  }

  return {
    cardNumber: card.cardNumber,
    success: true,
    action: "skipped",
  };
}

/**
 * Generate cropped variants for a card
 * Art-only is language-agnostic (no text) and shared across all languages
 * Art+name is language-specific and generated for each language
 */
async function generateCroppedVariants(
  card: CardValidation,
  rootFolder: string,
  set: string,
  language: string
): Promise<boolean> {
  const outputDir = path.join(rootFolder, language, set);
  const webpPath = path.join(outputDir, `${card.cardNumber}.webp`);
  const avifPath = path.join(outputDir, `${card.cardNumber}.avif`);

  // Verify source files exist
  if (!fs.existsSync(webpPath) || !fs.existsSync(avifPath)) {
    return false;
  }

  // Check if art-only already exists (language-agnostic, don't regenerate)
  const artOnlyDir = path.join(rootFolder, set, "art_only");
  const artOnlyWebp = path.join(artOnlyDir, `${card.cardNumber}.webp`);
  const artOnlyAvif = path.join(artOnlyDir, `${card.cardNumber}.avif`);
  const artOnlyExists = fs.existsSync(artOnlyWebp) && fs.existsSync(artOnlyAvif);

  // Check if art+name needs generating (language-specific)
  const artAndNameDir = path.join(outputDir, "art_and_name");
  const artAndNameWebp = path.join(artAndNameDir, `${card.cardNumber}.webp`);
  const artAndNameAvif = path.join(artAndNameDir, `${card.cardNumber}.avif`);
  const artAndNameExists = fs.existsSync(artAndNameWebp) && fs.existsSync(artAndNameAvif);

  // If both exist, nothing to do
  if (artOnlyExists && artAndNameExists) {
    return true;
  }

  try {
    // Only generate what's missing
    if (!artOnlyExists || !artAndNameExists) {
      await cropCard(
        webpPath,
        avifPath,
        outputDir,
        card.cardNumber,
        set,
        language
      );
    }
    return true;
  } catch (error) {
    console.error(
      `Error cropping card ${card.cardNumber}: ${(error as Error).message}`
    );
    return false;
  }
}

/**
 * Fix all cards that need fixing from a validation report
 */
export async function fixCards(
  report: ValidationReport,
  options: FixOptions,
  onProgress?: (current: number, total: number, cardNumber: string) => void
): Promise<FixResult[]> {
  const cardsToFix = getCardsNeedingFix(report);
  const results: FixResult[] = [];

  for (let i = 0; i < cardsToFix.length; i++) {
    const card = cardsToFix[i];

    if (onProgress) {
      onProgress(i + 1, cardsToFix.length, card.cardNumber);
    }

    const result = await fixCard(card, options);
    results.push(result);

    if (options.verbose) {
      if (result.success) {
        console.log(
          `  ✅ Fixed ${card.cardNumber} (${result.action})`
        );
      } else {
        console.log(
          `  ❌ Failed to fix ${card.cardNumber}: ${result.error}`
        );
      }
    }
  }

  return results;
}

/**
 * Generate fix summary
 */
export function generateFixSummary(results: FixResult[]): {
  total: number;
  successful: number;
  failed: number;
  downloaded: number;
  transformed: number;
  cropped: number;
  skipped: number;
  croppedVariants: number;
} {
  return {
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    downloaded: results.filter((r) => r.action === "downloaded").length,
    transformed: results.filter((r) => r.action === "transformed").length,
    cropped: results.filter((r) => r.action === "cropped").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    croppedVariants: results.filter((r) => r.croppedVariants).length,
  };
}

/**
 * Print fix summary
 */
export function printFixSummary(results: FixResult[]): void {
  const summary = generateFixSummary(results);

  console.log("\n" + "=".repeat(60));
  console.log("🔧 Fix Summary");
  console.log("=".repeat(60));
  console.log(`Total cards processed: ${summary.total}`);
  console.log(`Successful:            ${summary.successful}`);
  console.log(`Failed:                ${summary.failed}`);
  console.log(`Downloaded:            ${summary.downloaded}`);
  console.log(`Transformed:           ${summary.transformed}`);
  console.log(`Cropped only:          ${summary.cropped}`);
  console.log(`Skipped:               ${summary.skipped}`);
  console.log(`With cropped variants: ${summary.croppedVariants}`);
  console.log("=".repeat(60));

  if (summary.failed === 0) {
    console.log("\n✅ All fixes applied successfully!");
  } else {
    console.log(`\n⚠️  ${summary.failed} cards could not be fixed`);
  }
}

/**
 * Save fix report
 */
export function saveFixReport(
  results: FixResult[],
  set: string,
  language: string,
  outputPath?: string
): string {
  const summary = generateFixSummary(results);
  const report = {
    set,
    language,
    timestamp: new Date().toISOString(),
    summary,
    results,
  };

  const filename =
    outputPath || `fix-report-${set}-${language}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

