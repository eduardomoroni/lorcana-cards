// Comprehensive Image Pipeline Validation and Fix Script
// This script validates all pipeline steps and fixes issues by working from original files
// It handles: downloads, resizing, AVIF conversion, and proper cropping of variants

import sharp from "sharp";
import { joinImages } from "join-images";
import fs from "fs";
import path from "path";
import https from "https";
import { rootFolder } from "./shared.js";

// Configuration - can be modified for different sets/languages
const CONFIG = {
  edition: "001",
  languages: ["EN", "IT", "DE", "FR"], // Languages to process
  cardRange: { start: 1, end: 216 }, // CORRECTED: Set 001 has 216 cards, not 204
  autoFix: true, // Set to false for dry-run (report only)
  skipVariants: false, // CORRECTED: Set 001 HAS variants (art_only, art_and_name)
  downloadSource: "dreamborn", // "dreamborn" or "ravensburg"
  verbose: false, // Detailed logging
  tolerancePx: 2 // Tolerance for dimension differences (±2px)
};

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--dry-run')) {
  CONFIG.autoFix = false;
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}
if (args.includes('--verbose')) {
  CONFIG.verbose = true;
}

// Pipeline steps enum
const PIPELINE_STEPS = {
  DOWNLOAD: 'download',
  RESIZE_ORIGINAL: 'resize_original',
  CONVERT_ORIGINAL: 'convert_original',
  CROP_ART_ONLY: 'crop_art_only',
  CONVERT_ART_ONLY: 'convert_art_only',
  CROP_ART_AND_NAME: 'crop_art_and_name',
  CONVERT_ART_AND_NAME: 'convert_art_and_name'
};

class ComprehensivePipelineValidator {
  constructor(config) {
    this.config = config;
    this.errors = [];
    this.warnings = [];
    this.fixes = [];
    this.stats = {
      checked: 0,
      missing: 0,
      recovered: 0,
      failed: 0,
      skipped: 0,
      byLanguage: {}
    };
    
    // Initialize language stats
    config.languages.forEach(lang => {
      this.stats.byLanguage[lang] = {
        checked: 0,
        missing: 0,
        recovered: 0,
        failed: 0,
        skipped: 0
      };
    });
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    
    if (this.config.verbose || type === 'ERROR' || type === 'WARN') {
      console.log(logMessage);
    }
    
    if (type === 'ERROR') {
      this.errors.push(logMessage);
    } else if (type === 'WARN') {
      this.warnings.push(logMessage);
    } else if (type === 'FIX') {
      this.fixes.push(logMessage);
    }
  }

  getCardNumber(num) {
    return num.toString().padStart(3, "0");
  }

  getFilePaths(cardNum, language) {
    const cardNumber = this.getCardNumber(cardNum);
    
    return {
      // Original files (language-specific)
      originalWebp: `${rootFolder}/${language}/${this.config.edition}/${cardNumber}.webp`,
      originalAvif: `${rootFolder}/${language}/${this.config.edition}/${cardNumber}.avif`,
      
      // Art only files (shared across languages)
      artOnlyWebp: `${rootFolder}/${this.config.edition}/art_only/${cardNumber}.webp`,
      artOnlyAvif: `${rootFolder}/${this.config.edition}/art_only/${cardNumber}.avif`,
      
      // Art and name files (language-specific)
      artAndNameWebp: `${rootFolder}/${language}/${this.config.edition}/art_and_name/${cardNumber}.webp`,
      artAndNameAvif: `${rootFolder}/${language}/${this.config.edition}/art_and_name/${cardNumber}.avif`
    };
  }

  getExpectedDimensions(type) {
    switch (type) {
      case 'original':
        return { width: 734, height: 1024 };
      case 'art_only':
        return { width: 734, height: 603 };
      case 'art_and_name':
        return { width: 734, height: 767 };
      default:
        return { width: 734, height: 1024 };
    }
  }

  checkFileExists(filePath) {
    return fs.existsSync(filePath);
  }

