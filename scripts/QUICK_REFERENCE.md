# verify-and-fix.js - Quick Reference Card

## 🚀 Quick Start

```bash
# Validate Set 009 (all languages configured in CONFIG)
node scripts/verify-and-fix.js

# Dry-run (report only, no changes)
node scripts/verify-and-fix.js --dry-run

# Verbose output
node scripts/verify-and-fix.js --verbose
```

## ⚙️ Configuration (Edit in script)

```javascript
const CONFIG = {
  edition: "009",                   // Set number
  languages: ["EN", "DE", "FR"],    // Languages to process
  cardRange: { start: 1, end: 251 }, // Card range
  autoFix: true,                    // Enable auto-fix
  skipVariants: false,              // Skip art_only/art_and_name
  downloadSource: "dreamborn",      // CDN source
  verbose: false,                   // Detailed logging
  tolerancePx: 2                    // ±2px tolerance
};
```

## 📋 What It Checks & Fixes

| Step | File | Issue | Fix |
|------|------|-------|-----|
| 1 | `{num}.webp` | Missing | Download from CDN |
| 2 | `{num}.webp` | Wrong dimensions | Resize to 734x1024 |
| 3 | `{num}.avif` | Missing | Convert from WebP |
| 4 | `art_only/{num}.webp` | Missing/Uncropped | Crop to 734x603 (once) |
| 5 | `art_only/{num}.avif` | Missing | Convert from WebP |
| 6 | `art_and_name/{num}.webp` | Missing/Uncropped | Crop to 734x767 (per lang) |
| 7 | `art_and_name/{num}.avif` | Missing | Convert from WebP |

## 📁 File Locations

```
public/assets/images/cards/
├── 009/
│   └── art_only/          # Shared across languages
│       ├── 001.webp       (734x603)
│       └── 001.avif
├── EN/009/
│   ├── 001.webp           (734x1024)
│   ├── 001.avif
│   └── art_and_name/
│       ├── 001.webp       (734x767)
│       └── 001.avif
├── DE/009/
│   ├── 001.webp
│   ├── 001.avif
│   └── art_and_name/
│       ├── 001.webp
│       └── 001.avif
└── FR/009/
    └── ...
```

## 🎯 Common Use Cases

### Validate New Set
```javascript
// 1. Edit CONFIG in script
const CONFIG = {
  edition: "010",
  languages: ["EN"],
  cardRange: { start: 1, end: 50 },
};

// 2. Run dry-run first
node scripts/verify-and-fix.js --dry-run

// 3. Apply fixes
node scripts/verify-and-fix.js
```

### Check Specific Cards
```javascript
const CONFIG = {
  edition: "009",
  languages: ["EN"],
  cardRange: { start: 243, end: 245 }, // Only these cards
};
```

### Multiple Languages
```javascript
const CONFIG = {
  edition: "009",
  languages: ["EN", "DE", "FR", "IT"], // All languages
};
```

### Skip Variants (Original Only)
```javascript
const CONFIG = {
  edition: "001",
  skipVariants: true, // Only check original files
};
```

## 📊 Output

### Console
```
================================================================================
📊 FINAL REPORT - SET 009
================================================================================
Total Cards per Language: 251
Languages: EN
Total Checked: 251
Cards with Issues: 2
Recovered: 0
Failed: 0

📈 By Language:
  EN: checked=251, issues=2, recovered=0, failed=0
```

### JSON Report
```
validation-report-009-EN-1760648331065.json
```

## 🔍 Key Features

✅ **art_only** processed **once** from first language  
✅ **art_and_name** processed **per language**  
✅ **±2px tolerance** prevents false positives  
✅ **Crop** variants, **resize** originals only  
✅ **Dry-run** mode for safe validation  
✅ **Detailed reports** in JSON format  

## 🎓 Important Concepts

### Cropping vs. Resizing
- **Crop**: Remove borders/text from card (maintains aspect ratio)
  - Used for: `art_only`, `art_and_name`
  - Detection: `height === 1024` (uncropped)
  
- **Resize**: Change image dimensions (can distort)
  - Used for: `original` files **only**
  - Only when source has wrong dimensions

### Dimension Tolerance
- Script allows **±2px** difference
- Prevents fixing rounding errors
- Configurable via `CONFIG.tolerancePx`

### Language Processing
- **First language** (`languages[0]`): Creates shared `art_only` files
- **All languages**: Create their own `art_and_name` files

## 🆘 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Download failed - 404" | Card doesn't exist on CDN | Normal for unreleased cards |
| "Uncropped" warning | File is full card (1024px) | Script will crop it |
| "Unexpected dimensions" | File has wrong size | Check source file integrity |

## 📚 Full Documentation

See: **`scripts/VERIFY_AND_FIX_README.md`**

---

**Last Updated**: October 16, 2025  
**Script Version**: Unified (all-in-one)

