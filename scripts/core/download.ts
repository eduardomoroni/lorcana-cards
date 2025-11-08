// Unified download module
// Downloads card images from Ravensburger API with Lorcast fallback

import fs from "fs";
import https from "https";
import path from "path";

export interface CardInfo {
  set: string;
  cardNumber: string;
  language: string;
  name?: string;
  identifier?: string;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  source?: "ravensburg" | "lorcast";
  error?: string;
  skipped?: boolean;
}

interface RavensburgMappingEntry {
  name: string;
  set: string;
  cardNumber: string;
  identifier: string;
  variantId: string;
  url: string;
  rarity: string;
}

interface LorcastCard {
  id: string;
  name: string;
  version?: string;
  collector_number: string;
  lang: string;
  image_uris: {
    digital: {
      small: string;
      normal: string;
      large: string;
    };
  };
  set: {
    id: string;
    code: string;
    name: string;
  };
}

/**
 * Download a file from a URL
 */
function downloadFile(url: string, filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(filepath);
        res
          .pipe(fileStream)
          .on("error", reject)
          .once("close", () => resolve(filepath));
      } else {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
    });
  });
}

interface CatalogCard {
  name: string;
  card_sets: string[];
  card_identifier: string;
  variants: Array<{
    variant_id: string;
    detail_image_url: string;
  }>;
  rarity: string;
}

interface Catalog {
  cards: {
    characters?: CatalogCard[];
    actions?: CatalogCard[];
    items?: CatalogCard[];
    locations?: CatalogCard[];
  };
}

/**
 * Extract set number from card_sets array
 */
function extractSetNumber(cardSets: string[]): string | null {
  if (!cardSets || cardSets.length === 0) return null;
  
  const cardSet = cardSets[0];
  
  if (cardSet.startsWith("set")) {
    const setNum = cardSet.replace("set", "");
    return setNum.padStart(3, "0");
  }
  
  return null;
}

/**
 * Extract card number from card_identifier
 */
