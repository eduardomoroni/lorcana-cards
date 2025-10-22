// Download cards from Lorcast API based on local JSON file

import fs from "fs";
import https from "https";
import { rootFolder } from "./shared.js";

const LORCAST_JSON_PATH = "./scripts/lorcast/010.json";

interface ImageUris {
  digital: {
    small: string;
    normal: string;
    large: string;
  };
}

interface SetInfo {
  id: string;
  code: string;
  name: string;
}

interface LorcastCard {
  id: string;
  name: string;
  version?: string;
  collector_number: string;
  lang: string;
  image_uris: ImageUris;
  set: SetInfo;
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
async function downloadCard(card: LorcastCard): Promise<void> {
  const { collector_number, lang, image_uris, set } = card;
  
  // Get the large image URL
  const url = image_uris.digital.large;
  
  if (!url) {
    console.warn(`No large image URL for card ${card.name} (${collector_number})`);
    return;
  }
  
  // Determine file extension from URL (lorcast uses .avif)
  const urlLower = url.toLowerCase();
  const extension = urlLower.includes(".avif") ? "avif" : 
                   urlLower.includes(".webp") ? "webp" : 
                   urlLower.includes(".jpg") ? "jpg" : "avif";
  
  // Pad set code and collector number
  const setCode = set.code.padStart(3, "0");
  const cardNumber = collector_number.padStart(3, "0");
  const language = lang.toUpperCase();
  
  // Create destination path following the existing folder structure
  // Format: {rootFolder}/{language}/{setCode}/{cardNumber}.{extension}
  const destination = `${rootFolder}/${language}/${setCode}/${cardNumber}.${extension}`;
  
  // Create folder if it doesn't exist
  const folder = destination.replace(/\/[^/]+$/, "");
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  
  // Skip if file already exists
  if (fs.existsSync(destination)) {
    console.log(`File ${destination} already exists, skipping`);
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
    console.log(`Reading lorcast data from ${LORCAST_JSON_PATH}...`);
    
    if (!fs.existsSync(LORCAST_JSON_PATH)) {
      throw new Error(`Lorcast JSON file not found: ${LORCAST_JSON_PATH}`);
    }
    
    const lorcastData: LorcastCard[] = JSON.parse(
      fs.readFileSync(LORCAST_JSON_PATH, "utf-8")
    );
    
    if (!Array.isArray(lorcastData)) {
      throw new Error("Invalid lorcast format: expected an array of cards");
    }
    
    console.log(`Processing ${lorcastData.length} cards from lorcast...\n`);
    
    // Download all cards
    const errors: Array<{ card: LorcastCard; error: string }> = [];
    for (let i = 0; i < lorcastData.length; i++) {
      const card = lorcastData[i];
      const cardDisplay = card.version 
        ? `${card.name} - ${card.version}` 
        : card.name;
      
      console.log(
        `[${i + 1}/${lorcastData.length}] ${cardDisplay} (${card.collector_number})`
      );
      
      try {
        await downloadCard(card);
      } catch (error) {
        errors.push({
          card,
          error: (error as Error).message,
        });
      }
    }
    
    // Report errors
    if (errors.length > 0) {
      console.error(`\n${errors.length} errors occurred:`);
      fs.writeFileSync(
        "lorcast-errors.log",
        JSON.stringify(errors, null, 2),
        "utf-8"
      );
      console.error(`Error details saved to lorcast-errors.log`);
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

