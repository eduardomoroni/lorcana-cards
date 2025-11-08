// Download cards from Ravensburger API based on catalog

import fs from "fs";
import https from "https";
import { rootFolder } from "./shared.js";

const CATALOG_PATH = "./scripts/catalog/en.json";
const MAPPING_OUTPUT_PATH = "./scripts/ravensburg-mapping.json";

interface CardVariant {
  variant_id: string;
  detail_image_url: string;
  foil_type?: string;
  foil_mask_url?: string;
}

interface Card {
  name: string;
  card_sets: string[];
  card_identifier: string;
  variants: CardVariant[];
  rarity: string;
}

interface CardsCollection {
  characters?: Card[];
  actions?: Card[];
  items?: Card[];
  locations?: Card[];
}

interface CatalogData {
  cards: CardsCollection;
  catalog_hash: string;
  [key: string]: any; // Other properties we don't need
}

interface MappingEntry {
  name: string;
  set: string;
  cardNumber: string;
  identifier: string;
  variantId: string;
  url: string;
  rarity: string;
}

/**
 * Extract set number from card_sets array
 * e.g., ["set3"] -> "003", ["promo1"] -> "P01"
 */
function extractSetNumber(cardSets: string[]): string | null {
  if (!cardSets || cardSets.length === 0) return null;
  
  const cardSet = cardSets[0]; // Take first set
  
  // Handle regular sets: "set1" -> "001", "set10" -> "010"
  if (cardSet.startsWith("set")) {
    const setNum = cardSet.replace("set", "");
    return setNum.padStart(3, "0");
  }
  
  // Handle promo sets: "promo1" -> "P01"
  if (cardSet.startsWith("promo")) {
    const promoNum = cardSet.replace("promo", "");
    return "P" + promoNum.padStart(2, "0");
  }
  
  // Handle gateway sets: "gateway1" -> "G01"
  if (cardSet.startsWith("gateway")) {
    const gatewayNum = cardSet.replace("gateway", "");
    return "G" + gatewayNum.padStart(2, "0");
  }
  
  // Handle challenge sets: "challenge1" -> "C01"
  if (cardSet.startsWith("challenge")) {
    const challengeNum = cardSet.replace("challenge", "");
    return "C" + challengeNum.padStart(2, "0");
  }
  
  // Handle quest sets: "quest1" -> "Q01"
  if (cardSet.startsWith("quest")) {
    const questNum = cardSet.replace("quest", "");
    return "Q" + questNum.padStart(2, "0");
  }
  
  return null;
}

/**
 * Extract card number from card_identifier
 * e.g., "159/204 EN 3" -> "159"
 */
function extractCardNumber(cardIdentifier: string): string | null {
  if (!cardIdentifier) return null;
  const match = cardIdentifier.match(/^(\d+)\//);
  return match ? match[1].padStart(3, "0") : null;
}

/**
 * Create mapping from catalog
 */
function createMapping(): MappingEntry[] {
  console.log(`Reading catalog from ${CATALOG_PATH}...`);
  
  const catalogData: CatalogData = JSON.parse(
    fs.readFileSync(CATALOG_PATH, "utf-8")
  );
  const mapping: MappingEntry[] = [];
  
  if (!catalogData.cards) {
    throw new Error("Invalid catalog format: missing cards object");
  }
  
  // Combine all card types into a single array
  const allCards: Card[] = [
    ...(catalogData.cards.characters || []),
    ...(catalogData.cards.actions || []),
    ...(catalogData.cards.items || []),
    ...(catalogData.cards.locations || []),
  ];
  
  console.log(`Processing ${allCards.length} cards...`);
  
  for (const card of allCards) {
    const setNumber = extractSetNumber(card.card_sets);
    const cardNumber = extractCardNumber(card.card_identifier);
    
    if (!setNumber || !cardNumber) {
      console.warn(
        `Skipping card: ${card.name} - couldn't extract set or card number`
      );
      continue;
    }
    
    // Process each variant
    if (card.variants && Array.isArray(card.variants)) {
      for (const variant of card.variants) {
        if (variant.detail_image_url) {
          mapping.push({
            name: card.name,
            set: setNumber,
            cardNumber: cardNumber,
            identifier: card.card_identifier,
            variantId: variant.variant_id,
            url: variant.detail_image_url,
            rarity: card.rarity,
          });
        }
      }
    }
  }
  
  console.log(`Created mapping for ${mapping.length} card variants`);
  
  // Save mapping to file
  fs.writeFileSync(
    MAPPING_OUTPUT_PATH,
    JSON.stringify(mapping, null, 2),
    "utf-8"
  );
  
  console.log(`Mapping saved to ${MAPPING_OUTPUT_PATH}`);
  
  return mapping;
}

/**
 * Download a single image
 */
function download(url: string, filepath: string): Promise<string> {
  console.log(`Downloading ${url} to ${filepath}`);
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        res
          .pipe(fs.createWriteStream(filepath))
          .on("error", reject)
          .once("close", () => resolve(filepath));
      } else {
        // Consume response data to free up memory
        res.resume();
        console.error(`Download failed: ${url} (Status: ${res.statusCode})`);
        reject(
          new Error(`Request Failed With Status Code: ${res.statusCode}`)
        );
      }
    });
  });
}

