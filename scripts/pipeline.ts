#!/usr/bin/env bun
// Unified Lorcana Card Image Pipeline
// Downloads, validates, and fixes card images for specified sets and languages

import fs from "fs";
import path from "path";
import { validateSet, printSummary, saveReport } from "./core/validate";
import {
  fixCards,
  printFixSummary,
  saveFixReport,
  FixOptions,
} from "./core/fix";
import { cleanupJpgFiles } from "./core/transform";

interface PipelineConfig {
  set: string;
  languages: string[];
  dryRun: boolean;
  autoFix: boolean;
  verbose: boolean;
  rootFolder: string;
  expectedRange?: { start: number; end: number };
}

const VALID_LANGUAGES = ["EN", "DE", "FR", "IT"];

/**
 * Parse command line arguments
 */
function parseArgs(): PipelineConfig | null {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return null;
  }

  let set = "010";
  let languages = ["EN"];
  let dryRun = false;
  let autoFix = false;
  let verbose = false;
  let expectedRange: { start: number; end: number } | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--set" && args[i + 1]) {
      set = args[i + 1];
      i++;
    } else if (arg === "--language" && args[i + 1]) {
      languages = args[i + 1].split(",").map((l) => l.trim().toUpperCase());
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--auto-fix") {
      autoFix = true;
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--range" && args[i + 1]) {
      const [start, end] = args[i + 1].split("-").map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        expectedRange = { start, end };
      }
      i++;
    }
  }

  // Validate languages
  const invalidLanguages = languages.filter(
    (lang) => !VALID_LANGUAGES.includes(lang)
  );
  if (invalidLanguages.length > 0) {
    console.error(
      `❌ Invalid language(s): ${invalidLanguages.join(", ")}`
    );
    console.error(`   Valid languages: ${VALID_LANGUAGES.join(", ")}`);
    return null;
  }

  const rootFolder = path.join(
    process.cwd(),
    "public",
    "assets",
    "images",
    "cards"
  );

  return {
    set,
    languages,
    dryRun,
    autoFix,
    verbose,
    rootFolder,
    expectedRange,
  };
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Lorcana Card Image Pipeline

Usage:
  bun run scripts/pipeline.ts [options]

Options:
  --set <set>           Set number (e.g., 010, 009) [default: 010]
  --language <langs>    Comma-separated language codes [default: EN]
                        Valid: ${VALID_LANGUAGES.join(", ")}
  --range <start-end>   Expected card range (e.g., 1-242)
  --dry-run             Validate only, don't fix issues
  --auto-fix            Automatically fix issues without prompt
  --verbose             Show detailed progress
  -h, --help            Show this help message

Examples:
  # Validate set 010 for English
  bun run scripts/pipeline.ts --set 010 --language EN

  # Validate and auto-fix multiple languages
  bun run scripts/pipeline.ts --set 010 --language EN,DE,FR --auto-fix

  # Dry run (validation only)
  bun run scripts/pipeline.ts --set 010 --language EN --dry-run

  # Specify expected card range
  bun run scripts/pipeline.ts --set 010 --language EN --range 1-242
