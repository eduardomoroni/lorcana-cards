// Cleanup script to delete JPG files after conversion
// Only deletes JPG files if corresponding WebP and AVIF files exist

import fs from "fs";
import path from "path";
import { rootFolder } from "./shared.js";

interface CleanupStats {
  deleted: number;
  skipped: number;
  errors: Array<{ file: string; reason: string }>;
}

/**
 * Check if a card has both WebP and AVIF versions
 */
function hasConvertedVersions(basePath: string): boolean {
  return fs.existsSync(`${basePath}.webp`) && fs.existsSync(`${basePath}.avif`);
}

/**
 * Delete JPG files that have been converted
 */
function cleanupJpgFiles(directory: string): CleanupStats {
  const stats: CleanupStats = {
    deleted: 0,
    skipped: 0,
    errors: [],
  };

  if (!fs.existsSync(directory)) {
    console.log(`Directory not found: ${directory}`);
    return stats;
  }

  const files = fs.readdirSync(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);

    // Skip if not a JPG file
    if (!file.toLowerCase().endsWith(".jpg") && !file.toLowerCase().endsWith(".jpeg")) {
      continue;
    }

    // Get base path without extension
    const basePath = filePath.replace(/\.(jpg|jpeg)$/i, "");
    const baseName = path.basename(basePath);

    // Check if converted versions exist
    if (hasConvertedVersions(basePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Deleted: ${file} (converted versions exist)`);
        stats.deleted++;
      } catch (error) {
        const errorMsg = (error as Error).message;
        console.error(`❌ Error deleting ${file}: ${errorMsg}`);
        stats.errors.push({ file: filePath, reason: errorMsg });
      }
    } else {
      console.log(`⏭️  Skipped: ${file} (missing WebP or AVIF version)`);
      stats.skipped++;
      stats.errors.push({
        file: filePath,
        reason: "Missing converted versions (WebP or AVIF)",
      });
    }
  }

  return stats;
}

/**
 * Main program
 */
async function main(): Promise<void> {
  console.log("🧹 JPG Cleanup Script");
  console.log("=".repeat(60));
  console.log("This script deletes JPG files that have been converted to WebP and AVIF\n");

  // Get target directory from command line or use default
  const targetSet = process.argv[2] || "010";
  const targetDir = `${rootFolder}/EN/${targetSet}`;

  console.log(`Target directory: ${targetDir}\n`);

  // Count JPG files before cleanup
  const files = fs.existsSync(targetDir) ? fs.readdirSync(targetDir) : [];
  const jpgFiles = files.filter(
    (f) => f.toLowerCase().endsWith(".jpg") || f.toLowerCase().endsWith(".jpeg")
  );

  console.log(`Found ${jpgFiles.length} JPG files\n`);

  if (jpgFiles.length === 0) {
    console.log("✅ No JPG files to clean up!");
    return;
  }

  // Perform cleanup
  const stats = cleanupJpgFiles(targetDir);

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Cleanup Summary");
  console.log("=".repeat(60));
  console.log(`Total JPG files found: ${jpgFiles.length}`);
  console.log(`Deleted:               ${stats.deleted}`);
  console.log(`Skipped:               ${stats.skipped}`);
  console.log(`Errors:                ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log("\n⚠️  Files with issues:");
    stats.errors.forEach((err) => {
      console.log(`  - ${path.basename(err.file)}: ${err.reason}`);
    });
  }

  if (stats.deleted > 0) {
    console.log(`\n✅ Successfully deleted ${stats.deleted} JPG files`);
  }

  console.log("=".repeat(60));
}

// Run the program
main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

