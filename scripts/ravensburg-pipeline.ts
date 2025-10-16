// Complete Ravensburger Image Pipeline
// 1. Downloads images from Ravensburger API based on mapping
// 2. Converts them to WebP and AVIF at 734x1024 resolution
// 3. Validates the output

import fs from "fs";
import https from "https";
import sharp from "sharp";
import path from "path";
import { rootFolder } from "./shared.js";

const MAPPING_PATH = "./scripts/ravensburg-mapping.json";
const TEMP_DOWNLOAD_DIR = "./temp-downloads";
const ERRORS_LOG_PATH = "./ravensburg-pipeline-errors.log";
const REPORT_PATH = `./pipeline-report-${Date.now()}.json`;

interface MappingEntry {
  name: string;
  set: string;
  cardNumber: string;
  identifier: string;
  variantId: string;
  url: string;
  rarity: string;
}

interface ProcessingResult {
  entry: MappingEntry;
  success: boolean;
  error?: string;
  downloaded?: boolean;
  transformed?: boolean;
  webpPath?: string;
  avifPath?: string;
}

interface PipelineReport {
  totalCards: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ entry: MappingEntry; error: string }>;
  startTime: string;
  endTime: string;
  duration: number;
}

/**
 * Download a single image
 */
function downloadImage(url: string, filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        res
          .pipe(fs.createWriteStream(filepath))
          .on("error", reject)
          .once("close", () => resolve(filepath));
      } else {
        res.resume();
        reject(
          new Error(`Request Failed With Status Code: ${res.statusCode}`)
        );
      }
    });
  });
}

/**
 * Transform image to WebP and AVIF at 734x1024 resolution
 */
async function transformImage(
  inputPath: string,
  outputDir: string,
  baseName: string
): Promise<{ webpPath: string; avifPath: string }> {
  const targetDimensions = {
    width: 734,
    height: 1024,
  };

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
    .resize(targetDimensions.width, targetDimensions.height, {
      fit: "fill",
      withoutEnlargement: false,
    })
    .webp({
      quality: 80,
      effort: 6,
    })
    .toFile(webpPath);

  // Create AVIF version
  await image
    .clone()
    .resize(targetDimensions.width, targetDimensions.height, {
      fit: "fill",
      withoutEnlargement: false,
    })
    .avif({
      quality: 50,
      speed: 1,
    })
    .toFile(avifPath);

  return { webpPath, avifPath };
}

/**
 * Check if output files already exist
 */
function checkOutputExists(outputDir: string, baseName: string): boolean {
  const webpPath = path.join(outputDir, `${baseName}.webp`);
  const avifPath = path.join(outputDir, `${baseName}.avif`);
  return fs.existsSync(webpPath) && fs.existsSync(avifPath);
}

/**
 * Process a single card variant
 */
