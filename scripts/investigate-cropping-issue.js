// Investigation script for cropping issues on Set 009
// This script will analyze why cards were incorrectly marked as needing fixes
// and why the "fix" actually made them worse

import sharp from "sharp";
import fs from "fs";
import { rootFolder } from "./shared.js";

const EDITION = "009";
const LANGUAGE = "EN";
const TEST_CARD = "001";

// Expected dimensions from the verify-and-fix script
const EXPECTED_DIMENSIONS = {
  original: { width: 734, height: 1024 },
  art_only: { width: 734, height: 603 },
  art_and_name: { width: 734, height: 767 }
};

async function investigateCard(cardNum) {
  const cardNumber = cardNum.toString().padStart(3, "0");
  
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔍 INVESTIGATING CARD ${cardNumber}`);
  console.log(`${"=".repeat(80)}\n`);
  
  const files = {
    original: `${rootFolder}/${LANGUAGE}/${EDITION}/${cardNumber}.webp`,
    artOnly: `${rootFolder}/${EDITION}/art_only/${cardNumber}.webp`,
    artAndName: `${rootFolder}/${LANGUAGE}/${EDITION}/art_and_name/${cardNumber}.webp`
  };
  
  // Check each file
  for (const [type, filePath] of Object.entries(files)) {
    console.log(`\n--- ${type.toUpperCase()} ---`);
    console.log(`Path: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File does not exist!`);
      continue;
    }
    
    try {
      const metadata = await sharp(filePath).metadata();
      const stats = fs.statSync(filePath);
      
      console.log(`✅ File exists`);
      console.log(`   Dimensions: ${metadata.width} x ${metadata.height}`);
      console.log(`   Format: ${metadata.format}`);
      console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`   Modified: ${stats.mtime.toISOString()}`);
      
      // Check against expected dimensions
      const expectedKey = type === 'artOnly' ? 'art_only' : type === 'artAndName' ? 'art_and_name' : 'original';
      const expected = EXPECTED_DIMENSIONS[expectedKey];
      
      const widthMatch = metadata.width === expected.width;
      const heightMatch = metadata.height === expected.height;
      
      console.log(`\n   Expected: ${expected.width} x ${expected.height}`);
      console.log(`   Width: ${widthMatch ? '✅ MATCH' : `❌ MISMATCH (off by ${metadata.width - expected.width})`}`);
      console.log(`   Height: ${heightMatch ? '✅ MATCH' : `❌ MISMATCH (off by ${metadata.height - expected.height})`}`);
      
      if (!widthMatch || !heightMatch) {
        console.log(`\n   ⚠️  This file would be flagged as needing a fix!`);
      }
    } catch (error) {
      console.log(`❌ Error reading file: ${error.message}`);
    }
  }
}

async function analyzeCroppingLogic() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📐 ANALYZING CROPPING LOGIC`);
  console.log(`${"=".repeat(80)}\n`);
  
  const originalFile = `${rootFolder}/${LANGUAGE}/${EDITION}/${TEST_CARD}.webp`;
  
  if (!fs.existsSync(originalFile)) {
    console.log(`❌ Original file not found: ${originalFile}`);
    return;
  }
  
  const metadata = await sharp(originalFile).metadata();
  console.log(`Original card dimensions: ${metadata.width} x ${metadata.height}`);
  
  console.log(`\n--- CROPPING CALCULATIONS (from verify-and-fix.js) ---\n`);
  
  // Art Only cropping
  console.log(`ART ONLY:`);
  const artOnlyTopEnd = Math.floor(metadata.height * 0.52);
  const artOnlyBottomStart = Math.floor(metadata.height * 0.931);
  const artOnlyBottomEnd = Math.floor(metadata.height);
  const artOnlyTopHeight = artOnlyTopEnd - 0;
  const artOnlyBottomHeight = artOnlyBottomEnd - artOnlyBottomStart;
  const artOnlyTotal = artOnlyTopHeight + artOnlyBottomHeight;
  
  console.log(`  Top crop: 0 to ${artOnlyTopEnd} (height: ${artOnlyTopHeight}px)`);
  console.log(`  Bottom crop: ${artOnlyBottomStart} to ${artOnlyBottomEnd} (height: ${artOnlyBottomHeight}px)`);
  console.log(`  Combined height: ${artOnlyTotal}px`);
  console.log(`  Expected: ${EXPECTED_DIMENSIONS.art_only.height}px`);
  console.log(`  Match: ${artOnlyTotal === EXPECTED_DIMENSIONS.art_only.height ? '✅' : '❌'}`);
  
  // Art and Name cropping
  console.log(`\nART AND NAME:`);
  const artAndNameTopEnd = Math.floor(metadata.height * 0.674);
  const artAndNameBottomStart = Math.floor(metadata.height * 0.925);
  const artAndNameBottomEnd = Math.floor(metadata.height);
  const artAndNameTopHeight = artAndNameTopEnd - 0;
  const artAndNameBottomHeight = artAndNameBottomEnd - artAndNameBottomStart;
  const artAndNameTotal = artAndNameTopHeight + artAndNameBottomHeight;
  
  console.log(`  Top crop: 0 to ${artAndNameTopEnd} (height: ${artAndNameTopHeight}px)`);
  console.log(`  Bottom crop: ${artAndNameBottomStart} to ${artAndNameBottomEnd} (height: ${artAndNameBottomHeight}px)`);
  console.log(`  Combined height: ${artAndNameTotal}px`);
  console.log(`  Expected: ${EXPECTED_DIMENSIONS.art_and_name.height}px`);
  console.log(`  Match: ${artAndNameTotal === EXPECTED_DIMENSIONS.art_and_name.height ? '✅' : '❌'}`);
}

