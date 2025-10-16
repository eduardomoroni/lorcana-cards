# Comprehensive Image Pipeline Validator & Fixer

A unified script to validate and fix all image pipeline steps for Lorcana card sets.

## Features

✅ **Multi-language support** - Process EN, IT, DE, FR, etc.  
✅ **All pipeline steps** - Download, resize, convert, and crop  
✅ **Smart variant handling** - art_only (shared), art_and_name (per language)  
✅ **Dimension tolerance** - ±2px tolerance to avoid unnecessary fixes  
✅ **Dry-run mode** - Validate without making changes  
✅ **Comprehensive reporting** - JSON reports with detailed statistics  
✅ **Auto-fix capability** - Automatically resolve issues  

## Usage

### Basic Usage

```bash
# Validate and fix (default behavior)
node scripts/verify-and-fix.js

# Dry-run (report only, no fixes)
node scripts/verify-and-fix.js --dry-run

# Verbose output
node scripts/verify-and-fix.js --verbose

# Combine flags
node scripts/verify-and-fix.js --dry-run --verbose
```

### Configuration

Edit the `CONFIG` object at the top of the script:

```javascript
const CONFIG = {
  edition: "009",                   // Set number
  languages: ["EN", "DE", "FR"],    // Languages to process
  cardRange: { start: 1, end: 251 }, // Card range
  autoFix: true,                    // Enable auto-fix (or use --dry-run flag)
  skipVariants: false,              // Skip art_only/art_and_name variants
  downloadSource: "dreamborn",      // CDN source
  verbose: false,                   // Detailed logging (or use --verbose flag)
  tolerancePx: 2                    // Dimension tolerance (±2px)
};
```

## Pipeline Steps

The script validates and fixes in this order:

1. **DOWNLOAD** - Download original WebP from CDN
2. **RESIZE_ORIGINAL** - Correct original dimensions (734x1024)
3. **CONVERT_ORIGINAL** - Create original AVIF
4. **CROP_ART_ONLY** - Crop art_only variant (734x603) - **from first language only**
5. **CONVERT_ART_ONLY** - Create art_only AVIF
6. **CROP_ART_AND_NAME** - Crop art_and_name variant (734x767) - **per language**
7. **CONVERT_ART_AND_NAME** - Create art_and_name AVIF

## Key Design Decisions

### Art_only Files (Shared)
- Art_only files are shared across languages (no text)
- Located in: `/009/art_only/`
- Created from **first language** in the config (e.g., EN)
- Only processed once, not per language

### Art_and_name Files (Per Language)
- Art_and_name files are language-specific (contain card name)
- Located in: `/EN/009/art_and_name/`, `/FR/009/art_and_name/`, etc.
- Created from corresponding language's original file

### Cropping vs. Resizing

**CRITICAL**: The script correctly differentiates between:

- **Cropping** (for variants): Removes portions of the card (borders, text box) while maintaining aspect ratio
  - Used for: `art_only` and `art_and_name` variants
  - Detects: `height === 1024` (uncropped full card)
  
- **Resizing** (for originals): Changes dimensions of the full image
  - Used for: `original` files only
  - Only applied if source dimensions are incorrect

### Dimension Tolerance

- The script uses **±2px tolerance** for dimension checks
- This prevents false positives from rounding differences
- Files within tolerance are not flagged for fixing

## Examples

### Validate Set 009 (all languages)

```javascript
const CONFIG = {
  edition: "009",
  languages: ["EN", "DE", "FR", "IT"],
  cardRange: { start: 1, end: 251 },
  autoFix: true,
};
```

### Validate Set 010 (EN only, dry-run)

```javascript
const CONFIG = {
  edition: "010",
  languages: ["EN"],
  cardRange: { start: 1, end: 50 },
  autoFix: false, // Or use --dry-run flag
};
```

### Validate Set 001 (no variants)

