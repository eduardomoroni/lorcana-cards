// Validate all processed images
// Checks dimensions, file integrity, and generates a report

import fs from "fs";
import sharp from "sharp";
import path from "path";

const CARDS_DIR = "./public/assets/images/cards/EN";
const REPORT_PATH = `./validation-report-${Date.now()}.json`;

interface ValidationResult {
  filePath: string;
  valid: boolean;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  error?: string;
}

interface ValidationReport {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  missingPairs: number;
  invalidDimensions: number;
  corruptedFiles: number;
  results: ValidationResult[];
  missingPairs: Array<{ webp?: string; avif?: string }>;
  timestamp: string;
}

/**
 * Validate a single image file
 */
async function validateImage(filePath: string): Promise<ValidationResult> {
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

    const isValidDimensions = metadata.width === 734 && metadata.height === 1024;

    return {
      filePath,
      valid: isValidDimensions,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: stats.size,
      error: isValidDimensions
        ? undefined
        : `Invalid dimensions: ${metadata.width}x${metadata.height} (expected 734x1024)`,
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
 * Find all card sets
 */
function findSets(): string[] {
  const sets: string[] = [];
  const entries = fs.readdirSync(CARDS_DIR);

  for (const entry of entries) {
    const fullPath = path.join(CARDS_DIR, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      sets.push(entry);
    }
  }

  return sets.sort();
}

/**
 * Find all card files in a set
 */
function findCardsInSet(setDir: string): Map<string, { webp?: string; avif?: string }> {
  const cards = new Map<string, { webp?: string; avif?: string }>();
  const setPath = path.join(CARDS_DIR, setDir);

  if (!fs.existsSync(setPath)) {
    return cards;
  }

  const files = fs.readdirSync(setPath);

  for (const file of files) {
    const match = file.match(/^(\d+)\.(webp|avif)$/);
    if (match) {
      const cardNumber = match[1];
      const format = match[2] as "webp" | "avif";
      const filePath = path.join(setPath, file);

      if (!cards.has(cardNumber)) {
        cards.set(cardNumber, {});
      }

      const card = cards.get(cardNumber)!;
      card[format] = filePath;
    }
  }

  return cards;
}

/**
 * Main validation
 */
async function runValidation(): Promise<void> {
  console.log("🔍 Starting image validation\n");

  const startTime = Date.now();
  const results: ValidationResult[] = [];
  const missingPairs: Array<{ webp?: string; avif?: string }> = [];

  let totalFiles = 0;
  let validFiles = 0;
  let invalidFiles = 0;
  let missingPairsCount = 0;
  let invalidDimensions = 0;
  let corruptedFiles = 0;

  const sets = findSets();
  console.log(`Found ${sets.length} sets to validate\n`);

  for (const set of sets) {
    console.log(`Validating set ${set}...`);
    const cards = findCardsInSet(set);

    for (const [cardNumber, formats] of cards) {
      // Check if both formats exist
      if (!formats.webp || !formats.avif) {
        missingPairsCount++;
        missingPairs.push({
          webp: formats.webp,
          avif: formats.avif,
        });
        console.log(
          `  ⚠️  Card ${cardNumber} missing ${!formats.webp ? "WebP" : "AVIF"}`
        );
      }

      // Validate WebP
      if (formats.webp) {
        totalFiles++;
        const result = await validateImage(formats.webp);
        results.push(result);

        if (result.valid) {
          validFiles++;
        } else {
          invalidFiles++;
          if (result.error?.includes("Invalid dimensions")) {
            invalidDimensions++;
          } else if (result.error?.includes("Corrupted")) {
            corruptedFiles++;
          }
          console.log(`  ❌ ${formats.webp}: ${result.error}`);
        }
      }

      // Validate AVIF
      if (formats.avif) {
        totalFiles++;
        const result = await validateImage(formats.avif);
        results.push(result);

        if (result.valid) {
          validFiles++;
        } else {
          invalidFiles++;
          if (result.error?.includes("Invalid dimensions")) {
            invalidDimensions++;
          } else if (result.error?.includes("Corrupted")) {
            corruptedFiles++;
          }
          console.log(`  ❌ ${formats.avif}: ${result.error}`);
        }
      }
    }

    console.log(`  ✓ Validated ${cards.size} cards in set ${set}\n`);
  }

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  const report: ValidationReport = {
    totalFiles,
    validFiles,
    invalidFiles,
    missingPairs: missingPairsCount,
    invalidDimensions,
    corruptedFiles,
    results: results.filter((r) => !r.valid), // Only include invalid results
    missingPairs,
    timestamp: new Date().toISOString(),
  };

  // Save report
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  // Print summary
  console.log("=".repeat(60));
  console.log("📊 Validation Summary");
  console.log("=".repeat(60));
  console.log(`Total files:           ${totalFiles}`);
  console.log(`Valid files:           ${validFiles}`);
  console.log(`Invalid files:         ${invalidFiles}`);
  console.log(`Missing pairs:         ${missingPairsCount}`);
  console.log(`Invalid dimensions:    ${invalidDimensions}`);
  console.log(`Corrupted files:       ${corruptedFiles}`);
  console.log(`\nDuration:              ${duration.toFixed(2)}s`);
  console.log(`Report saved to:       ${REPORT_PATH}`);

  if (invalidFiles === 0 && missingPairsCount === 0) {
    console.log("\n✅ All images are valid!");
  } else {
    console.log(
      `\n⚠️  Found ${invalidFiles} invalid files and ${missingPairsCount} missing pairs`
    );
  }

  console.log("=".repeat(60));
}

// Run validation
runValidation().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