  async checkImageDimensions(filePath, expectedDimensions) {
    try {
      const metadata = await sharp(filePath).metadata();
      const widthMatch = Math.abs(metadata.width - expectedDimensions.width) <= this.config.tolerancePx;
      const heightMatch = Math.abs(metadata.height - expectedDimensions.height) <= this.config.tolerancePx;
      
      return {
        correct: widthMatch && heightMatch,
        actual: { width: metadata.width, height: metadata.height },
        expected: expectedDimensions
      };
    } catch (error) {
      this.log(`Error checking dimensions for ${filePath}: ${error.message}`, 'ERROR');
      return { correct: false, error: error.message };
    }
  }

  async validateCard(cardNum, language) {
    const cardNumber = this.getCardNumber(cardNum);
    const paths = this.getFilePaths(cardNum, language);
    const issues = [];
    const isFirstLanguage = language === this.config.languages[0];

    if (this.config.verbose) {
      this.log(`\n=== Validating Card ${cardNumber} (${language}) ===`, 'INFO');
    }

    // Step 1: Check original WebP exists
    const originalExists = this.checkFileExists(paths.originalWebp);
    if (!originalExists) {
      issues.push({ step: PIPELINE_STEPS.DOWNLOAD, path: paths.originalWebp, language });
      this.log(`Card ${cardNumber} (${language}): Missing original WebP`, 'WARN');
    } else {
      // Step 2: Check original dimensions
      const metadata = await sharp(paths.originalWebp).metadata();
      const expected = this.getExpectedDimensions('original');
      
      if (metadata.width !== expected.width || metadata.height !== expected.height) {
        issues.push({ step: PIPELINE_STEPS.RESIZE_ORIGINAL, path: paths.originalWebp, language });
        this.log(`Card ${cardNumber} (${language}): Original has wrong dimensions ${metadata.width}x${metadata.height}`, 'WARN');
      }

      // Step 3: Check original AVIF
      if (!this.checkFileExists(paths.originalAvif)) {
        issues.push({ step: PIPELINE_STEPS.CONVERT_ORIGINAL, path: paths.originalAvif, language });
        this.log(`Card ${cardNumber} (${language}): Missing original AVIF`, 'WARN');
      }

      // Step 4: Check art_only variants (only for first language, as they're shared)
      if (!this.config.skipVariants && isFirstLanguage) {
        const artOnlyWebpExists = this.checkFileExists(paths.artOnlyWebp);
        
        if (!artOnlyWebpExists) {
          issues.push({ step: PIPELINE_STEPS.CROP_ART_ONLY, path: paths.artOnlyWebp, language: 'shared' });
          this.log(`Card ${cardNumber}: Missing art_only WebP`, 'WARN');
        } else {
          // Check dimensions
          const artOnlyMeta = await sharp(paths.artOnlyWebp).metadata();
          const expectedArtOnly = this.getExpectedDimensions('art_only');
          
          // If uncropped (full height), needs cropping
          if (artOnlyMeta.height === 1024) {
            issues.push({ step: PIPELINE_STEPS.CROP_ART_ONLY, path: paths.artOnlyWebp, language: 'shared' });
            this.log(`Card ${cardNumber}: art_only is uncropped (${artOnlyMeta.height}px)`, 'WARN');
          } 
          // Check if dimensions are significantly wrong
          else if (Math.abs(artOnlyMeta.height - expectedArtOnly.height) > this.config.tolerancePx) {
            this.log(`Card ${cardNumber}: art_only has unexpected dimensions ${artOnlyMeta.width}x${artOnlyMeta.height}`, 'WARN');
          }
        }

        // Check art_only AVIF
        if (!this.checkFileExists(paths.artOnlyAvif)) {
          issues.push({ step: PIPELINE_STEPS.CONVERT_ART_ONLY, path: paths.artOnlyAvif, language: 'shared' });
          this.log(`Card ${cardNumber}: Missing art_only AVIF`, 'WARN');
        }
      }

      // Step 5: Check art_and_name variants (for each language)
      if (!this.config.skipVariants) {
        const artAndNameWebpExists = this.checkFileExists(paths.artAndNameWebp);
        
        if (!artAndNameWebpExists) {
          issues.push({ step: PIPELINE_STEPS.CROP_ART_AND_NAME, path: paths.artAndNameWebp, language });
          this.log(`Card ${cardNumber} (${language}): Missing art_and_name WebP`, 'WARN');
        } else {
          // Check dimensions
          const artAndNameMeta = await sharp(paths.artAndNameWebp).metadata();
          const expectedArtAndName = this.getExpectedDimensions('art_and_name');
          
          // If uncropped (full height), needs cropping
          if (artAndNameMeta.height === 1024) {
            issues.push({ step: PIPELINE_STEPS.CROP_ART_AND_NAME, path: paths.artAndNameWebp, language });
            this.log(`Card ${cardNumber} (${language}): art_and_name is uncropped (${artAndNameMeta.height}px)`, 'WARN');
          }
          // Check if dimensions are significantly wrong
          else if (Math.abs(artAndNameMeta.height - expectedArtAndName.height) > this.config.tolerancePx) {
            this.log(`Card ${cardNumber} (${language}): art_and_name has unexpected dimensions ${artAndNameMeta.width}x${artAndNameMeta.height}`, 'WARN');
          }
        }

        // Check art_and_name AVIF
        if (!this.checkFileExists(paths.artAndNameAvif)) {
          issues.push({ step: PIPELINE_STEPS.CONVERT_ART_AND_NAME, path: paths.artAndNameAvif, language });
          this.log(`Card ${cardNumber} (${language}): Missing art_and_name AVIF`, 'WARN');
        }
      }
    }

    this.stats.checked++;
    this.stats.byLanguage[language].checked++;
    
    if (issues.length > 0) {
      this.stats.missing++;
      this.stats.byLanguage[language].missing++;
      return issues;
    } else {
      if (this.config.verbose) {
        this.log(`Card ${cardNumber} (${language}): Complete ✓`, 'INFO');
      }
      return [];
    }
  }

