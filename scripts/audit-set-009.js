// Audit Script for Lorcana Card Set 009
// This script ONLY checks for missing files across all languages
// It will NOT automatically fix or recreate any files

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { rootFolder } from "./shared.js";

// Configuration for Set 009 Audit
const AUDIT_CONFIG = {
  edition: "009",
  languages: ["EN", "IT", "DE", "FR"],
  cardRange: { start: 1, end: 251 }, // Based on file system analysis
  skipVariants: false // Set 009 should have all variants
};

class Set009Auditor {
  constructor(config) {
    this.config = config;
    this.results = {
      byLanguage: {},
      byCard: {},
      summary: {
        totalExpectedFiles: 0,
        totalExistingFiles: 0,
        totalMissingFiles: 0
      }
    };

    // Initialize results structure
    this.config.languages.forEach(lang => {
      this.results.byLanguage[lang] = {
        originalWebp: { missing: [], existing: 0, wrongDimensions: [] },
        originalAvif: { missing: [], existing: 0, wrongDimensions: [] },
        artOnlyWebp: { missing: [], existing: 0, wrongDimensions: [] },
        artOnlyAvif: { missing: [], existing: 0, wrongDimensions: [] },
        artAndNameWebp: { missing: [], existing: 0, wrongDimensions: [] },
        artAndNameAvif: { missing: [], existing: 0, wrongDimensions: [] }
      };
    });
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${timestamp}] [${type}] ${message}`);
  }

  getCardNumber(num) {
    return num.toString().padStart(3, "0");
  }

  getFilePaths(cardNum, language) {
    const cardNumber = this.getCardNumber(cardNum);
    
    return {
      // Original files (language-specific)
      originalWebp: {
        path: `${rootFolder}/${language}/${this.config.edition}/${cardNumber}.webp`,
        type: 'original',
        format: 'webp',
        language: language
      },
      originalAvif: {
        path: `${rootFolder}/${language}/${this.config.edition}/${cardNumber}.avif`,
        type: 'original',
        format: 'avif',
        language: language
      },
      
      // Art only files (shared across languages)
      artOnlyWebp: {
        path: `${rootFolder}/${this.config.edition}/art_only/${cardNumber}.webp`,
        type: 'art_only',
        format: 'webp',
        language: 'shared'
      },
      artOnlyAvif: {
        path: `${rootFolder}/${this.config.edition}/art_only/${cardNumber}.avif`,
        type: 'art_only',
        format: 'avif',
        language: 'shared'
      },
      
      // Art and name files (language-specific)
      artAndNameWebp: {
        path: `${rootFolder}/${language}/${this.config.edition}/art_and_name/${cardNumber}.webp`,
        type: 'art_and_name',
        format: 'webp',
        language: language
      },
      artAndNameAvif: {
        path: `${rootFolder}/${language}/${this.config.edition}/art_and_name/${cardNumber}.avif`,
        type: 'art_and_name',
        format: 'avif',
        language: language
      }
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

  async checkFileExists(fileInfo) {
    const exists = fs.existsSync(fileInfo.path);
    
    if (!exists) {
      return { exists: false, dimensions: null, correct: false };
    }

    // Check dimensions
    try {
      const metadata = await sharp(fileInfo.path).metadata();
      const expected = this.getExpectedDimensions(fileInfo.type);
      const dimensionsCorrect = metadata.width === expected.width && metadata.height === expected.height;
      
      return {
        exists: true,
        dimensions: { width: metadata.width, height: metadata.height },
        expected: expected,
        correct: dimensionsCorrect
      };
    } catch (error) {
      return {
        exists: true,
        dimensions: null,
        correct: false,
        error: error.message
      };
    }
  }

  async auditCard(cardNum, language) {
    const cardNumber = this.getCardNumber(cardNum);
    const paths = this.getFilePaths(cardNum, language);
    const results = {};

    // Check all file types
    for (const [key, fileInfo] of Object.entries(paths)) {
      results[key] = await this.checkFileExists(fileInfo);
      
      // Track in language results
      const resultKey = key; // originalWebp, originalAvif, etc.
      if (results[key].exists) {
        this.results.byLanguage[language][resultKey].existing++;
        if (!results[key].correct) {
          this.results.byLanguage[language][resultKey].wrongDimensions.push({
            card: cardNumber,
            actual: results[key].dimensions,
            expected: results[key].expected
          });
        }
      } else {
        this.results.byLanguage[language][resultKey].missing.push(cardNumber);
      }
    }

    return results;
  }

  async auditAllCards() {
    this.log(`\n🔍 Starting audit for Set ${this.config.edition}`, 'INFO');
    this.log(`Languages: ${this.config.languages.join(', ')}`, 'INFO');
    this.log(`Card range: ${this.config.cardRange.start} to ${this.config.cardRange.end}`, 'INFO');
    this.log(`Total cards to check: ${this.config.cardRange.end - this.config.cardRange.start + 1}`, 'INFO');

    const totalCards = this.config.cardRange.end - this.config.cardRange.start + 1;
    
    // Expected files per language:
    // - 2 original files (webp + avif)
    // - 2 art_and_name files (webp + avif)
    // Shared across all languages:
    // - 2 art_only files (webp + avif)
    const filesPerCardPerLanguage = 4; // original + art_and_name (webp + avif each)
    const sharedFilesPerCard = 2; // art_only (webp + avif)
    
    this.results.summary.totalExpectedFiles = 
      (totalCards * filesPerCardPerLanguage * this.config.languages.length) + 
      (totalCards * sharedFilesPerCard);

    // Track art_only files separately to avoid double counting
    const artOnlyChecked = new Set();

    for (let cardNum = this.config.cardRange.start; cardNum <= this.config.cardRange.end; cardNum++) {
      const cardNumber = this.getCardNumber(cardNum);
      
      if (cardNum % 50 === 0 || cardNum === this.config.cardRange.start) {
        this.log(`Progress: Checking card ${cardNumber}...`, 'INFO');
      }

      for (const language of this.config.languages) {
        const results = await this.auditCard(cardNum, language);
        
        // Store by card for cross-language analysis
        if (!this.results.byCard[cardNumber]) {
          this.results.byCard[cardNumber] = {};
        }
        this.results.byCard[cardNumber][language] = results;

        // Count art_only files only once (they're shared)
        if (language === this.config.languages[0]) {
          if (results.artOnlyWebp.exists) {
            artOnlyChecked.add(`${cardNumber}_webp`);
          }
          if (results.artOnlyAvif.exists) {
            artOnlyChecked.add(`${cardNumber}_avif`);
          }
        }
      }
    }

    this.calculateSummary();
    return this.generateReport();
  }

  calculateSummary() {
    let totalExisting = 0;
    let totalMissing = 0;

    // Count language-specific files
    for (const language of this.config.languages) {
      const langResults = this.results.byLanguage[language];
      totalExisting += langResults.originalWebp.existing;
      totalExisting += langResults.originalAvif.existing;
      totalExisting += langResults.artAndNameWebp.existing;
      totalExisting += langResults.artAndNameAvif.existing;
      totalMissing += langResults.originalWebp.missing.length;
      totalMissing += langResults.originalAvif.missing.length;
      totalMissing += langResults.artAndNameWebp.missing.length;
      totalMissing += langResults.artAndNameAvif.missing.length;
    }

    // Count shared art_only files (only once, using first language)
    const firstLang = this.config.languages[0];
    totalExisting += this.results.byLanguage[firstLang].artOnlyWebp.existing;
    totalExisting += this.results.byLanguage[firstLang].artOnlyAvif.existing;
    totalMissing += this.results.byLanguage[firstLang].artOnlyWebp.missing.length;
    totalMissing += this.results.byLanguage[firstLang].artOnlyAvif.missing.length;

    this.results.summary.totalExistingFiles = totalExisting;
    this.results.summary.totalMissingFiles = totalMissing;
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      summary: this.results.summary,
      byLanguage: {},
      criticalIssues: [],
      dimensionIssues: [],
      recommendations: []
    };

    // Process results by language
    for (const language of this.config.languages) {
      const langResults = this.results.byLanguage[language];
      
      report.byLanguage[language] = {
        originalWebp: {
          existing: langResults.originalWebp.existing,
          missing: langResults.originalWebp.missing.length,
          missingCards: langResults.originalWebp.missing,
          wrongDimensions: langResults.originalWebp.wrongDimensions.length
        },
        originalAvif: {
          existing: langResults.originalAvif.existing,
          missing: langResults.originalAvif.missing.length,
          missingCards: langResults.originalAvif.missing,
          wrongDimensions: langResults.originalAvif.wrongDimensions.length
        },
        artAndNameWebp: {
          existing: langResults.artAndNameWebp.existing,
          missing: langResults.artAndNameWebp.missing.length,
          missingCards: langResults.artAndNameWebp.missing,
          wrongDimensions: langResults.artAndNameWebp.wrongDimensions.length
        },
        artAndNameAvif: {
          existing: langResults.artAndNameAvif.existing,
          missing: langResults.artAndNameAvif.missing.length,
          missingCards: langResults.artAndNameAvif.missing,
          wrongDimensions: langResults.artAndNameAvif.wrongDimensions.length
        }
      };

      // Identify critical issues (missing original files)
      if (langResults.originalWebp.missing.length > 0) {
        report.criticalIssues.push({
          language: language,
          type: 'missing_original_webp',
          count: langResults.originalWebp.missing.length,
          cards: langResults.originalWebp.missing,
          severity: 'HIGH',
          reason: 'Original WebP files are the source for all other variants'
        });
      }

      // Collect dimension issues
      if (langResults.originalWebp.wrongDimensions.length > 0) {
        report.dimensionIssues.push({
          language: language,
          type: 'original_webp',
          issues: langResults.originalWebp.wrongDimensions
        });
      }
    }

    // Check shared art_only files
    const firstLang = this.config.languages[0];
    const artOnlyMissingWebp = this.results.byLanguage[firstLang].artOnlyWebp.missing.length;
    const artOnlyMissingAvif = this.results.byLanguage[firstLang].artOnlyAvif.missing.length;

    if (artOnlyMissingWebp > 0) {
      report.criticalIssues.push({
        language: 'SHARED',
        type: 'missing_art_only_webp',
        count: artOnlyMissingWebp,
        cards: this.results.byLanguage[firstLang].artOnlyWebp.missing,
        severity: 'MEDIUM',
        reason: 'Art-only files are shared across all languages'
      });
    }

    if (artOnlyMissingAvif > 0) {
      report.criticalIssues.push({
        language: 'SHARED',
        type: 'missing_art_only_avif',
        count: artOnlyMissingAvif,
        cards: this.results.byLanguage[firstLang].artOnlyAvif.missing,
        severity: 'MEDIUM',
        reason: 'Art-only files are shared across all languages'
      });
    }

    // Generate recommendations
    this.generateRecommendations(report);

    return report;
  }

  generateRecommendations(report) {
    const recs = [];

    // Check for missing originals
    for (const language of this.config.languages) {
      const langData = report.byLanguage[language];
      
      if (langData.originalWebp.missing > 0) {
        recs.push({
          priority: 'HIGH',
          language: language,
          action: 'download_originals',
          description: `Download ${langData.originalWebp.missing} missing original WebP files for ${language}`,
          cards: langData.originalWebp.missingCards,
          reason: 'These are source files needed to generate all other variants'
        });
      }

      if (langData.originalWebp.existing > 0 && langData.originalAvif.missing > 0) {
        recs.push({
          priority: 'MEDIUM',
          language: language,
          action: 'convert_to_avif',
          description: `Convert ${langData.originalAvif.missing} WebP files to AVIF for ${language}`,
          cards: langData.originalAvif.missingCards,
          reason: 'Original WebP exists, can generate AVIF from it'
        });
      }

      if (langData.originalWebp.existing > 0 && langData.artAndNameWebp.missing > 0) {
        recs.push({
          priority: 'MEDIUM',
          language: language,
          action: 'crop_art_and_name',
          description: `Crop ${langData.artAndNameWebp.missing} art_and_name WebP files for ${language}`,
          cards: langData.artAndNameWebp.missingCards,
          reason: 'Original WebP exists, can crop to generate art_and_name variant'
        });
      }
    }

    // Check shared art_only files
    const firstLang = this.config.languages[0];
    const artOnlyMissingWebp = this.results.byLanguage[firstLang].artOnlyWebp.missing;
    
    if (artOnlyMissingWebp.length > 0) {
      // Check if originals exist
      const cardsWithOriginals = artOnlyMissingWebp.filter(cardNum => {
        const card = this.results.byCard[cardNum];
        return card && card[firstLang] && card[firstLang].originalWebp.exists;
      });

      if (cardsWithOriginals.length > 0) {
        recs.push({
          priority: 'MEDIUM',
          language: 'SHARED',
          action: 'crop_art_only',
          description: `Crop ${cardsWithOriginals.length} art_only WebP files from originals`,
          cards: cardsWithOriginals,
          reason: 'Original files exist, can crop to generate art_only variant'
        });
      }
    }

    report.recommendations = recs.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  printSummary(report) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 AUDIT SUMMARY - SET 009');
    console.log('='.repeat(80));
    
    console.log(`\n📁 Expected Files: ${report.summary.totalExpectedFiles}`);
    console.log(`✅ Existing Files: ${report.summary.totalExistingFiles}`);
    console.log(`❌ Missing Files: ${report.summary.totalMissingFiles}`);
    console.log(`📈 Completion: ${((report.summary.totalExistingFiles / report.summary.totalExpectedFiles) * 100).toFixed(2)}%`);

    console.log('\n' + '-'.repeat(80));
    console.log('BY LANGUAGE');
    console.log('-'.repeat(80));

    for (const language of this.config.languages) {
      const langData = report.byLanguage[language];
      const totalMissing = langData.originalWebp.missing + langData.originalAvif.missing +
                          langData.artAndNameWebp.missing + langData.artAndNameAvif.missing;
      
      console.log(`\n${language}:`);
      console.log(`  Original WebP:     ${langData.originalWebp.existing} existing, ${langData.originalWebp.missing} missing`);
      console.log(`  Original AVIF:     ${langData.originalAvif.existing} existing, ${langData.originalAvif.missing} missing`);
      console.log(`  Art+Name WebP:     ${langData.artAndNameWebp.existing} existing, ${langData.artAndNameWebp.missing} missing`);
      console.log(`  Art+Name AVIF:     ${langData.artAndNameAvif.existing} existing, ${langData.artAndNameAvif.missing} missing`);
      console.log(`  Total Missing:     ${totalMissing}`);
    }

    console.log('\n' + '-'.repeat(80));
    console.log('SHARED FILES (art_only)');
    console.log('-'.repeat(80));
    const firstLang = this.config.languages[0];
    const artOnlyWebp = this.results.byLanguage[firstLang].artOnlyWebp;
    const artOnlyAvif = this.results.byLanguage[firstLang].artOnlyAvif;
    console.log(`  Art Only WebP:     ${artOnlyWebp.existing} existing, ${artOnlyWebp.missing.length} missing`);
    console.log(`  Art Only AVIF:     ${artOnlyAvif.existing} existing, ${artOnlyAvif.missing.length} missing`);

    if (report.criticalIssues.length > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('🚨 CRITICAL ISSUES');
      console.log('-'.repeat(80));
      
      report.criticalIssues.forEach((issue, idx) => {
        console.log(`\n${idx + 1}. [${issue.severity}] ${issue.language} - ${issue.type}`);
        console.log(`   Count: ${issue.count}`);
        console.log(`   Reason: ${issue.reason}`);
        if (issue.cards.length <= 10) {
          console.log(`   Cards: ${issue.cards.join(', ')}`);
        } else {
          console.log(`   Cards: ${issue.cards.slice(0, 10).join(', ')} ... and ${issue.cards.length - 10} more`);
        }
      });
    }

    if (report.recommendations.length > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('💡 RECOMMENDATIONS');
      console.log('-'.repeat(80));
      
      report.recommendations.forEach((rec, idx) => {
        console.log(`\n${idx + 1}. [${rec.priority}] ${rec.language} - ${rec.action}`);
        console.log(`   ${rec.description}`);
        console.log(`   Reason: ${rec.reason}`);
        if (rec.cards && rec.cards.length <= 10) {
          console.log(`   Affected cards: ${rec.cards.join(', ')}`);
        } else if (rec.cards) {
          console.log(`   Affected cards: ${rec.cards.slice(0, 10).join(', ')} ... and ${rec.cards.length - 10} more`);
        }
      });
    }

    console.log('\n' + '='.repeat(80));
  }

  saveReport(report) {
    const reportPath = `./audit-report-${this.config.edition}-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportPath}`);
    
    // Also save a simplified CSV for easy viewing
    this.saveCsvReport(report);
    
    return reportPath;
  }

  saveCsvReport(report) {
    const csvPath = `./audit-report-${this.config.edition}-${Date.now()}.csv`;
    const lines = ['Language,FileType,Existing,Missing,MissingCards'];

    for (const language of this.config.languages) {
      const langData = report.byLanguage[language];
      lines.push(`${language},original_webp,${langData.originalWebp.existing},${langData.originalWebp.missing},"${langData.originalWebp.missingCards.join(',')}"`);
      lines.push(`${language},original_avif,${langData.originalAvif.existing},${langData.originalAvif.missing},"${langData.originalAvif.missingCards.join(',')}"`);
      lines.push(`${language},art_and_name_webp,${langData.artAndNameWebp.existing},${langData.artAndNameWebp.missing},"${langData.artAndNameWebp.missingCards.join(',')}"`);
      lines.push(`${language},art_and_name_avif,${langData.artAndNameAvif.existing},${langData.artAndNameAvif.missing},"${langData.artAndNameAvif.missingCards.join(',')}"`);
    }

    // Add shared files
    const firstLang = this.config.languages[0];
    const artOnlyWebp = this.results.byLanguage[firstLang].artOnlyWebp;
    const artOnlyAvif = this.results.byLanguage[firstLang].artOnlyAvif;
    lines.push(`SHARED,art_only_webp,${artOnlyWebp.existing},${artOnlyWebp.missing.length},"${artOnlyWebp.missing.join(',')}"`);
    lines.push(`SHARED,art_only_avif,${artOnlyAvif.existing},${artOnlyAvif.missing.length},"${artOnlyAvif.missing.join(',')}"`);

    fs.writeFileSync(csvPath, lines.join('\n'));
    console.log(`💾 CSV report saved to: ${csvPath}`);
  }
}

// Main execution
async function main() {
  console.log('\n🔍 LORCANA SET 009 AUDIT');
  console.log('⚠️  This script will ONLY check for missing files - it will NOT create or modify any files\n');

  const auditor = new Set009Auditor(AUDIT_CONFIG);
  
  try {
    const report = await auditor.auditAllCards();
    auditor.printSummary(report);
    auditor.saveReport(report);
    
    console.log('\n✅ Audit completed successfully!');
    
    if (report.summary.totalMissingFiles === 0) {
      console.log('🎉 All files are present and accounted for!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  Found ${report.summary.totalMissingFiles} missing files across ${report.criticalIssues.length} issue categories`);
      console.log('📋 Check the recommendations above for suggested actions');
      console.log('⚠️  DO NOT automatically recreate files - review each case manually');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n💥 Error during audit:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the audit
main();

export { Set009Auditor, AUDIT_CONFIG };

