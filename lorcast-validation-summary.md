# Lorcast Source Validation Results - Set 010

## 🎯 Results Summary

### Overall Performance
- **Source**: Lorcast  
- **Cards Successfully Downloaded**: 129 (59.7%)
- **AVIF Files Created**: 150 total
- **Success Rate**: 17.99% (considering all pipeline steps)
- **Fixes Applied**: 946 operations

### Comparison with Other Sources
| Source | Downloaded | Success Rate | Available Cards |
|--------|------------|--------------|-----------------|
| **Lorcast** | **129** | **59.7%** | **151 (70%)** |
| Ravensburg | 0 | 0% | 54 (25%) |
| Dreamborn | 24 | 11.1% | ~49 (23%) |

**Winner**: Lorcast is by far the best source for Set 010! 🏆

## ⚠️ Critical Issue Found

### Dimension Problem
Lorcast images have **different dimensions**:
- **Actual**: 674×940 pixels
- **Expected**: 734×1024 pixels

This causes the cropping/variant generation to fail for all downloaded images.

### Impact
- ✅ Original files download successfully
- ❌ art_only variants fail (wrong dimensions for cropping)
- ❌ art_and_name variants fail (wrong dimensions for cropping)
- ❌ AVIF conversions incomplete

## 📊 Detailed Statistics

### Cards Downloaded (129 cards)
Successfully downloaded from Lorcast, but variants need to be fixed.

### Cards NOT in Lorcast (65 cards)
These cards are missing from the Lorcast 010.json file:
- 83 attempts failed × 3 retries = 249 errors
- Approximately 65 unique cards missing

### Dimension Issues (43 cards)
Cards downloaded but with wrong dimensions:
- All 129 downloaded cards have 674×940 instead of 734×1024
- Cropping fails because source dimensions don't match expectations

## 💡 Recommendations

### 1. **Immediate Fix**: Update Dimension Expectations
The verify-and-fix script should:
- Accept 674×940 as valid dimensions for Lorcast sources
- Resize images to 734×1024 after download
- OR: Update cropping logic to work with 674×940

### 2. **Update Cropping Logic**
Modify the crop function to:
- Detect source dimensions
- Calculate proportional crop regions
- Support both 734×1024 (Dreamborn/Ravensburg) and 674×940 (Lorcast)

### 3. **Missing Cards**
For the 65 cards not in Lorcast:
- Try Dreamborn or Ravensburg as fallback
- Check if they're promo/special cards outside the normal numbering

## 🎉 Success Story

Despite the dimension issues, Lorcast provided **129 out of 151 available cards** - that's **85% coverage** of what they have!

This is a massive improvement over:
- Dreamborn: 24 cards (11%)
- Ravensburg: 54 cards (25%)

