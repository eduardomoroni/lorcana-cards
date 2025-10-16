// Verification and Recovery Script for Lorcana Card Image Pipeline
// This script checks all pipeline steps and attempts to recover missing files

import sharp from "sharp";
import { joinImages } from "join-images";
import fs from "fs";
import path from "path";
import https from "https";
import { rootFolder, languages, edition } from "./shared.js";

// Configuration - can be modified for different sets/languages
const CONFIG = {
  edition: "010", // Override from shared.js if needed
  language: "EN", // Single language focus
  cardRange: { start: 1, end: 242 }, // Based on analysis of existing files
  verbose: true, // Set to false for cleaner output
  skipVariants: false // Set to true for editions that only have original files (like 010)
};

// Pipeline steps enum
const PIPELINE_STEPS = {
  DOWNLOAD: 'download',
  CROP_ART_ONLY: 'crop_art_only',
  CROP_ART_AND_NAME: 'crop_art_and_name',
  CONVERT_ORIGINAL: 'convert_original',
  CONVERT_ART_ONLY: 'convert_art_only',
  CONVERT_ART_AND_NAME: 'convert_art_and_name',
  RESIZE_ORIGINAL: 'resize_original',
  RESIZE_ART_ONLY: 'resize_art_only',
  RESIZE_ART_AND_NAME: 'resize_art_and_name'
};