async function processCard(
  entry: MappingEntry,
  skipExisting: boolean = true
): Promise<ProcessingResult> {
  const { set, cardNumber, url, name, variantId } = entry;

  // Determine file extension from URL
  const urlLower = url.toLowerCase();
  const extension = urlLower.endsWith(".jpg") ? "jpg" : "webp";

  // Create output directory path
  const language = "EN";
  const outputDir = `${rootFolder}/${language}/${set}`;
  const baseName = cardNumber;

  // Check if output already exists
  if (skipExisting && checkOutputExists(outputDir, baseName)) {
    return {
      entry,
      success: true,
      downloaded: false,
      transformed: false,
    };
  }

  // Create temp directory if it doesn't exist
  if (!fs.existsSync(TEMP_DOWNLOAD_DIR)) {
    fs.mkdirSync(TEMP_DOWNLOAD_DIR, { recursive: true });
  }

  // Download to temp location
  const tempFilePath = path.join(
    TEMP_DOWNLOAD_DIR,
    `${set}-${cardNumber}-${variantId}.${extension}`
  );

  try {
    // Download image
    await downloadImage(url, tempFilePath);

    // Transform image
    const { webpPath, avifPath } = await transformImage(
      tempFilePath,
      outputDir,
      baseName
    );

    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return {
      entry,
      success: true,
      downloaded: true,
      transformed: true,
      webpPath,
      avifPath,
    };
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return {
      entry,
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Validate that an image file is valid
 */
async function validateImage(filePath: string): Promise<boolean> {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const metadata = await sharp(filePath).metadata();
    return metadata.width === 734 && metadata.height === 1024;
  } catch (error) {
    return false;
  }
}

/**
 * Validate all processed images
 */
async function validateOutput(
  results: ProcessingResult[]
): Promise<{ valid: number; invalid: Array<{ path: string; reason: string }> }> {
  console.log("\n🔍 Validating output images...");

  const invalid: Array<{ path: string; reason: string }> = [];
  let valid = 0;

  for (const result of results) {
    if (!result.success || !result.webpPath || !result.avifPath) {
      continue;
    }

    const webpValid = await validateImage(result.webpPath);
    const avifValid = await validateImage(result.avifPath);

    if (!webpValid) {
      invalid.push({
        path: result.webpPath,
        reason: "Invalid dimensions or corrupted file",
      });
    }

    if (!avifValid) {
      invalid.push({
        path: result.avifPath,
        reason: "Invalid dimensions or corrupted file",
      });
    }

    if (webpValid && avifValid) {
      valid++;
    }
  }

  return { valid, invalid };
}

/**
 * Main pipeline
 */
async function runPipeline(): Promise<void> {
  const startTime = Date.now();
  const startTimeStr = new Date().toISOString();

  console.log("🚀 Starting Ravensburger Image Pipeline\n");

  // Load mapping
  console.log(`📂 Loading mapping from ${MAPPING_PATH}...`);
  if (!fs.existsSync(MAPPING_PATH)) {
    throw new Error(
      `Mapping file not found: ${MAPPING_PATH}. Run download-from-ravensburg.ts with --map-only first.`
    );
  }

  const mapping: MappingEntry[] = JSON.parse(
    fs.readFileSync(MAPPING_PATH, "utf-8")
  );

  console.log(`Found ${mapping.length} card variants to process\n`);

  // Group by set and card number to avoid duplicate processing
  // Only process the first variant (Regular) for each card
  const uniqueCards = new Map<string, MappingEntry>();
  for (const entry of mapping) {
    const key = `${entry.set}-${entry.cardNumber}`;
    if (!uniqueCards.has(key) && entry.variantId === "Regular") {
      uniqueCards.set(key, entry);
    }
  }

  const cardsToProcess = Array.from(uniqueCards.values());
  console.log(
    `Processing ${cardsToProcess.length} unique cards (Regular variants only)\n`
  );

  // Process all cards
  const results: ProcessingResult[] = [];
  const errors: Array<{ entry: MappingEntry; error: string }> = [];
  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < cardsToProcess.length; i++) {
    const entry = cardsToProcess[i];
    const progress = `[${i + 1}/${cardsToProcess.length}]`;

    console.log(
      `${progress} ${entry.name} (${entry.identifier}) - Set ${entry.set}`
    );

    try {
      const result = await processCard(entry, true);
      results.push(result);

      if (result.success) {
        if (result.downloaded && result.transformed) {
          console.log(
            `  ✅ Downloaded and transformed to ${result.webpPath}`
          );
          processed++;
        } else {
          console.log(`  ⏭️  Already exists, skipping`);
          skipped++;
        }
      } else {
        console.error(`  ❌ Failed: ${result.error}`);
        errors.push({ entry, error: result.error || "Unknown error" });
      }
    } catch (error) {
      console.error(`  ❌ Fatal error: ${(error as Error).message}`);
      errors.push({ entry, error: (error as Error).message });
      results.push({
        entry,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  // Validate output
  const validation = await validateOutput(
    results.filter((r) => r.success && r.transformed)
  );

  // Clean up temp directory
  if (fs.existsSync(TEMP_DOWNLOAD_DIR)) {
    const tempFiles = fs.readdirSync(TEMP_DOWNLOAD_DIR);
    if (tempFiles.length === 0) {
      fs.rmdirSync(TEMP_DOWNLOAD_DIR);
    }
  }

  // Generate report
  const endTime = Date.now();
  const endTimeStr = new Date().toISOString();
  const duration = (endTime - startTime) / 1000; // in seconds

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  const report: PipelineReport = {
    totalCards: cardsToProcess.length,
    successful,
    failed,
    skipped,
    errors,
    startTime: startTimeStr,
    endTime: endTimeStr,
    duration,
  };

  // Save report
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Pipeline Summary");
  console.log("=".repeat(60));
  console.log(`Total cards:        ${report.totalCards}`);
  console.log(`Processed:          ${processed}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Failed:             ${failed}`);
  console.log(`\nValidation:`);
  console.log(`  Valid images:     ${validation.valid}`);
  console.log(`  Invalid images:   ${validation.invalid.length}`);
  console.log(`\nDuration:           ${duration.toFixed(2)}s`);
  console.log(`Report saved to:    ${REPORT_PATH}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} errors occurred`);
    fs.writeFileSync(ERRORS_LOG_PATH, JSON.stringify(errors, null, 2), "utf-8");
    console.log(`Error details saved to: ${ERRORS_LOG_PATH}`);
  }

  if (validation.invalid.length > 0) {
    console.log(`\n⚠️  ${validation.invalid.length} invalid images detected:`);
    validation.invalid.forEach((inv) => {
      console.log(`  - ${inv.path}: ${inv.reason}`);
    });
  }

  if (failed === 0 && validation.invalid.length === 0) {
    console.log("\n✅ All images processed and validated successfully!");
  }

  console.log("=".repeat(60));
}

// Run the pipeline
runPipeline().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