function extractCardNumber(cardIdentifier: string): string | null {
  if (!cardIdentifier) return null;
  const match = cardIdentifier.match(/^(\d+)\//);
  return match ? match[1].padStart(3, "0") : null;
}

/**
 * Load Ravensburger catalog and generate mapping for specific language
 */
function loadRavensburgMapping(language: string): RavensburgMappingEntry[] | null {
  const catalogPath = path.join(
    process.cwd(),
    "scripts",
    "data",
    "catalogs",
    `${language.toLowerCase()}.json`
  );

  if (!fs.existsSync(catalogPath)) {
    console.warn(`Catalog not found for language ${language}: ${catalogPath}`);
    return null;
  }

  try {
    const catalog: Catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    const mapping: RavensburgMappingEntry[] = [];

    if (!catalog.cards) {
      return null;
    }

    // Combine all card types
    const allCards: CatalogCard[] = [
      ...(catalog.cards.characters || []),
      ...(catalog.cards.actions || []),
      ...(catalog.cards.items || []),
      ...(catalog.cards.locations || []),
    ];

    for (const card of allCards) {
      const setNumber = extractSetNumber(card.card_sets);
      const cardNumber = extractCardNumber(card.card_identifier);

      if (!setNumber || !cardNumber) {
        continue;
      }

      // Process Regular variant only
      if (card.variants && Array.isArray(card.variants)) {
        for (const variant of card.variants) {
          if (variant.variant_id === "Regular" && variant.detail_image_url) {
            mapping.push({
              name: card.name,
              set: setNumber,
              cardNumber: cardNumber,
              identifier: card.card_identifier,
              variantId: variant.variant_id,
              url: variant.detail_image_url,
              rarity: card.rarity,
            });
            break; // Only use Regular variant
          }
        }
      }
    }

    return mapping;
  } catch (error) {
    console.error(`Error loading catalog for ${language}:`, error);
    return null;
  }
}

/**
 * Load Lorcast data for a specific set
 */
function loadLorcastData(set: string): LorcastCard[] | null {
  const lorcastPath = path.join(
    process.cwd(),
    "scripts",
    "sources",
    "lorcast",
    `${set}.json`
  );

  if (!fs.existsSync(lorcastPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(lorcastPath, "utf-8"));
  } catch (error) {
    console.error(`Error loading Lorcast data for set ${set}:`, error);
    return null;
  }
}

/**
 * Find card in Ravensburger mapping
 */
function findInRavensburg(
  card: CardInfo,
  mapping: RavensburgMappingEntry[]
): RavensburgMappingEntry | null {
  return (
    mapping.find(
      (entry) =>
        entry.set === card.set &&
        entry.cardNumber === card.cardNumber &&
        entry.variantId === "Regular"
    ) || null
  );
}

/**
 * Find card in Lorcast data
 */
function findInLorcast(
  card: CardInfo,
  lorcastCards: LorcastCard[]
): LorcastCard | null {
  const cardNum = card.cardNumber.replace(/^0+/, ""); // Remove leading zeros
  return (
    lorcastCards.find(
      (lc) =>
        lc.collector_number === cardNum &&
        lc.lang.toUpperCase() === card.language.toUpperCase()
    ) || null
  );
}

/**
 * Download from Ravensburger API
 */
async function downloadFromRavensburg(
  card: CardInfo,
  entry: RavensburgMappingEntry,
  outputDir: string
): Promise<DownloadResult> {
  const url = entry.url;
  const extension = url.toLowerCase().endsWith(".jpg") ? "jpg" : "webp";
  const tempDir = path.join(process.cwd(), "temp-downloads");
  const tempFilePath = path.join(
    tempDir,
    `${card.set}-${card.cardNumber}-temp.${extension}`
  );

  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    await downloadFile(url, tempFilePath);
    return {
      success: true,
      filePath: tempFilePath,
      source: "ravensburg",
    };
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Download from Lorcast API
 */
async function downloadFromLorcast(
  card: CardInfo,
  lorcastCard: LorcastCard,
  outputDir: string
): Promise<DownloadResult> {
  const url = lorcastCard.image_uris.digital.large;
  const extension = url.toLowerCase().includes(".avif")
    ? "avif"
    : url.toLowerCase().includes(".webp")
    ? "webp"
    : "jpg";

  const tempDir = path.join(process.cwd(), "temp-downloads");
  const tempFilePath = path.join(
    tempDir,
    `${card.set}-${card.cardNumber}-temp.${extension}`
  );

  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    await downloadFile(url, tempFilePath);
    return {
      success: true,
      filePath: tempFilePath,
      source: "lorcast",
    };
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if card already exists in any format
 */
export function cardExists(card: CardInfo, rootFolder: string): boolean {
  const basePath = path.join(
    rootFolder,
    card.language,
    card.set,
    card.cardNumber
  );
  const formats = [".webp", ".avif", ".jpg", ".png"];
  return formats.some((ext) => fs.existsSync(basePath + ext));
}

/**
 * Download a card image with Ravensburger -> Lorcast fallback
 */
export async function downloadCard(
  card: CardInfo,
  rootFolder: string,
  skipExisting: boolean = true
): Promise<DownloadResult> {
  // Check if already exists
  if (skipExisting && cardExists(card, rootFolder)) {
    return {
      success: true,
      skipped: true,
    };
  }

  const outputDir = path.join(rootFolder, card.language, card.set);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Try Ravensburger first (language-specific catalog)
  const ravensburgMapping = loadRavensburgMapping(card.language);
  if (ravensburgMapping) {
    const ravensburgEntry = findInRavensburg(card, ravensburgMapping);
    if (ravensburgEntry) {
      const result = await downloadFromRavensburg(
        card,
        ravensburgEntry,
        outputDir
      );
      if (result.success) {
        return result;
      }
    }
  }

  // Fallback to Lorcast
  const lorcastData = loadLorcastData(card.set);
  if (lorcastData) {
    const lorcastCard = findInLorcast(card, lorcastData);
    if (lorcastCard) {
      const result = await downloadFromLorcast(card, lorcastCard, outputDir);
      if (result.success) {
        return result;
      }
    }
  }

  return {
    success: false,
    error: "Card not found in Ravensburg or Lorcast sources",
  };
}

/**
 * Batch download multiple cards
 */
export async function downloadCards(
  cards: CardInfo[],
  rootFolder: string,
  skipExisting: boolean = true,
  onProgress?: (current: number, total: number, card: CardInfo) => void
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (onProgress) {
      onProgress(i + 1, cards.length, card);
    }

    const result = await downloadCard(card, rootFolder, skipExisting);
    results.push(result);
  }

  return results;
}