class PipelineVerifier {
  constructor(config) {
    this.config = config;
    this.errors = [];
    this.warnings = [];
    this.fixes = [];
    this.stats = {
      checked: 0,
      missing: 0,
      recovered: 0,
      failed: 0
    };
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    
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

  getFilePaths(cardNum, language = null) {
    const lang = language || this.config.language;
    const cardNumber = this.getCardNumber(cardNum);
    
    return {
      // Original files
      originalWebp: `${rootFolder}/${lang}/${this.config.edition}/${cardNumber}.webp`,
      originalAvif: `${rootFolder}/${lang}/${this.config.edition}/${cardNumber}.avif`,
      
      // Art only files (shared across languages)
      artOnlyWebp: `${rootFolder}/${this.config.edition}/art_only/${cardNumber}.webp`,
      artOnlyAvif: `${rootFolder}/${this.config.edition}/art_only/${cardNumber}.avif`,
      
      // Art and name files
      artAndNameWebp: `${rootFolder}/${lang}/${this.config.edition}/art_and_name/${cardNumber}.webp`,
      artAndNameAvif: `${rootFolder}/${lang}/${this.config.edition}/art_and_name/${cardNumber}.avif`
    };
  }

  checkFileExists(filePath) {
    const exists = fs.existsSync(filePath);
    if (this.config.verbose) {
      this.log(`Checking ${filePath}: ${exists ? 'EXISTS' : 'MISSING'}`, exists ? 'INFO' : 'WARN');
    }
    return exists;
  }

  async checkImageDimensions(filePath, expectedDimensions) {
    try {
      const image = await sharp(filePath);
      const metadata = await image.metadata();
      const isCorrect = metadata.width === expectedDimensions.width && metadata.height === expectedDimensions.height;
      
      if (this.config.verbose) {
        this.log(`Dimensions for ${filePath}: ${metadata.width}x${metadata.height} (expected: ${expectedDimensions.width}x${expectedDimensions.height}) ${isCorrect ? 'CORRECT' : 'INCORRECT'}`, isCorrect ? 'INFO' : 'WARN');
      }
      
      return isCorrect;
    } catch (error) {
      this.log(`Error checking dimensions for ${filePath}: ${error.message}`, 'ERROR');
      return false;
    }
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

  async verifyCard(cardNum) {
    const cardNumber = this.getCardNumber(cardNum);
    this.log(`\n=== VERIFYING CARD ${cardNumber} ===`, 'INFO');
    
    const paths = this.getFilePaths(cardNum);
    const issues = [];

    // Check Step 1: Original Download
    this.log(`Step 1: Checking original download for card ${cardNumber}`, 'INFO');
    const originalExists = this.checkFileExists(paths.originalWebp);
    if (!originalExists) {
      issues.push({ step: PIPELINE_STEPS.DOWNLOAD, path: paths.originalWebp });
      this.log(`MISSING: Original webp file for card ${cardNumber}`, 'ERROR');
    }

    // Check Step 2: Art Only Variants (only if original exists and variants are not skipped)
    if (originalExists && !this.config.skipVariants) {
      this.log(`Step 2: Checking art_only variants for card ${cardNumber}`, 'INFO');
      const artOnlyWebpExists = this.checkFileExists(paths.artOnlyWebp);
      const artOnlyAvifExists = this.checkFileExists(paths.artOnlyAvif);
      
      if (!artOnlyWebpExists) {
        issues.push({ step: PIPELINE_STEPS.CROP_ART_ONLY, path: paths.artOnlyWebp });
        this.log(`MISSING: Art only webp file for card ${cardNumber}`, 'ERROR');
      }
      if (!artOnlyAvifExists) {
        issues.push({ step: PIPELINE_STEPS.CONVERT_ART_ONLY, path: paths.artOnlyAvif });
        this.log(`MISSING: Art only avif file for card ${cardNumber}`, 'ERROR');
      }

      // Check dimensions for art_only files
      if (artOnlyWebpExists) {
        const dimensionsCorrect = await this.checkImageDimensions(paths.artOnlyWebp, this.getExpectedDimensions('art_only'));
        if (!dimensionsCorrect) {
          issues.push({ step: PIPELINE_STEPS.RESIZE_ART_ONLY, path: paths.artOnlyWebp });
        }
      }
    } else if (this.config.skipVariants) {
      this.log(`Step 2: Skipping art_only variants (skipVariants=true for edition ${this.config.edition})`, 'INFO');
    }

    // Check Step 3: Art and Name Variants
    if (originalExists && !this.config.skipVariants) {
      this.log(`Step 3: Checking art_and_name variants for card ${cardNumber}`, 'INFO');
      const artAndNameWebpExists = this.checkFileExists(paths.artAndNameWebp);
      const artAndNameAvifExists = this.checkFileExists(paths.artAndNameAvif);
      
      if (!artAndNameWebpExists) {
        issues.push({ step: PIPELINE_STEPS.CROP_ART_AND_NAME, path: paths.artAndNameWebp });
        this.log(`MISSING: Art and name webp file for card ${cardNumber}`, 'ERROR');
      }
      if (!artAndNameAvifExists) {
        issues.push({ step: PIPELINE_STEPS.CONVERT_ART_AND_NAME, path: paths.artAndNameAvif });
        this.log(`MISSING: Art and name avif file for card ${cardNumber}`, 'ERROR');
      }

      // Check dimensions for art_and_name files
      if (artAndNameWebpExists) {
        const dimensionsCorrect = await this.checkImageDimensions(paths.artAndNameWebp, this.getExpectedDimensions('art_and_name'));
        if (!dimensionsCorrect) {
          issues.push({ step: PIPELINE_STEPS.RESIZE_ART_AND_NAME, path: paths.artAndNameWebp });
        }
      }
    } else if (this.config.skipVariants) {
      this.log(`Step 3: Skipping art_and_name variants (skipVariants=true for edition ${this.config.edition})`, 'INFO');
    }

    // Check Step 4: Original AVIF conversion
    if (originalExists) {
      this.log(`Step 4: Checking original avif conversion for card ${cardNumber}`, 'INFO');
      const originalAvifExists = this.checkFileExists(paths.originalAvif);
      if (!originalAvifExists) {
        issues.push({ step: PIPELINE_STEPS.CONVERT_ORIGINAL, path: paths.originalAvif });
        this.log(`MISSING: Original avif file for card ${cardNumber}`, 'ERROR');
      }

      // Check dimensions for original files
      const dimensionsCorrect = await this.checkImageDimensions(paths.originalWebp, this.getExpectedDimensions('original'));
      if (!dimensionsCorrect) {
        issues.push({ step: PIPELINE_STEPS.RESIZE_ORIGINAL, path: paths.originalWebp });
      }
    }

    this.stats.checked++;
    if (issues.length > 0) {
      this.stats.missing++;
      this.log(`Card ${cardNumber} has ${issues.length} issues`, 'ERROR');
      return issues;
    } else {
      this.log(`Card ${cardNumber} is complete ✓`, 'INFO');
      return [];
    }
  }

  // Recovery functions adapted from existing scripts
  async downloadImage(cardNumber, language, edition) {
    const cardNumberPadded = cardNumber.toString().padStart(3, "0");
    const editionPadded = edition.toString().padStart(3, "0");
    const url = `https://cdn.dreamborn.ink/images/${language.toLowerCase()}/cards/${editionPadded}-${cardNumberPadded}`;
    const destination = `${rootFolder}/${language.toUpperCase()}/${editionPadded}/${cardNumberPadded}.webp`;

    this.log(`Attempting to download ${url} to ${destination}`, 'FIX');

    const folder = destination.replace(/\/[^/]+$/, "");
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
              this.log(`Successfully downloaded ${destination}`, 'FIX');
              resolve(destination);
            });
        } else {
          res.resume();
          this.log(`Download failed for ${url} - Status: ${res.statusCode}`, 'ERROR');
          reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
        }
      });
    });
  }

  async cropImage(sourceFile, destinationFile, artOnly) {
    this.log(`Cropping ${sourceFile} to ${destinationFile} (artOnly: ${artOnly})`, 'FIX');

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

      // Create top crop from source
      const startHeight = 0;
      const endHeight = Math.floor(metadata.height * (artOnly ? 0.52 : 0.674));

      await sharp(sourceFile)
        .extract({
          left: 0,
          top: startHeight,
          width: metadata.width,
          height: endHeight - startHeight,
        })
        .toFile(topFile);

      // Create bottom crop from source
      const bottomStartHeight = Math.floor(metadata.height * (artOnly ? 0.931 : 0.925));
      const bottomEndHeight = Math.floor(metadata.height);

      await sharp(sourceFile)
        .extract({
          left: 0,
          top: bottomStartHeight,
          width: metadata.width,
          height: bottomEndHeight - bottomStartHeight,
        })
        .toFile(bottomFile);

      // Join images to temporary destination
      const joinedImage = await joinImages([topFile, bottomFile], { direction: "vertical" });
      await joinedImage.toFile(tempDestination);

      // Only move to final destination if cropping was successful
      fs.renameSync(tempDestination, destinationFile);

      this.log(`Successfully cropped ${destinationFile}`, 'FIX');
    } catch (error) {
      // Clean up any partial files on error
      [tempDestination, topFile, bottomFile].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
      throw error;
    } finally {
      // Clean up temporary files
      [topFile, bottomFile].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
    }
  }

  async convertToAvif(webpPath, avifPath) {
    this.log(`Converting ${webpPath} to ${avifPath}`, 'FIX');
    
    await sharp(webpPath)
      .avif({ quality: 50, speed: 1 })
      .toFile(avifPath);
      
    this.log(`Successfully converted ${avifPath}`, 'FIX');
  }

  async resizeImage(filePath, dimensions) {
    this.log(`Resizing ${filePath} to ${dimensions.width}x${dimensions.height}`, 'FIX');
    
    const tempFile = filePath.replace(".webp", "_temp.webp").replace(".avif", "_temp.avif");
    fs.copyFileSync(filePath, tempFile);

    await sharp(tempFile)
      .resize(dimensions.width, dimensions.height)
      .toFile(filePath);

    fs.unlinkSync(tempFile);
    this.log(`Successfully resized ${filePath}`, 'FIX');
  }

  async fixIssue(issue, cardNum) {
    const cardNumber = this.getCardNumber(cardNum);
    const paths = this.getFilePaths(cardNum);

    try {
      switch (issue.step) {
        case PIPELINE_STEPS.DOWNLOAD:
          await this.downloadImage(cardNum, this.config.language, this.config.edition);
          break;

        case PIPELINE_STEPS.CROP_ART_ONLY:
          await this.cropImage(paths.originalWebp, paths.artOnlyWebp, true);
          break;

        case PIPELINE_STEPS.CROP_ART_AND_NAME:
          await this.cropImage(paths.originalWebp, paths.artAndNameWebp, false);
          break;

        case PIPELINE_STEPS.CONVERT_ORIGINAL:
          await this.convertToAvif(paths.originalWebp, paths.originalAvif);
          break;

        case PIPELINE_STEPS.CONVERT_ART_ONLY:
          await this.convertToAvif(paths.artOnlyWebp, paths.artOnlyAvif);
          break;

        case PIPELINE_STEPS.CONVERT_ART_AND_NAME:
          await this.convertToAvif(paths.artAndNameWebp, paths.artAndNameAvif);
          break;

        case PIPELINE_STEPS.RESIZE_ORIGINAL:
          await this.resizeImage(paths.originalWebp, this.getExpectedDimensions('original'));
          if (fs.existsSync(paths.originalAvif)) {
            await this.resizeImage(paths.originalAvif, this.getExpectedDimensions('original'));
          }
          break;

        case PIPELINE_STEPS.RESIZE_ART_ONLY:
          await this.resizeImage(paths.artOnlyWebp, this.getExpectedDimensions('art_only'));
          if (fs.existsSync(paths.artOnlyAvif)) {
            await this.resizeImage(paths.artOnlyAvif, this.getExpectedDimensions('art_only'));
          }
          break;

        case PIPELINE_STEPS.RESIZE_ART_AND_NAME:
          await this.resizeImage(paths.artAndNameWebp, this.getExpectedDimensions('art_and_name'));
          if (fs.existsSync(paths.artAndNameAvif)) {
            await this.resizeImage(paths.artAndNameAvif, this.getExpectedDimensions('art_and_name'));
          }
          break;

        default:
          this.log(`Unknown issue step: ${issue.step}`, 'ERROR');
          return false;
      }

      this.stats.recovered++;
      this.log(`Successfully fixed issue for card ${cardNumber}: ${issue.step}`, 'FIX');
      return true;
    } catch (error) {
      this.stats.failed++;
      this.log(`Failed to fix issue for card ${cardNumber}: ${issue.step} - ${error.message}`, 'ERROR');
      return false;
    }
  }

  async verifyAndFixAll() {
    this.log(`\n🔍 Starting verification for set ${this.config.edition}, language ${this.config.language}`, 'INFO');
    this.log(`Checking cards ${this.config.cardRange.start} to ${this.config.cardRange.end}`, 'INFO');

    const allIssues = [];

    // First pass: Identify all issues
    this.log(`\n📋 PHASE 1: IDENTIFYING ISSUES`, 'INFO');
    for (let cardNum = this.config.cardRange.start; cardNum <= this.config.cardRange.end; cardNum++) {
      const issues = await this.verifyCard(cardNum);
      if (issues.length > 0) {
        allIssues.push({ cardNum, issues });
      }
    }

    if (allIssues.length === 0) {
      this.log(`\n✅ All cards are complete! No issues found.`, 'INFO');
      return this.generateReport();
    }

    // Second pass: Fix issues
    this.log(`\n🔧 PHASE 2: FIXING ISSUES`, 'INFO');
    this.log(`Found issues with ${allIssues.length} cards. Attempting to fix...`, 'INFO');

    for (const { cardNum, issues } of allIssues) {
      this.log(`\nFixing card ${this.getCardNumber(cardNum)}...`, 'INFO');
      
      // Sort issues by pipeline order to fix them in the correct sequence
      const sortedIssues = this.sortIssuesByPipelineOrder(issues);
      
      for (const issue of sortedIssues) {
        await this.fixIssue(issue, cardNum);
      }

      // Re-verify the card after fixes
      this.log(`Re-verifying card ${this.getCardNumber(cardNum)} after fixes...`, 'INFO');
      const remainingIssues = await this.verifyCard(cardNum);
      if (remainingIssues.length === 0) {
        this.log(`✅ Card ${this.getCardNumber(cardNum)} is now complete!`, 'FIX');
      } else {
        this.log(`⚠️ Card ${this.getCardNumber(cardNum)} still has ${remainingIssues.length} issues`, 'WARN');
      }
    }

    return this.generateReport();
  }

  sortIssuesByPipelineOrder(issues) {
    const order = [
      PIPELINE_STEPS.DOWNLOAD,
      PIPELINE_STEPS.CROP_ART_ONLY,
      PIPELINE_STEPS.CROP_ART_AND_NAME,
      PIPELINE_STEPS.CONVERT_ORIGINAL,
      PIPELINE_STEPS.CONVERT_ART_ONLY,
      PIPELINE_STEPS.CONVERT_ART_AND_NAME,
      PIPELINE_STEPS.RESIZE_ORIGINAL,
      PIPELINE_STEPS.RESIZE_ART_ONLY,
      PIPELINE_STEPS.RESIZE_ART_AND_NAME
    ];

    return issues.sort((a, b) => {
      return order.indexOf(a.step) - order.indexOf(b.step);
    });
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      stats: this.stats,
      summary: {
        totalCards: this.config.cardRange.end - this.config.cardRange.start + 1,
        checkedCards: this.stats.checked,
        cardsWithIssues: this.stats.missing,
        recoveredCards: this.stats.recovered,
        failedRecoveries: this.stats.failed
      },
      errors: this.errors,
      warnings: this.warnings,
      fixes: this.fixes
    };

    this.log(`\n📊 FINAL REPORT`, 'INFO');
    this.log(`Total Cards: ${report.summary.totalCards}`, 'INFO');
    this.log(`Checked Cards: ${report.summary.checkedCards}`, 'INFO');
    this.log(`Cards with Issues: ${report.summary.cardsWithIssues}`, 'INFO');
    this.log(`Recovered Cards: ${report.summary.recoveredCards}`, 'INFO');
    this.log(`Failed Recoveries: ${report.summary.failedRecoveries}`, 'INFO');
    this.log(`Errors: ${this.errors.length}`, 'INFO');
    this.log(`Warnings: ${this.warnings.length}`, 'INFO');
    this.log(`Fixes Applied: ${this.fixes.length}`, 'INFO');

    // Write detailed report to file
    const reportPath = `./pipeline-report-${this.config.edition}-${this.config.language}-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`Detailed report saved to: ${reportPath}`, 'INFO');

    return report;
  }
}

// Main execution
async function main() {
  // You can override config here for different sets/languages
  const verifier = new PipelineVerifier(CONFIG);
  
  try {
    const report = await verifier.verifyAndFixAll();
    console.log('\n🎉 Verification and recovery process completed!');
    
    if (report.summary.failedRecoveries > 0) {
      console.log('⚠️ Some issues could not be automatically fixed. Check the report for details.');
      process.exit(1);
    } else {
      console.log('✅ All issues have been resolved successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Fatal error during verification:', error);
    process.exit(1);
  }
}

// Allow script to be run directly or imported
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}

export { PipelineVerifier, CONFIG, PIPELINE_STEPS };
