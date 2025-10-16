# Lorcana Cards Image Pipeline

Complete automated pipeline for downloading, transforming, validating, and fixing Lorcana card images.

## Overview

This pipeline downloads card images from Ravensburger's API and transforms them into optimized WebP and AVIF formats at a standard resolution of 734x1024 pixels.

## Pipeline Components

### 1. Download from Ravensburger (`download-from-ravensburg.ts`)

Downloads card images from Ravensburger API based on a mapping file.

**Usage:**
```bash
# Create mapping file only
bun scripts/download-from-ravensburg.ts --map-only

# Download and transform images
bun scripts/download-from-ravensburg.ts
```

**Input:**
- `scripts/catalog/en.json` - Catalog data from Ravensburger
- `scripts/ravensburg-mapping.json` - Generated mapping file

**Output:**
- Card images in `public/assets/images/cards/EN/{SET}/{CARD_NUMBER}.{jpg|webp}`
- `ravensburg-mapping.json` - Mapping of cards to URLs
- `ravensburg-errors.log` - Download error log (if errors occur)

### 2. Ravensburger Pipeline (`ravensburg-pipeline.ts`)

Complete pipeline that downloads images from Ravensburger and immediately transforms them to WebP and AVIF.

**Usage:**
```bash
bun scripts/ravensburg-pipeline.ts
```

**Features:**
- Downloads images from mapping file
- Transforms to WebP (734x1024, quality 80)
- Transforms to AVIF (734x1024, quality 50)
- Validates output dimensions
- Skips already processed images
- Generates comprehensive report

**Output:**
- `public/assets/images/cards/EN/{SET}/{CARD_NUMBER}.webp`
- `public/assets/images/cards/EN/{SET}/{CARD_NUMBER}.avif`
- `pipeline-report-{timestamp}.json` - Processing report
- `ravensburg-pipeline-errors.log` - Error log (if errors occur)

### 3. Image Transformation Pipeline (`image-transformation-pipeline.js`)

Standalone utility for transforming images to WebP and AVIF formats.

**Usage:**
```bash
# Single file
node scripts/image-transformation-pipeline.js input.jpg [output-dir]

# Directory
node scripts/image-transformation-pipeline.js input-folder/ [output-dir]
```

**Features:**
- Converts any image to WebP and AVIF
- Resizes to 734x1024 resolution
- Configurable quality settings

### 4. Validate Images (`validate-images.ts`)

Validates all card images for correct dimensions and file integrity.

**Usage:**
```bash
bun scripts/validate-images.ts
```

**Checks:**
- File existence
- Correct dimensions (734x1024)
- File integrity
- Matching WebP/AVIF pairs

**Output:**
- `validation-report-{timestamp}.json` - Validation results
- Console summary of validation status

### 5. Fix Dimensions (`fix-dimensions.ts`)

Fixes images with incorrect dimensions by reprocessing them.

**Usage:**
```bash
bun scripts/fix-dimensions.ts
```

**Prerequisites:**
- Requires a validation report from `validate-images.ts`

**Process:**
- Reads validation report
- Identifies images with wrong dimensions
- Reprocesses images to correct size
- Replaces original files

### 6. Master Pipeline (`master-pipeline.ts`)

Orchestrates the entire pipeline from start to finish.

**Usage:**
```bash
bun scripts/master-pipeline.ts
```

**Steps:**
1. Download and transform images from Ravensburger
2. Validate all images
3. Fix any dimension issues (if needed)
4. Re-validate (if fixes were applied)

## File Structure

```
scripts/
├── README.md                          # This file
├── catalog/
│   └── en.json                       # Ravensburger catalog data
├── ravensburg-mapping.json           # Card to URL mapping
├── download.js                       # Legacy download script
├── download-from-ravensburg.ts       # Download from Ravensburger API
├── ravensburg-pipeline.ts            # Complete download + transform pipeline
├── image-transformation-pipeline.js  # Standalone image transformer
├── validate-images.ts                # Image validation
├── fix-dimensions.ts                 # Fix incorrect dimensions
├── master-pipeline.ts                # Complete orchestration
├── shared.js                         # Shared configuration
└── ... (other scripts)

public/assets/images/cards/
├── EN/
│   ├── 001/                         # Set 1
│   │   ├── 001.webp
│   │   ├── 001.avif
│   │   └── ...
│   ├── 002/                         # Set 2
│   ├── ...
│   ├── 010/                         # Set 10
│   ├── G01/                         # Gateway Set 1
│   └── Q02/                         # Quest Set 2
├── FR/                              # French cards
├── DE/                              # German cards
└── ...
```