```javascript
const CONFIG = {
  edition: "001",
  languages: ["EN"],
  cardRange: { start: 1, end: 204 },
  skipVariants: true, // Only validate original files
};
```

## Output

### Console Output

```
================================================================================
🔍 COMPREHENSIVE IMAGE PIPELINE VALIDATOR - SET 009
================================================================================

Languages: EN, DE, FR
Card range: 1 to 251
Auto-fix: ENABLED
Skip variants: false
Tolerance: ±2px

📋 PHASE 1: VALIDATING ALL CARDS
================================================================================

Validating EN...
  Progress: 50/251 cards
  Progress: 100/251 cards
  ...

📊 Found 15 cards with issues

🔧 PHASE 2: FIXING ISSUES
================================================================================

Fixing card 001 (EN)...
  ✅ Card 001 (EN) is now complete!
  ...

================================================================================
📊 FINAL REPORT - SET 009
================================================================================
Total Cards per Language: 251
Languages: EN, DE, FR
Total Checked: 753
Cards with Issues: 15
Recovered: 15
Failed: 0
Skipped: 0

📈 By Language:
  EN: checked=251, issues=5, recovered=5, failed=0
  DE: checked=251, issues=5, recovered=5, failed=0
  FR: checked=251, issues=5, recovered=5, failed=0

📋 Details:
  Errors: 0
  Warnings: 45
  Fixes Applied: 30

💾 Report saved to: ./validation-report-009-ALL-1760650000000.json
================================================================================

🎉 Validation and fix process completed!
✅ All issues have been resolved!
```

### JSON Report

The script generates a detailed JSON report:

```json
{
  "timestamp": "2025-10-16T12:00:00.000Z",
  "config": { ... },
  "stats": {
    "checked": 753,
    "missing": 15,
    "recovered": 15,
    "failed": 0,
    "skipped": 0,
    "byLanguage": {
      "EN": { "checked": 251, "missing": 5, "recovered": 5, "failed": 0 },
      "DE": { "checked": 251, "missing": 5, "recovered": 5, "failed": 0 },
      "FR": { "checked": 251, "missing": 5, "recovered": 5, "failed": 0 }
    }
  },
  "summary": { ... },
  "errors": [],
  "warnings": [...],
  "fixes": [...]
}
```

## Troubleshooting

### Issue: "Source has unexpected dimensions"
- **Cause**: Original file is not 734x1024
- **Fix**: Script will automatically resize original (RESIZE_ORIGINAL step)

### Issue: "art_only is uncropped"
- **Cause**: art_only file is actually a full card (1024px height)
- **Fix**: Script will re-crop from original (CROP_ART_ONLY step)

### Issue: "Download failed - Status: 404"
- **Cause**: Card doesn't exist on CDN
- **Fix**: Card may not be released yet or doesn't exist

### Issue: "Cropped result has wrong dimensions"
- **Cause**: Cropping logic error or corrupted source
- **Fix**: Check source file integrity, may need manual intervention

## Migration from Old Scripts

### Old: `audit-set-009.js` + `properly-crop-set-009.js`
**New**: Single `verify-and-fix.js` script handles both

### Old: Set-specific scripts
**New**: General-purpose CONFIG-driven script

### Old: Separate validation and fixing
**New**: Integrated with `--dry-run` flag

## Advanced Usage

### Process Only Specific Cards

```javascript
cardRange: { start: 243, end: 245 }
```

### Process Only One Language

```javascript
languages: ["EN"]
```

### Skip All Variants (Original Only)

```javascript
skipVariants: true
```

### Verbose Logging

```bash
node scripts/verify-and-fix.js --verbose
```

## Exit Codes

- `0` - Success (all issues resolved or dry-run completed)
- `1` - Failure (some issues could not be fixed)

## Notes

- Always verify results with `--dry-run` first for new sets
- The script is safe to run multiple times (idempotent)
- Maintains ±2px tolerance to avoid unnecessary fixes
- Works from original files to ensure quality
- Creates backup during operations (_temp files)

