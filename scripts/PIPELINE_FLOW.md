# Image Pipeline Flow Diagram

## 🔄 Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPREHENSIVE IMAGE PIPELINE                     │
│                      (verify-and-fix.js)                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ CONFIGURATION                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ • edition: "009"                                                    │
│ • languages: ["EN", "DE", "FR"]                                     │
│ • cardRange: { start: 1, end: 251 }                                 │
│ • autoFix: true                                                     │
│ • skipVariants: false                                               │
│ • tolerancePx: 2 (±2px)                                             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 1: VALIDATION                                                 │
│ Check all cards across all configured languages                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │  FOR EACH LANGUAGE: EN, DE, FR          │
        └─────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │  FOR EACH CARD: 001 to 251              │
        └─────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 1: ORIGINAL FILES (per language)                                │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Check: /EN/009/001.webp                                        │  │
│  │ ├─ Exists? → No  → [DOWNLOAD]                                 │  │
│  │ └─ Exists? → Yes → Check dimensions                           │  │
│  │              ├─ 734x1024? → ✓                                 │  │
│  │              └─ Wrong? → [RESIZE_ORIGINAL]                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Check: /EN/009/001.avif                                        │  │
│  │ └─ Exists? → No → [CONVERT_ORIGINAL]                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 2: ART_ONLY FILES (shared, first language only)                 │
├──────────────────────────────────────────────────────────────────────┤
│  ⚠️  ONLY PROCESSED FOR FIRST LANGUAGE (EN)                          │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Check: /009/art_only/001.webp                                  │  │
│  │ ├─ Exists? → No  → [CROP_ART_ONLY]                            │  │
│  │ └─ Exists? → Yes → Check dimensions                           │  │
│  │              ├─ height === 1024? → [CROP_ART_ONLY] (uncropped)│  │
│  │              ├─ 734x603 (±2px)? → ✓                           │  │
│  │              └─ Other? → ⚠️ Investigate                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Check: /009/art_only/001.avif                                  │  │
│  │ └─ Exists? → No → [CONVERT_ART_ONLY]                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 3: ART_AND_NAME FILES (per language)                            │
├──────────────────────────────────────────────────────────────────────┤
│  ✅ PROCESSED FOR EACH LANGUAGE (EN, DE, FR)                         │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Check: /EN/009/art_and_name/001.webp                           │  │
│  │ ├─ Exists? → No  → [CROP_ART_AND_NAME]                        │  │
│  │ └─ Exists? → Yes → Check dimensions                           │  │
│  │              ├─ height === 1024? → [CROP_ART_AND_NAME] (unc.) │  │
│  │              ├─ 734x767 (±2px)? → ✓                           │  │
│  │              └─ Other? → ⚠️ Investigate                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Check: /EN/009/art_and_name/001.avif                           │  │
│  │ └─ Exists? → No → [CONVERT_ART_AND_NAME]                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2: FIXING (if autoFix enabled)                               │
│ Apply fixes in pipeline order                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │  FOR EACH CARD WITH ISSUES              │
        └─────────────────────────────────────────┘
                              ↓
    ┌────────────────────────────────────────────────┐
    │ Sort issues by pipeline order:                 │
    │ 1. DOWNLOAD                                    │
    │ 2. RESIZE_ORIGINAL                             │
    │ 3. CONVERT_ORIGINAL                            │
    │ 4. CROP_ART_ONLY                               │
    │ 5. CONVERT_ART_ONLY                            │
    │ 6. CROP_ART_AND_NAME                           │
    │ 7. CONVERT_ART_AND_NAME                        │
    └────────────────────────────────────────────────┘
                              ↓
    ┌────────────────────────────────────────────────┐
    │ Apply fixes in order                           │
    │ ├─ Download from CDN                           │
    │ ├─ Resize (originals only)                     │
    │ ├─ Crop (variants from originals)              │
    │ └─ Convert (WebP → AVIF)                       │
    └────────────────────────────────────────────────┘
                              ↓
    ┌────────────────────────────────────────────────┐
    │ Re-validate after fixes                        │
    │ └─ All issues resolved? → ✅                   │
    └────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 3: REPORTING                                                  │
├─────────────────────────────────────────────────────────────────────┤
│ • Console output with statistics                                   │
│ • JSON report saved to file                                        │
│ • Summary by language                                              │
│ • List of errors, warnings, fixes                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 📊 Expected Dimensions