## Image Specifications

- **Resolution:** 734x1024 pixels
- **WebP Quality:** 80
- **WebP Effort:** 6 (maximum compression)
- **AVIF Quality:** 50
- **AVIF Speed:** 1 (best compression)
- **Resize Method:** fill (scales to exact dimensions)

## Set Naming Convention

- **Regular Sets:** `001` to `009` (zero-padded 3 digits)
- **Promo Sets:** `P01`, `P02`, etc.
- **Gateway Sets:** `G01`, `G02`, etc.
- **Quest Sets:** `Q01`, `Q02`, etc.
- **Challenge Sets:** `C01`, `C02`, etc.

## Workflow Examples

### Initial Setup

```bash
# 1. Download catalog (manual - from Ravensburger)
# Place in scripts/catalog/en.json

# 2. Create mapping
bun scripts/download-from-ravensburg.ts --map-only

# 3. Run complete pipeline
bun scripts/ravensburg-pipeline.ts
```

### Validate and Fix Existing Images

```bash
# 1. Validate all images
bun scripts/validate-images.ts

# 2. Fix any issues
bun scripts/fix-dimensions.ts

# 3. Re-validate
bun scripts/validate-images.ts
```

### Run Complete Pipeline

```bash
# One command to do everything
bun scripts/master-pipeline.ts
```

### Process Single Image

```bash
# Transform a single image
node scripts/image-transformation-pipeline.js my-image.jpg output-folder/
```

## Reports and Logs

### Pipeline Report
```json
{
  "totalCards": 2088,
  "successful": 2050,
  "failed": 38,
  "skipped": 1845,
  "errors": [...],
  "startTime": "2025-10-16T...",
  "endTime": "2025-10-16T...",
  "duration": 1234.56
}
```

### Validation Report
```json
{
  "totalFiles": 4229,
  "validFiles": 4228,
  "invalidFiles": 1,
  "missingPairs": 0,
  "invalidDimensions": 1,
  "corruptedFiles": 0,
  "results": [...],
  "timestamp": "2025-10-16T..."
}
```

## Troubleshooting

### Issue: Download fails with 404
**Solution:** Check that the mapping file is up to date with the latest catalog.

### Issue: Images have wrong dimensions
**Solution:** Run `bun scripts/fix-dimensions.ts` to reprocess them.

### Issue: Missing WebP or AVIF
**Solution:** Re-run the pipeline for that specific set.

### Issue: Out of memory
**Solution:** Process images in batches or increase Node.js memory limit:
```bash
NODE_OPTIONS="--max-old-space-size=4096" bun scripts/ravensburg-pipeline.ts
```

## Performance

- **Download + Transform:** ~2-3 seconds per card
- **Validation:** ~2-3 seconds per 1000 cards
- **Fix Dimensions:** ~1 second per card

## Dependencies

- `bun` - JavaScript runtime
- `sharp` - Image processing library
- `typescript` - TypeScript support

## Configuration

Edit `scripts/shared.js` to change:
- `edition` - Current set being processed
- `languages` - Languages to download
- `rootFolder` - Output directory for card images

## Notes

- The pipeline automatically skips images that already exist
- Images are downloaded to a temporary directory and cleaned up after processing
- All scripts include comprehensive error handling and logging
- The pipeline validates output to ensure image quality

## Future Improvements

- [ ] Parallel processing for faster downloads
- [ ] Support for other languages
- [ ] Art-only card processing
- [ ] Automatic catalog updates
- [ ] Progress bar for long operations
- [ ] Retry logic for failed downloads
- [ ] Incremental updates (only new cards)