/**
 * Download image for a card
 */
async function downloadCard(mappingEntry: MappingEntry): Promise<void> {
  const { set, cardNumber, url } = mappingEntry;
  
  // Determine file extension from URL
  const urlLower = url.toLowerCase();
  const extension = urlLower.endsWith(".jpg") ? "jpg" : "webp";
  
  // Create destination path following the existing folder structure
  // Format: {rootFolder}/EN/{set}/{cardNumber}.{extension}
  const language = "EN"; // Default to English from the catalog
  const destination = `${rootFolder}/${language}/${set}/${cardNumber}.${extension}`;
  
  // Create folder if it doesn't exist
  const folder = destination.replace(/\/[^/]+$/, "");
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  
  // Skip if file already exists in any format (webp, jpg, avif)
  const basePath = `${rootFolder}/${language}/${set}/${cardNumber}`;
  const existingFormats = ['.webp', '.jpg', '.avif', '.png'];
  const existingFile = existingFormats.find(ext => fs.existsSync(basePath + ext));
  
  if (existingFile) {
    console.log(`File ${basePath}${existingFile} already exists, skipping`);
    return;
  }
  
  try {
    await download(url, destination);
  } catch (error) {
    console.error(`Error downloading ${url}:`, (error as Error).message);
    throw error;
  }
}

/**
 * Main program
 */
async function program(): Promise<void> {
  try {
    // Check if we should only create the mapping
    const mapOnly = process.argv.includes("--map-only");
    
    // Always regenerate mapping from the latest catalog
    console.log(`Generating fresh mapping from catalog...`);
    const mapping = createMapping();
    
    if (mapOnly) {
      console.log(
        `\n✓ Mapping file created successfully with ${mapping.length} card variants`
      );
      console.log(`\nTo download images, run: bun scripts/download-from-ravensburg.ts`);
      return;
    }
    
    // Filter for set 010 only
    const set010Cards = mapping.filter(entry => entry.set === "010");
    
    console.log(`\nStarting download of ${set010Cards.length} card images from Set 010...\n`);
    
    // Download all cards
    const errors: Array<{ entry: MappingEntry; error: string }> = [];
    for (let i = 0; i < set010Cards.length; i++) {
      const entry = set010Cards[i];
      console.log(
        `[${i + 1}/${set010Cards.length}] ${entry.name} (${entry.identifier}) - ${entry.variantId}`
      );
      
      try {
        await downloadCard(entry);
      } catch (error) {
        errors.push({
          entry,
          error: (error as Error).message,
        });
      }
    }
    
    // Report errors
    if (errors.length > 0) {
      console.error(`\n${errors.length} errors occurred:`);
      fs.writeFileSync(
        "ravensburg-errors.log",
        JSON.stringify(errors, null, 2),
        "utf-8"
      );
      console.error(`Error details saved to ravensburg-errors.log`);
    } else {
      console.log("\nAll downloads completed successfully!");
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the program
program();