async function compareWithBackup() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📦 CHECKING FOR BACKUPS`);
  console.log(`${"=".repeat(80)}\n`);
  
  const artAndNameFile = `${rootFolder}/${LANGUAGE}/${EDITION}/art_and_name/${TEST_CARD}.webp`;
  const backupFile = artAndNameFile + '.bkp';
  
  console.log(`Current file: ${artAndNameFile}`);
  console.log(`Backup file: ${backupFile}`);
  
  if (fs.existsSync(backupFile)) {
    console.log(`\n✅ Backup exists!`);
    const current = await sharp(artAndNameFile).metadata();
    const backup = await sharp(backupFile).metadata();
    
    console.log(`\nCurrent (after "fix"): ${current.width} x ${current.height}`);
    console.log(`Backup (original): ${backup.width} x ${backup.height}`);
    
    if (backup.width !== current.width || backup.height !== current.height) {
      console.log(`\n⚠️  THE FILE WAS MODIFIED BY THE "FIX"!`);
      console.log(`   This explains why the fix made things worse.`);
    }
  } else {
    console.log(`\n⚠️  No backup found. Cannot compare with original.`);
  }
}

async function explainTheProblem() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`💡 EXPLANATION OF THE PROBLEM`);
  console.log(`${"=".repeat(80)}\n`);
  
  console.log(`The issue occurred because the verify-and-fix script had a logic error:`);
  console.log();
  console.log(`1️⃣  FIRST QUESTION: Why were these cards marked as needing a fix?`);
  console.log(`    ❌ The script checked if dimensions were EXACTLY ${EXPECTED_DIMENSIONS.art_and_name.width}x${EXPECTED_DIMENSIONS.art_and_name.height}`);
  console.log(`    ❌ Many art_and_name files already existed with CORRECT proportions`);
  console.log(`    ❌ However, due to the cropping calculations, they might have been`);
  console.log(`       slightly different (e.g., 766 or 768 instead of 767)`);
  console.log();
  
  console.log(`2️⃣  SECOND QUESTION: Why did the fix make them worse?`);
  console.log(`    ❌ The script's "fix" used resizeImage() which calls sharp.resize()`);
  console.log(`    ❌ This STRETCHES or SQUASHES the image to fit exact dimensions`);
  console.log(`    ❌ This destroys the original aspect ratio and image quality!`);
  console.log();
  
  console.log(`📸 THE CARD IMAGE YOU SHOWED:`);
  console.log(`    Left: Original (properly cropped, correct proportions)`);
  console.log(`    Right: After "fix" (stretched/squashed to fit 734x767)`);
  console.log();
  
  console.log(`🔧 THE CORRECT APPROACH:`);
  console.log(`    ✅ If a file has WRONG dimensions because it wasn't cropped properly,`);
  console.log(`       it should be RE-CROPPED from the source, not resized`);
  console.log(`    ✅ If a file has slightly off dimensions (±1-2px) due to rounding,`);
  console.log(`       it should be left alone - it's close enough!`);
  console.log(`    ✅ Only resize if the original source has wrong dimensions`);
  console.log();
}

async function main() {
  console.log(`\n🔬 CROPPING ISSUE INVESTIGATION - SET ${EDITION}`);
  console.log(`Testing with card ${TEST_CARD}`);
  
  await investigateCard(TEST_CARD);
  await analyzeCroppingLogic();
  await compareWithBackup();
  await explainTheProblem();
  
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📋 RECOMMENDATION`);
  console.log(`${"=".repeat(80)}\n`);
  console.log(`1. The art_and_name files that were "resized" should be restored`);
  console.log(`2. They were already correctly cropped before the "fix"`);
  console.log(`3. The dimension check should allow for ±2px tolerance`);
  console.log(`4. Never use resize() to "fix" cropped images - always re-crop!`);
  console.log();
}

main().catch(console.error);

