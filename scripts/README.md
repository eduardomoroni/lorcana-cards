# Lorcana Card Image Scripts

This directory contains scripts for managing Lorcana card images, including downloading, validating, transforming, and fixing card images across multiple languages and sets.

## Quick Start

The recommended way to work with card images is to use the unified pipeline script:

```bash
# Validate and auto-fix set 010 for English
bun run scripts/pipeline.ts --set 010 --language EN --auto-fix

# Validate only (dry run) for multiple languages
bun run scripts/pipeline.ts --set 010 --language EN,DE,FR --dry-run

# Validate with verbose output
bun run scripts/pipeline.ts --set 010 --language EN --verbose

# Specify expected card range
bun run scripts/pipeline.ts --set 010 --language EN --range 1-242
```

Or use npm scripts:

```bash
# Validate only
npm run pipeline:validate

# Run full pipeline (requires setting up the command)
npm run pipeline -- --set 010 --language EN --auto-fix
```

## Directory Structure

```
scripts/
├── pipeline.ts              # Main unified pipeline (START HERE)
├── shared.js                # Shared configuration
├── core/                    # Core pipeline modules
│   ├── download.ts          # Download logic (Ravensburg → Lorcast fallback)
│   ├── validate.ts          # Image validation
│   ├── transform.ts         # Image transformation (WebP/AVIF)
│   └── fix.ts               # Auto-fix functionality
├── data/                    # Data files
│   ├── ravensburg-mapping.json
│   └── catalogs/            # Card catalogs by language
│       ├── en.json
│       ├── de.json
│       ├── fr.json
│       └── it.json
├── sources/                 # Source-specific data
│   └── lorcast/
│       └── 010.json
├── utils/                   # Utility scripts
│   ├── delete-webp.cjs
│   ├── delete-avif.cjs
│   ├── check-convert-webp.cjs
│   ├── upload.js
│   ├── download.js
│   ├── convert.js
│   ├── crop.js
│   ├── change-resolution.js
│   ├── image-transformation-pipeline.js
│   ├── process-sleeve.js
│   ├── process-playmat.js
│   └── one-for-all.js
└── legacy/                  # Deprecated scripts (kept for reference)
    ├── download-from-ravensburg.ts
    ├── download-from-lorcast.ts
    ├── ravensburg-pipeline.ts
    ├── master-pipeline.ts
    ├── validate-images.ts
    ├── fix-dimensions.ts
    ├── cleanup-jpg.ts
    └── verify-and-fix.js
```

## Core Pipeline (`pipeline.ts`)

The unified pipeline script that handles everything you need:

**Features:**
- ✅ Validates existing images (dimensions, format, integrity)
- ✅ Identifies missing files
- ✅ Downloads from Ravensburger API with Lorcast fallback
- ✅ Transforms to WebP (734x1024) and AVIF (734x1024)
- ✅ Auto-fixes issues (missing files, wrong dimensions)
- ✅ Cleans up source JPG files
- ✅ Multi-language support (EN, DE, FR, IT, JA, ZH)
- ✅ Detailed reporting (JSON + console)

**Command Line Options:**

| Option | Description | Example |
|--------|-------------|---------|
| `--set <set>` | Set number | `--set 010` |
| `--language <langs>` | Comma-separated language codes | `--language EN,DE,FR` |
| `--range <start-end>` | Expected card range | `--range 1-242` |
| `--dry-run` | Validate only, don't fix | `--dry-run` |
| `--auto-fix` | Automatically fix issues | `--auto-fix` |
| `--verbose` | Show detailed progress | `--verbose` |
| `--help` | Show help message | `--help` |

**Workflow:**

1. **Validate**: Checks all card images for correct dimensions (734x1024), format (WebP + AVIF), and integrity
2. **Fix** (if `--auto-fix`): Downloads missing cards, transforms to correct format/dimensions
3. **Cleanup**: Removes source JPG files after successful transformation
4. **Report**: Generates JSON reports with detailed results

## Core Modules

### `core/download.ts`

Unified download module with source priority: Ravensburg API → Lorcast fallback.

**Key Functions:**
- `downloadCard(card, rootFolder, skipExisting)` - Download a single card
- `downloadCards(cards, rootFolder, skipExisting, onProgress)` - Batch download
- `cardExists(card, rootFolder)` - Check if card already exists

**Data Sources:**
1. **Ravensburg API** (Primary): Uses `data/ravensburg-mapping.json`
2. **Lorcast API** (Fallback): Uses `sources/lorcast/{set}.json`

