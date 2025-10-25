// Comprehensive Image Pipeline Validation and Fix Script
// This script validates all pipeline steps and fixes issues by working from original files
// It handles: downloads, resizing, AVIF conversion, and proper cropping of variants

import sharp from "sharp";
import { joinImages } from "join-images";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

// Get the directory name of the current module (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve paths relative to project root (parent of scripts directory)
const projectRoot = path.resolve(__dirname, '..');
const rootFolder = path.join(projectRoot, 'public', 'assets', 'images', 'cards');

// Configuration - can be modified for different sets/languages
const CONFIG = {
  edition: "010",
  languages: ["EN"], // Languages to process
  cardRange: { start: 1, end: 242 }, // Set 010 has 216 regular cards + enchanted variants up to 242
  autoFix: true, // Set to false for dry-run (report only)
  skipVariants: false, // Set 010 HAS variants (art_only, art_and_name)
  downloadSource: "all", // "dreamborn", "ravensburg", "lorcast", or "all" (tries all in priority order)
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
    this.lorcastDataCache = null; // Cache for Lorcast JSON data
    this.ravensburgMappingCache = null; // Cache for Ravensburg mapping
    this.stats = {
      checked: 0,
      missing: 0,
      recovered: 0,
      failed: 0,
      skipped: 0,
      byLanguage: {}
    };
    this.sourceAvailability = {
      lorcast: new Set(),
      ravensburg: new Set(),
      disk: new Set()
    };
    this.missingCards = []; // Track missing cards with details

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

  loadLorcastData(edition) {
    if (this.lorcastDataCache) {
      return this.lorcastDataCache;
    }
    
    const lorcastPath = path.join(__dirname, 'lorcast', `${edition}.json`);
    if (!fs.existsSync(lorcastPath)) {
      this.log(`Lorcast JSON file not found: ${lorcastPath}`, 'WARN');
      return null;
    }
    
    this.lorcastDataCache = JSON.parse(fs.readFileSync(lorcastPath, 'utf-8'));
    this.log(`Loaded ${this.lorcastDataCache.length} cards from Lorcast data`, 'INFO');
    return this.lorcastDataCache;
  }

  loadRavensburgMapping() {
    if (this.ravensburgMappingCache) {
      return this.ravensburgMappingCache;
    }

    const mappingPath = path.join(__dirname, 'ravensburg-mapping.json');
    if (!fs.existsSync(mappingPath)) {
      this.log(`Ravensburg mapping file not found: ${mappingPath}`, 'WARN');
      return null;
    }

    this.ravensburgMappingCache = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    this.log(`Loaded ${this.ravensburgMappingCache.length} cards from Ravensburg mapping`, 'INFO');
    return this.ravensburgMappingCache;
  }

  findLorcastCard(cardNumber, language) {
    const lorcastData = this.loadLorcastData(this.config.edition);
    if (!lorcastData) return null;

    const collectorNumber = cardNumber.toString().padStart(3, '0');
    const card = lorcastData.find(c => 
      c.collector_number === collectorNumber && 
      c.lang === language.toLowerCase()
    );
    return card;
  }

  findRavensburgCard(cardNumber, edition) {
    const mapping = this.loadRavensburgMapping();
    if (!mapping) return null;

    const cardNumberPadded = cardNumber.toString().padStart(3, '0');
    const editionPadded = edition.toString().padStart(3, '0');
    const card = mapping.find(m => m.set === editionPadded && m.cardNumber === cardNumberPadded);
    return card;
  }

  analyzeSourceAvailability() {
    const editionNum = parseInt(this.config.edition, 10);
    const editionPadded = editionNum.toString().padStart(3, '0');
    const editionUnpadded = editionNum.toString();

    // Analyze Lorcast availability
    const lorcastData = this.loadLorcastData(this.config.edition);
    if (lorcastData) {
      const primaryLang = this.config.languages[0].toLowerCase();
      lorcastData.forEach(card => {
        // Lorcast set.code might be "10" or "010", so check both
        if (card.lang === primaryLang && card.set &&
            (card.set.code === editionPadded || card.set.code === editionUnpadded)) {
          this.sourceAvailability.lorcast.add(card.collector_number);
        }
      });
    }

    // Analyze Ravensburg availability
    const ravensburgMapping = this.loadRavensburgMapping();
    if (ravensburgMapping) {
      ravensburgMapping.forEach(card => {
        if (card.set === editionPadded) {
          this.sourceAvailability.ravensburg.add(card.cardNumber);
        }
      });
    }

    // Analyze disk availability (first language only)
    const primaryLang = this.config.languages[0];
    for (let cardNum = this.config.cardRange.start; cardNum <= this.config.cardRange.end; cardNum++) {
      const cardNumber = this.getCardNumber(cardNum);
      const paths = this.getFilePaths(cardNum, primaryLang);
      // Count cards with EITHER .webp OR .avif
      if (this.checkFileExists(paths.originalWebp) || this.checkFileExists(paths.originalAvif)) {
        this.sourceAvailability.disk.add(cardNumber);
      }
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

      // Track missing cards with their names
      const lorcastCard = this.findLorcastCard(cardNumber, language);
      const cardName = lorcastCard ? lorcastCard.name : `Card ${cardNumber}`;

      // Check if already tracked (may be called multiple times)
      const alreadyTracked = this.missingCards.some(m =>
        m.cardNumber === cardNumber && m.language === language
      );

      if (!alreadyTracked) {
        this.missingCards.push({
          cardNumber,
          cardName,
          language,
          issues: issues.map(i => i.step)
        });
      }

      return issues;
    } else {
      if (this.config.verbose) {
        this.log(`Card ${cardNumber} (${language}): Complete ✓`, 'INFO');
      }
      return [];
    }
  }

  // === FIX OPERATIONS ===

  async downloadFromSource(source, cardNumber, language, edition) {
    const cardNumberPadded = cardNumber.toString().padStart(3, "0");
    const editionPadded = edition.toString().padStart(3, "0");
    
    let url, destination, extension;
    
    if (source === 'lorcast') {
      // Lorcast: Find card in JSON and get URL
      const card = this.findLorcastCard(cardNumberPadded, language);
      if (!card) {
        throw new Error(`Card not found in Lorcast data`);
      }
      
      url = card.image_uris.digital.large;
      if (!url) {
        throw new Error(`No image URL found`);
      }
      
      // Detect extension from URL
      const urlLower = url.toLowerCase();
      extension = urlLower.includes(".avif") ? "avif" : 
                  urlLower.includes(".webp") ? "webp" : 
                  urlLower.includes(".jpg") ? "jpg" : "avif";
      
      destination = `${rootFolder}/${language.toUpperCase()}/${editionPadded}/${cardNumberPadded}.${extension}`;
    } else if (source === "ravensburg") {
      // Ravensburg: Get URL from mapping file
      const mappingPath = path.join(__dirname, 'ravensburg-mapping.json');

      if (!fs.existsSync(mappingPath)) {
        throw new Error('Ravensburg mapping file not found');
      }
      
      const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
      const cardEntry = mapping.find(m => m.set === editionPadded && m.cardNumber === cardNumberPadded);
      
      if (!cardEntry || !cardEntry.url) {
        throw new Error(`Card not found in mapping`);
      }
      
      url = cardEntry.url;
      extension = "webp";
      destination = `${rootFolder}/${language.toUpperCase()}/${editionPadded}/${cardNumberPadded}.webp`;
    } else if (source === 'dreamborn') {
      // Dreamborn
      url = `https://cdn.dreamborn.ink/images/${language.toLowerCase()}/cards/${editionPadded}-${cardNumberPadded}`;
      extension = "webp";
      destination = `${rootFolder}/${language.toUpperCase()}/${editionPadded}/${cardNumberPadded}.webp`;
    } else {
      throw new Error(`Unknown download source: ${source}`);
    }

    this.log(`Trying ${source}: ${url}`, 'FIX');

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
            .once("close", async () => {
              this.log(`Downloaded ${destination} from ${source}`, 'FIX');

              // If Lorcast downloaded AVIF but pipeline needs WebP, convert it
              if (source === 'lorcast' && extension === 'avif') {
                const webpPath = destination.replace('.avif', '.webp');
                try {
                  await sharp(destination)
                    .webp({ quality: 90 })
                    .toFile(webpPath);
                  this.log(`Converted ${destination} to WebP`, 'FIX');
                  resolve(webpPath);
                } catch (error) {
                  this.log(`Failed to convert AVIF to WebP: ${error.message}`, 'ERROR');
                  reject(error);
                }
              } else {
                resolve(destination);
              }
            });
        } else {
          res.resume();
          reject(new Error(`Request Failed With Status Code: ${res.statusCode}`));
        }
      });
    });
  }

  async downloadImage(cardNumber, language, edition) {
    const cardNumberPadded = cardNumber.toString().padStart(3, "0");

    // If downloadSource is "all", try each source in priority order
    if (this.config.downloadSource === 'all') {
      const sources = ['ravensburg', 'dreamborn', 'lorcast'];

      for (const source of sources) {
        try {
          this.log(`Attempting download from ${source} for card ${cardNumberPadded} (${language})`, 'FIX');
          const result = await this.downloadFromSource(source, cardNumber, language, edition);
          this.log(`Successfully downloaded card ${cardNumberPadded} from ${source}`, 'FIX');
          return result;
        } catch (error) {
          this.log(`Failed to download from ${source}: ${error.message}`, 'WARN');
          // Continue to next source
        }
      }

      // If all sources failed
      this.log(`Card ${cardNumberPadded} could not be downloaded from any source`, 'ERROR');
      return Promise.reject(new Error(`Failed to download from all sources`));
    } else {
      // Use single specified source
      return this.downloadFromSource(this.config.downloadSource, cardNumber, language, edition);
    }
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

    // Analyze source availability
    console.log(`📊 ANALYZING SOURCE AVAILABILITY`);
    console.log(`${'='.repeat(80)}\n`);
    this.analyzeSourceAvailability();

    const totalCardsInSet = this.config.cardRange.end - this.config.cardRange.start + 1;
    console.log(`Total cards in set: ${totalCardsInSet}`);
    console.log(`Cards available in Lorcast: ${this.sourceAvailability.lorcast.size}`);
    console.log(`Cards available in Ravensburg: ${this.sourceAvailability.ravensburg.size}`);
    console.log(`Cards available on Disk: ${this.sourceAvailability.disk.size}`);
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
      sourceAvailability: {
        lorcast: this.sourceAvailability.lorcast.size,
        ravensburg: this.sourceAvailability.ravensburg.size,
        disk: this.sourceAvailability.disk.size,
        lorcastCards: Array.from(this.sourceAvailability.lorcast).sort(),
        ravensburgCards: Array.from(this.sourceAvailability.ravensburg).sort(),
        diskCards: Array.from(this.sourceAvailability.disk).sort()
      },
      missingCards: this.missingCards,
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

    // Display missing cards
    if (this.missingCards.length > 0) {
      console.log(`\n❌ MISSING CARDS (${this.missingCards.length}):`);
      console.log(`${'='.repeat(80)}`);
      this.missingCards.forEach(card => {
        const issuesStr = card.issues.join(', ');
        console.log(`  ${card.cardNumber} - ${card.cardName} (${card.language})`);
        console.log(`    Issues: ${issuesStr}`);
      });
    }

    // Save report
    const langSuffix = this.config.languages.length === 1 ? this.config.languages[0] : 'ALL';
    const reportPath = path.join(projectRoot, `validation-report-${this.config.edition}-${langSuffix}-${Date.now()}.json`);
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