  // === FIX OPERATIONS ===

  async downloadImage(cardNumber, language, edition) {
    const cardNumberPadded = cardNumber.toString().padStart(3, "0");
    const editionPadded = edition.toString().padStart(3, "0");
    const url = `https://cdn.dreamborn.ink/images/${language.toLowerCase()}/cards/${editionPadded}-${cardNumberPadded}`;
    const destination = `${rootFolder}/${language.toUpperCase()}/${editionPadded}/${cardNumberPadded}.webp`;

    this.log(`Downloading ${url}`, 'FIX');

    const folder = path.dirname(destination);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode === 200) {
          res
            .pipe(fs.createWriteStream(destination))
            .on("error", reject)
            .once("close", () => {
              this.log(`Downloaded ${destination}`, 'FIX');
              resolve(destination);
            });
        } else {
          res.resume();
          this.log(`Download failed: ${url} - Status: ${res.statusCode}`, 'ERROR');
          reject(new Error(`Request Failed With Status Code: ${res.statusCode}`));
        }
      });
    });
  }

  async resizeImage(filePath, dimensions) {
    this.log(`Resizing ${filePath} to ${dimensions.width}x${dimensions.height}`, 'FIX');
    
    const tempFile = filePath.replace(/\.(webp|avif)$/, "_temp.$1");
    fs.copyFileSync(filePath, tempFile);

    await sharp(tempFile)
      .resize(dimensions.width, dimensions.height, { fit: 'fill' })
      .toFile(filePath);

    fs.unlinkSync(tempFile);
    this.log(`Resized ${filePath}`, 'FIX');
  }

  async convertToAvif(webpPath, avifPath) {
    this.log(`Converting to AVIF: ${avifPath}`, 'FIX');
    
    await sharp(webpPath)
      .avif({ quality: 50, speed: 1 })
      .toFile(avifPath);
      
    this.log(`Created ${avifPath}`, 'FIX');
  }

  async cropImage(sourceFile, destinationFile, artOnly, cardNumber) {
    this.log(`Cropping ${cardNumber} (${artOnly ? 'art_only' : 'art_and_name'}): ${sourceFile} → ${destinationFile}`, 'FIX');

    const destinationFolder = path.dirname(destinationFile);
    if (!fs.existsSync(destinationFolder)) {
      fs.mkdirSync(destinationFolder, { recursive: true });
    }

    // Create temporary files for safe cropping
    const tempDestination = destinationFile.replace(".webp", "_temp_dest.webp");
    const topFile = destinationFile.replace(".webp", "_top.webp");
    const bottomFile = destinationFile.replace(".webp", "_bottom.webp");

    try {
      const metadata = await sharp(sourceFile).metadata();

      // Verify source dimensions
      if (metadata.width !== 734 || metadata.height !== 1024) {
        throw new Error(`Source has unexpected dimensions: ${metadata.width}x${metadata.height}`);
      }

      // Calculate crop positions
      const topStartHeight = 0;
      const topEndHeight = Math.floor(metadata.height * (artOnly ? 0.52 : 0.674));
      const bottomStartHeight = Math.floor(metadata.height * (artOnly ? 0.931 : 0.925));
      const bottomEndHeight = Math.floor(metadata.height);

      // Create top crop
      await sharp(sourceFile)
        .extract({
          left: 0,
          top: topStartHeight,
          width: metadata.width,
          height: topEndHeight - topStartHeight,
        })
        .toFile(topFile);

      // Create bottom crop
      await sharp(sourceFile)
        .extract({
          left: 0,
          top: bottomStartHeight,
          width: metadata.width,
          height: bottomEndHeight - bottomStartHeight,
        })
        .toFile(bottomFile);

      // Join images vertically
      const joinedImage = await joinImages([topFile, bottomFile], { direction: "vertical" });
      await joinedImage.toFile(tempDestination);

      // Verify result
      const resultMeta = await sharp(tempDestination).metadata();
      const expectedHeight = (topEndHeight - topStartHeight) + (bottomEndHeight - bottomStartHeight);
      
      if (resultMeta.width !== 734 || resultMeta.height !== expectedHeight) {
        throw new Error(`Cropped result has wrong dimensions: ${resultMeta.width}x${resultMeta.height}`);
      }

      // Move to final destination
      fs.renameSync(tempDestination, destinationFile);

      this.log(`Cropped ${destinationFile} (${resultMeta.width}x${resultMeta.height})`, 'FIX');
      
      // Clean up temporary files
      [topFile, bottomFile].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });

      return true;
    } catch (error) {
      // Clean up any partial files on error
      [tempDestination, topFile, bottomFile].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
      throw error;
    }
  }

  async fixIssue(issue, cardNum, language) {
    const cardNumber = this.getCardNumber(cardNum);
    const paths = this.getFilePaths(cardNum, language);

    try {
      switch (issue.step) {
        case PIPELINE_STEPS.DOWNLOAD:
          await this.downloadImage(cardNum, language, this.config.edition);
          break;

        case PIPELINE_STEPS.RESIZE_ORIGINAL:
          await this.resizeImage(paths.originalWebp, this.getExpectedDimensions('original'));
          // Also resize AVIF if it exists
          if (fs.existsSync(paths.originalAvif)) {
            await this.resizeImage(paths.originalAvif, this.getExpectedDimensions('original'));
          }
          break;

        case PIPELINE_STEPS.CONVERT_ORIGINAL:
          await this.convertToAvif(paths.originalWebp, paths.originalAvif);
          break;

        case PIPELINE_STEPS.CROP_ART_ONLY:
          await this.cropImage(paths.originalWebp, paths.artOnlyWebp, true, cardNumber);
          break;

        case PIPELINE_STEPS.CONVERT_ART_ONLY:
          await this.convertToAvif(paths.artOnlyWebp, paths.artOnlyAvif);
          break;

        case PIPELINE_STEPS.CROP_ART_AND_NAME:
          await this.cropImage(paths.originalWebp, paths.artAndNameWebp, false, cardNumber);
          break;

        case PIPELINE_STEPS.CONVERT_ART_AND_NAME:
          await this.convertToAvif(paths.artAndNameWebp, paths.artAndNameAvif);
          break;

        default:
          this.log(`Unknown issue step: ${issue.step}`, 'ERROR');
          return false;
      }

      this.stats.recovered++;
      if (language && this.stats.byLanguage[language]) {
        this.stats.byLanguage[language].recovered++;
      }
      this.log(`Fixed ${cardNumber} (${language}): ${issue.step}`, 'FIX');
      return true;
    } catch (error) {
      this.stats.failed++;
      if (language && this.stats.byLanguage[language]) {
        this.stats.byLanguage[language].failed++;
      }
      this.log(`Failed to fix ${cardNumber} (${language}): ${issue.step} - ${error.message}`, 'ERROR');
      return false;
    }
  }

  async validateAndFixAll() {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 COMPREHENSIVE IMAGE PIPELINE VALIDATOR - SET ${this.config.edition}`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(`Languages: ${this.config.languages.join(', ')}`);
    console.log(`Card range: ${this.config.cardRange.start} to ${this.config.cardRange.end}`);
    console.log(`Auto-fix: ${this.config.autoFix ? 'ENABLED' : 'DISABLED (dry-run)'}`);
    console.log(`Skip variants: ${this.config.skipVariants}`);
    console.log(`Tolerance: ±${this.config.tolerancePx}px`);
    console.log();

    const allIssues = [];

    // Phase 1: Identify all issues
    console.log(`📋 PHASE 1: VALIDATING ALL CARDS`);
    console.log(`${'='.repeat(80)}\n`);
    
    for (const language of this.config.languages) {
      console.log(`Validating ${language}...`);
      let progressCounter = 0;
      
      for (let cardNum = this.config.cardRange.start; cardNum <= this.config.cardRange.end; cardNum++) {
        progressCounter++;
        if (progressCounter % 50 === 0 || progressCounter === 1) {
          console.log(`  Progress: ${progressCounter}/${this.config.cardRange.end - this.config.cardRange.start + 1} cards`);
        }
        
        const issues = await this.validateCard(cardNum, language);
        if (issues.length > 0) {
          allIssues.push({ cardNum, language, issues });
        }
      }
    }

    if (allIssues.length === 0) {
      console.log(`\n✅ All cards are complete! No issues found.`);
      return this.generateReport();
    }

    console.log(`\n📊 Found ${allIssues.length} cards with issues`);

    if (!this.config.autoFix) {
      console.log(`\n⚠️  DRY RUN MODE - No fixes will be applied.`);
      console.log(`Run without --dry-run to apply fixes.`);
      return this.generateReport();
    }

    // Phase 2: Fix issues
    console.log(`\n🔧 PHASE 2: FIXING ISSUES`);
    console.log(`${'='.repeat(80)}\n`);
    
    for (const { cardNum, language, issues } of allIssues) {
      console.log(`Fixing card ${this.getCardNumber(cardNum)} (${language})...`);
      
      let remainingIssues = issues;
      let maxAttempts = 3; // Try up to 3 times to resolve all issues
      let attempt = 0;
      
      while (remainingIssues.length > 0 && attempt < maxAttempts) {
        attempt++;
        
        // Sort issues by pipeline order
        const sortedIssues = this.sortIssuesByPipelineOrder(remainingIssues);
        
        for (const issue of sortedIssues) {
          await this.fixIssue(issue, cardNum, language);
        }

        // Re-verify after fixes
        remainingIssues = await this.validateCard(cardNum, language);
        
        if (remainingIssues.length === 0) {
          console.log(`  ✅ Card ${this.getCardNumber(cardNum)} (${language}) is now complete!`);
          break;
        } else if (attempt < maxAttempts) {
          if (this.config.verbose) {
            console.log(`  🔄 Attempt ${attempt}: ${remainingIssues.length} issues remaining, retrying...`);
          }
        }
      }
      
      if (remainingIssues.length > 0) {
        console.log(`  ⚠️  Card ${this.getCardNumber(cardNum)} (${language}) still has ${remainingIssues.length} issues after ${attempt} attempts`);
      }
    }

    return this.generateReport();
  }

  sortIssuesByPipelineOrder(issues) {
    const order = [
      PIPELINE_STEPS.DOWNLOAD,
      PIPELINE_STEPS.RESIZE_ORIGINAL,
      PIPELINE_STEPS.CONVERT_ORIGINAL,
      PIPELINE_STEPS.CROP_ART_ONLY,
      PIPELINE_STEPS.CONVERT_ART_ONLY,
      PIPELINE_STEPS.CROP_ART_AND_NAME,
      PIPELINE_STEPS.CONVERT_ART_AND_NAME
    ];

    return issues.sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));
  }

  generateReport() {
    const totalCards = this.config.cardRange.end - this.config.cardRange.start + 1;
    
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      stats: this.stats,
      summary: {
        totalCards: totalCards,
        totalLanguages: this.config.languages.length,
        checkedCards: this.stats.checked,
        cardsWithIssues: this.stats.missing,
        recoveredCards: this.stats.recovered,
        failedRecoveries: this.stats.failed,
        skippedCards: this.stats.skipped
      },
      byLanguage: this.stats.byLanguage,
      errors: this.errors,
      warnings: this.warnings,
      fixes: this.fixes
    };

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 FINAL REPORT - SET ${this.config.edition}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total Cards per Language: ${report.summary.totalCards}`);
    console.log(`Languages: ${this.config.languages.join(', ')}`);
    console.log(`Total Checked: ${report.summary.checkedCards}`);
    console.log(`Cards with Issues: ${report.summary.cardsWithIssues}`);
    console.log(`Recovered: ${report.summary.recoveredCards}`);
    console.log(`Failed: ${report.summary.failedRecoveries}`);
    console.log(`Skipped: ${report.summary.skippedCards}`);
    
    console.log(`\n📈 By Language:`);
    this.config.languages.forEach(lang => {
      const langStats = this.stats.byLanguage[lang];
      console.log(`  ${lang}: checked=${langStats.checked}, issues=${langStats.missing}, recovered=${langStats.recovered}, failed=${langStats.failed}`);
    });

    console.log(`\n📋 Details:`);
    console.log(`  Errors: ${this.errors.length}`);
    console.log(`  Warnings: ${this.warnings.length}`);
    console.log(`  Fixes Applied: ${this.fixes.length}`);

    // Save report
    const langSuffix = this.config.languages.length === 1 ? this.config.languages[0] : 'ALL';
    const reportPath = `./validation-report-${this.config.edition}-${langSuffix}-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${reportPath}`);
    console.log(`${'='.repeat(80)}`);

    return report;
  }
}

// Main execution
async function main() {
  const validator = new ComprehensivePipelineValidator(CONFIG);
  
  try {
    const report = await validator.validateAndFixAll();
    
    console.log('\n🎉 Validation and fix process completed!');
    
    if (report.summary.failedRecoveries > 0) {
      console.log('⚠️  Some issues could not be fixed. Check the report for details.');
      process.exit(1);
    } else if (report.summary.cardsWithIssues > 0 && !CONFIG.autoFix) {
      console.log('ℹ️  Issues found but not fixed (dry-run mode).');
      process.exit(0);
    } else {
      console.log('✅ All issues have been resolved!');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}

export { ComprehensivePipelineValidator, CONFIG, PIPELINE_STEPS };