### `core/validate.ts`

Image validation module that checks dimensions, format, and integrity.

**Key Functions:**
- `validateImage(filePath)` - Validate a single image file
- `validateCard(setDir, cardNumber)` - Validate both WebP and AVIF for a card
- `validateSet(rootFolder, set, language, expectedRange, onProgress)` - Validate entire set
- `saveReport(report, outputPath)` - Save validation report to JSON
- `printSummary(report)` - Print summary to console

**Target Dimensions:** 734x1024 (width x height)

### `core/transform.ts`

Image transformation module for converting to WebP and AVIF.

**Key Functions:**
- `transformImage(inputPath, outputDir, baseName, options)` - Transform to WebP + AVIF
- `transformCard(sourcePath, outputDir, cardNumber, options, skipExisting)` - Transform a card
- `cleanupJpgFiles(directory)` - Remove JPG files after transformation
- `getImageInfo(filePath)` - Get image metadata

**Default Settings:**
- WebP: Quality 80, Effort 6
- AVIF: Quality 75, Speed 5

### `core/fix.ts`

Auto-fix module that repairs issues found during validation.

**Key Functions:**
- `fixCard(card, options)` - Fix a single card
- `fixCards(report, options, onProgress)` - Fix all cards from validation report
- `saveFixReport(results, set, language, outputPath)` - Save fix report
- `printFixSummary(results)` - Print fix summary

**Fix Strategies:**
1. Both missing → Download + Transform
2. One format missing → Transform from existing
3. Invalid dimensions → Re-download + Transform

## Utility Scripts

Located in `utils/` - special-purpose tools for specific tasks.

### Image Management

- **`delete-webp.cjs`** - Delete all WebP files (use with caution)
- **`delete-avif.cjs`** - Delete all AVIF files (use with caution)
- **`check-convert-webp.cjs`** - Check WebP conversion status

### Legacy Utilities

- **`download.js`** - Simple download utility
- **`convert.js`** - Image format conversion
- **`crop.js`** - Image cropping
- **`change-resolution.js`** - Change image resolution
- **`image-transformation-pipeline.js`** - Image transformation pipeline

### Special Assets

- **`process-sleeve.js`** - Process card sleeve images
- **`process-playmat.js`** - Process playmat images
- **`one-for-all.js`** - Batch processing utility

### Deployment

- **`upload.js`** - Upload images to S3

## Legacy Scripts (Deprecated)

Located in `legacy/` - kept for reference but **should not be used** for new work. Use `pipeline.ts` instead.

### Download Scripts (DUPLICATES - Use `pipeline.ts` instead)

❌ **`download-from-ravensburg.ts`**
- Downloads from Ravensburg API only
- Hardcoded for set 010, EN only
- **Replaced by:** `core/download.ts` with `pipeline.ts`

❌ **`download-from-lorcast.ts`**
- Downloads from Lorcast API only
- Limited to available Lorcast data
- **Replaced by:** `core/download.ts` with `pipeline.ts`

### Pipeline Scripts (DUPLICATES - Use `pipeline.ts` instead)

❌ **`ravensburg-pipeline.ts`**
- Complete pipeline for Ravensburg downloads
- Set 010 only, EN only
- Includes validation and cleanup
- **Replaced by:** `pipeline.ts`

❌ **`master-pipeline.ts`**
- Orchestrates multiple scripts
- Complex, hard to maintain
- **Replaced by:** `pipeline.ts`

### Validation Scripts (DUPLICATES - Use `pipeline.ts` instead)

❌ **`validate-images.ts`**
- Validates image dimensions and format
- English only
- **Replaced by:** `core/validate.ts` with `pipeline.ts`

❌ **`verify-and-fix.js`**
- Large, complex validation and fix script
- Hardcoded for specific scenarios
- **Replaced by:** `core/validate.ts` + `core/fix.ts` with `pipeline.ts`

### Fix Scripts (DUPLICATES - Use `pipeline.ts` instead)

❌ **`fix-dimensions.ts`**
- Fixes invalid dimensions
- Requires manual validation report path
- **Replaced by:** `core/fix.ts` with `pipeline.ts --auto-fix`

❌ **`cleanup-jpg.ts`**
- Cleans up JPG files after conversion
- **Replaced by:** `core/transform.ts` (automatic cleanup in `pipeline.ts`)

## Data Files

### `data/ravensburg-mapping.json`

