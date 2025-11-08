// Fix images with incorrect dimensions
// Reprocesses images that have 733x1024 instead of 734x1024

import fs from "fs";
import sharp from "sharp";

const VALIDATION_REPORT = "./validation-report-010-EN-1761489287250.json";
const TARGET_WIDTH = 734;
const TARGET_HEIGHT = 1024;

interface ValidationResult {
  filePath: string;
  valid: boolean;
  width?: number;
  height?: number;
  error?: string;
}

interface ValidationReport {
  results: ValidationResult[];
}

/**
 * Fix a single image
 */
async function fixImage(filePath: string): Promise<void> {
  try {
    const metadata = await sharp(filePath).metadata();

    if (metadata.width === TARGET_WIDTH && metadata.height === TARGET_HEIGHT) {
      console.log(`  ✓ ${filePath} already has correct dimensions`);
      return;
    }

    const format = filePath.endsWith(".avif") ? "avif" : "webp";

    // Resize image
    const image = sharp(filePath);

    if (format === "webp") {
      await image
        .resize(TARGET_WIDTH, TARGET_HEIGHT, {
          fit: "fill",
          withoutEnlargement: false,
        })
        .webp({
          quality: 80,
          effort: 6,
        })
        .toFile(filePath + ".tmp");
    } else {
      await image
        .resize(TARGET_WIDTH, TARGET_HEIGHT, {
          fit: "fill",
          withoutEnlargement: false,
        })
        .avif({
          quality: 50,
          speed: 1,
        })
        .toFile(filePath + ".tmp");
    }

    // Replace original file
    fs.renameSync(filePath + ".tmp", filePath);

    console.log(`  ✅ Fixed ${filePath}`);
  } catch (error) {
    console.error(`  ❌ Failed to fix ${filePath}: ${(error as Error).message}`);
    // Clean up tmp file if it exists
    if (fs.existsSync(filePath + ".tmp")) {
      fs.unlinkSync(filePath + ".tmp");
    }
  }
}

/**
 * Main program
 */
async function runFix(): Promise<void> {
  console.log("🔧 Starting dimension fix\n");

  if (!fs.existsSync(VALIDATION_REPORT)) {
    console.error(`Validation report not found: ${VALIDATION_REPORT}`);
    console.error("Please run validate-images.ts first");
    process.exit(1);
  }

  const report: ValidationReport = JSON.parse(
    fs.readFileSync(VALIDATION_REPORT, "utf-8")
  );

  const invalidDimensionFiles = report.results.filter(
    (r) => r.error?.includes("Invalid dimensions")
  );

  console.log(
    `Found ${invalidDimensionFiles.length} files with invalid dimensions\n`
  );

  let fixed = 0;
  let failed = 0;

  for (let i = 0; i < invalidDimensionFiles.length; i++) {
    const result = invalidDimensionFiles[i];
    console.log(
      `[${i + 1}/${invalidDimensionFiles.length}] Fixing ${result.filePath}...`
    );

    try {
      await fixImage(result.filePath);
      fixed++;
    } catch (error) {
      console.error(`  Failed: ${(error as Error).message}`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Fix Summary");
  console.log("=".repeat(60));
  console.log(`Total files to fix:    ${invalidDimensionFiles.length}`);
  console.log(`Fixed:                 ${fixed}`);
  console.log(`Failed:                ${failed}`);

  if (failed === 0) {
    console.log("\n✅ All files fixed successfully!");
  } else {
    console.log(`\n⚠️  ${failed} files could not be fixed`);
  }

  console.log("=".repeat(60));
}

// Run fix
runFix().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