`);
}

/**
 * Run pipeline for a single language
 */
async function runForLanguage(
  config: PipelineConfig,
  language: string
): Promise<boolean> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📋 Processing Set ${config.set} - ${language}`);
  console.log(`${"=".repeat(80)}\n`);

  // Step 1: Validate
  console.log("🔍 Step 1: Validating images...\n");

  const validationReport = await validateSet(
    config.rootFolder,
    config.set,
    language,
    config.expectedRange,
    config.verbose
      ? (current, total, cardNumber) => {
          console.log(`  [${current}/${total}] Validating ${cardNumber}...`);
        }
      : undefined
  );

  printSummary(validationReport);

  // Save validation report
  const reportPath = saveReport(
    validationReport,
    `validation-report-${config.set}-${language}-${Date.now()}.json`
  );
  console.log(`\n📄 Validation report saved: ${reportPath}`);

  // Check if any issues found (full cards or cropped variants)
  const totalIssues =
    validationReport.invalidCards +
    validationReport.missingArtOnly +
    validationReport.missingArtAndName +
    validationReport.invalidArtOnly +
    validationReport.invalidArtAndName;

  // If no issues found, we're done
  if (totalIssues === 0) {
    return true;
  }

  // Step 2: Fix issues (if not dry run)
  if (config.dryRun) {
    console.log(
      "\n⏭️  Dry run mode - skipping fixes. Run without --dry-run to fix issues."
    );
    return false;
  }

  if (!config.autoFix) {
    console.log(
      "\n⏭️  Auto-fix disabled. Run with --auto-fix to automatically fix issues."
    );
    return false;
  }

  console.log("\n🔧 Step 2: Fixing issues...\n");

  const fixOptions: FixOptions = {
    rootFolder: config.rootFolder,
    set: config.set,
    language,
    autoFix: config.autoFix,
    verbose: config.verbose,
  };

  const fixResults = await fixCards(
    validationReport,
    fixOptions,
    config.verbose
      ? (current, total, cardNumber) => {
          console.log(`  [${current}/${total}] Fixing ${cardNumber}...`);
        }
      : undefined
  );

  printFixSummary(fixResults);

  // Save fix report
  const fixReportPath = saveFixReport(
    fixResults,
    config.set,
    language,
    `fix-report-${config.set}-${language}-${Date.now()}.json`
  );
  console.log(`\n📄 Fix report saved: ${fixReportPath}`);

  // Step 3: Cleanup JPG files
  console.log("\n🧹 Step 3: Cleaning up source files...\n");

  const setDir = path.join(config.rootFolder, language, config.set);
  const cleanupStats = cleanupJpgFiles(setDir);

  console.log(`  Deleted: ${cleanupStats.deleted} JPG files`);
  console.log(`  Skipped: ${cleanupStats.skipped} files`);

  return fixResults.every((r) => r.success);
}

/**
 * Main pipeline function
 */
async function runPipeline(): Promise<void> {
  console.log("🚀 Lorcana Card Image Pipeline\n");

  const config = parseArgs();
  if (!config) {
    process.exit(1);
  }

  console.log("Configuration:");
  console.log(`  Set:         ${config.set}`);
  console.log(`  Languages:   ${config.languages.join(", ")}`);
  console.log(`  Dry Run:     ${config.dryRun ? "Yes" : "No"}`);
  console.log(`  Auto Fix:    ${config.autoFix ? "Yes" : "No"}`);
  console.log(`  Verbose:     ${config.verbose ? "Yes" : "No"}`);
  if (config.expectedRange) {
    console.log(
      `  Card Range:  ${config.expectedRange.start}-${config.expectedRange.end}`
    );
  }

  const startTime = Date.now();
  const results: Array<{ language: string; success: boolean }> = [];

  // Process each language
  for (const language of config.languages) {
    const success = await runForLanguage(config, language);
    results.push({ language, success });
  }

  const duration = (Date.now() - startTime) / 1000;

  // Final summary
  console.log("\n" + "=".repeat(80));
  console.log("📊 Pipeline Summary");
  console.log("=".repeat(80));

  for (const result of results) {
    const status = result.success ? "✅" : "⚠️";
    console.log(`${status} ${result.language}: ${result.success ? "Success" : "Has issues"}`);
  }

  console.log(`\nTotal duration: ${duration.toFixed(2)}s`);

  const allSuccess = results.every((r) => r.success);
  if (allSuccess) {
    console.log("\n🎉 Pipeline completed successfully!");
  } else {
    console.log("\n⚠️  Pipeline completed with some issues");
  }

  console.log("=".repeat(80));

  // Exit with appropriate code
  process.exit(allSuccess ? 0 : 1);
}

// Run the pipeline
runPipeline().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