Mapping file generated from Ravensburg catalog. Contains:
- Card name, set, card number
- Variant information
- Download URLs
- Rarity

**Structure:**
```json
[
  {
    "name": "Card Name",
    "set": "010",
    "cardNumber": "001",
    "identifier": "1/242 EN 10",
    "variantId": "Regular",
    "url": "https://...",
    "rarity": "Common"
  }
]
```

### `data/catalogs/`

Card catalogs by language from Ravensburg API:
- `en.json` - English catalog
- `de.json` - German catalog
- `fr.json` - French catalog
- `it.json` - Italian catalog

### `sources/lorcast/`

Lorcast API data by set:
- `010.json` - Set 010 data

## Configuration

### `shared.js`

Shared configuration used across scripts:

```javascript
export const edition = "010";
export const languages = ["EN"];
export const rootFolder = `./public/assets/images/cards`;
```

**Note:** With the new pipeline, these are mostly superseded by command-line arguments.

## Common Tasks

### Task 1: Validate a Set

Check if all cards in a set are present and correctly formatted:

```bash
bun run scripts/pipeline.ts --set 010 --language EN --dry-run
```

### Task 2: Download Missing Cards

Download and fix missing/broken cards:

```bash
bun run scripts/pipeline.ts --set 010 --language EN --auto-fix
```

### Task 3: Process Multiple Languages

Validate and fix multiple languages at once:

```bash
bun run scripts/pipeline.ts --set 010 --language EN,DE,FR,IT --auto-fix
```

### Task 4: Specify Card Range

Useful when you know the expected card range:

```bash
bun run scripts/pipeline.ts --set 010 --language EN --range 1-242 --auto-fix
```

### Task 5: Verbose Output

See detailed progress for debugging:

```bash
bun run scripts/pipeline.ts --set 010 --language EN --verbose
```

## Troubleshooting

### Issue: "Card not found in Ravensburg or Lorcast sources"

**Solutions:**
1. Check if `data/ravensburg-mapping.json` exists and is up to date
2. Check if `sources/lorcast/{set}.json` exists for fallback
3. Verify the card number and set are correct

### Issue: "Invalid dimensions"

**Solutions:**
1. Run with `--auto-fix` to automatically re-download and transform
2. Check source image quality in Ravensburg/Lorcast

### Issue: "Missing WebP or AVIF"

**Solutions:**
1. Run with `--auto-fix` to generate missing format from existing file
2. If both are missing, it will download and transform

### Issue: "Permission denied" or "EACCES"

**Solutions:**
1. Check file permissions in `public/assets/images/cards/`
2. Ensure you have write access to the directory

## Development

### Adding a New Language

1. Ensure the language code is added to `VALID_LANGUAGES` in `pipeline.ts`
2. Add catalog data to `data/catalogs/{lang}.json` if available
3. Run pipeline with the new language code

### Adding a New Set

1. Update `sources/lorcast/` with new set data if available
2. Update `data/ravensburg-mapping.json` if needed
3. Run pipeline with new set number

### Testing

Test the pipeline on a small subset:

```bash
# Test with a small range first
bun run scripts/pipeline.ts --set 010 --language EN --range 1-10 --auto-fix --verbose
```

## Migration Guide

If you're coming from the old scripts:

| Old Command | New Command |
|------------|-------------|
| `bun scripts/validate-images.ts` | `bun scripts/pipeline.ts --set 010 --language EN --dry-run` |
| `bun scripts/ravensburg-pipeline.ts` | `bun scripts/pipeline.ts --set 010 --language EN --auto-fix` |
| `bun scripts/fix-dimensions.ts` | `bun scripts/pipeline.ts --set 010 --language EN --auto-fix` |
| `bun scripts/cleanup-jpg.ts` | Automatic in `pipeline.ts` |
| `bun scripts/master-pipeline.ts` | `bun scripts/pipeline.ts --set 010 --language EN --auto-fix` |

## Package Scripts

The following npm/bun scripts are available in `package.json`:

```bash
# Validate only (dry run)
npm run pipeline:validate

# Full pipeline (edit command in package.json for your needs)
npm run pipeline
```

## Contributing

When adding new functionality:

1. Add core logic to appropriate module in `core/`
2. Update `pipeline.ts` if user-facing changes needed
3. Update this README with new features
4. Test thoroughly with `--dry-run` first

## Support

For issues or questions:
1. Check this README first
2. Review validation/fix reports (JSON files generated by pipeline)
3. Run with `--verbose` for detailed debugging information