```
┌────────────────────┬────────────┬─────────────┬──────────────┐
│ Variant            │ Width      │ Height      │ Location     │
├────────────────────┼────────────┼─────────────┼──────────────┤
│ original           │ 734px      │ 1024px      │ /{lang}/{ed} │
│ art_only           │ 734px      │  603px      │ /{ed}/art... │
│ art_and_name       │ 734px      │  767px      │ /{lang}/{ed} │
└────────────────────┴────────────┴─────────────┴──────────────┘
```

## 🎯 Key Decision Points

### 1. Cropping Detection
```
if (height === 1024) {
  → File is uncropped (full card)
  → Action: CROP (not RESIZE!)
}
else if (|height - expected| ≤ 2px) {
  → File is within tolerance
  → Action: ACCEPT ✓
}
else {
  → File has unexpected dimensions
  → Action: WARN (investigate manually)
}
```

### 2. Art_only Processing
```
if (isFirstLanguage) {
  → Process art_only files
}
else {
  → Skip (already done by first language)
}
```

### 3. Fix Order
```
1. Ensure original exists (DOWNLOAD)
2. Ensure original is correct (RESIZE_ORIGINAL)
3. Ensure original AVIF exists (CONVERT_ORIGINAL)
4. NOW safe to crop variants ↓
5. Crop art_only from original (CROP_ART_ONLY)
6. Convert art_only to AVIF (CONVERT_ART_ONLY)
7. Crop art_and_name from original (CROP_ART_AND_NAME)
8. Convert art_and_name to AVIF (CONVERT_ART_AND_NAME)
```

## 🔀 Multi-Language Flow

```
Config: languages: ["EN", "DE", "FR"]

Card 001:
  ┌─────────┐
  │   EN    │ (First language)
  ├─────────┤
  │ ✅ Original files
  │ ✅ art_only files    ← CREATED ONCE
  │ ✅ art_and_name files
  └─────────┘
  
  ┌─────────┐
  │   DE    │ (Second language)
  ├─────────┤
  │ ✅ Original files
  │ ⏭️  art_only files    ← SKIPPED (shared)
  │ ✅ art_and_name files
  └─────────┘
  
  ┌─────────┐
  │   FR    │ (Third language)
  ├─────────┤
  │ ✅ Original files
  │ ⏭️  art_only files    ← SKIPPED (shared)
  │ ✅ art_and_name files
  └─────────┘

Result:
  /009/art_only/001.webp (created once from EN)
  /009/art_only/001.avif
  /EN/009/001.webp
  /EN/009/001.avif
  /EN/009/art_and_name/001.webp
  /EN/009/art_and_name/001.avif
  /DE/009/001.webp
  /DE/009/001.avif
  /DE/009/art_and_name/001.webp
  /DE/009/art_and_name/001.avif
  /FR/009/001.webp
  /FR/009/001.avif
  /FR/009/art_and_name/001.webp
  /FR/009/art_and_name/001.avif
```

## 🎨 Crop vs Resize Visualization

```
ORIGINAL (734x1024)
┌──────────────────┐
│  ╔════════════╗  │  ← Top border (removed)
│  ║            ║  │
│  ║            ║  │
│  ║  ART ONLY  ║  │  ← This portion kept (603px)
│  ║            ║  │
│  ║            ║  │
│  ╚════════════╝  │
│  Card Name       │  ← Name kept for art_and_name (767px total)
│  [Text box]      │  ← Text box (removed)
│  Stats           │
└──────────────────┘

CROP → ART_ONLY (734x603)
┌──────────────────┐
│  ╔════════════╗  │
│  ║            ║  │
│  ║  ART ONLY  ║  │
│  ║            ║  │
│  ║            ║  │
│  ╚════════════╝  │
└──────────────────┘

CROP → ART_AND_NAME (734x767)
┌──────────────────┐
│  ╔════════════╗  │
│  ║            ║  │
│  ║  ART ONLY  ║  │
│  ║            ║  │
│  ║            ║  │
│  ╚════════════╝  │
│  Card Name       │
└──────────────────┘

❌ WRONG: RESIZE → Distorts aspect ratio
❌ RIGHT: CROP → Maintains aspect ratio
```

## 📚 Related Documentation

- **Full Documentation**: `scripts/VERIFY_AND_FIX_README.md`
- **Quick Reference**: `scripts/QUICK_REFERENCE.md`
- **Summary**: `UNIFIED_SCRIPT_SUMMARY.md`

---

**Last Updated**: October 16, 2025  
**Pipeline Version**: Unified (Comprehensive)

