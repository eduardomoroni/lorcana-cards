const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const directory = 'public/assets/images/cards/EN/010';

async function checkAndConvertFiles() {
    try {
        const files = fs.readdirSync(directory);
        
        // Group files by base name
        const fileGroups = {};
        
        files.forEach(file => {
            const baseName = path.parse(file).name;
            if (!fileGroups[baseName]) {
                fileGroups[baseName] = [];
            }
            fileGroups[baseName].push(file);
        });

        console.log('Checking for files missing webp versions...\n');
        
        const filesToConvert = [];
        
        Object.keys(fileGroups).forEach(baseName => {
            const extensions = fileGroups[baseName].map(file => path.parse(file).ext);
            const hasWebp = extensions.includes('.webp');
            const hasAvif = extensions.includes('.avif');
            
            if (hasAvif && !hasWebp) {
                const avifFile = fileGroups[baseName].find(file => file.endsWith('.avif'));
                filesToConvert.push({
                    baseName,
                    avifFile,
                    webpFile: `${baseName}.webp`
                });
            }
        });

        if (filesToConvert.length === 0) {
            console.log('✅ All files already have webp versions!');
            return;
        }

        console.log(`Found ${filesToConvert.length} files missing webp versions:`);
        filesToConvert.forEach(({ baseName }) => {
            console.log(`  - ${baseName}.avif (missing ${baseName}.webp)`);
        });

        console.log('\nConverting files...\n');

        // Convert each file
        for (const { baseName, avifFile, webpFile } of filesToConvert) {
            const avifPath = path.join(directory, avifFile);
            const webpPath = path.join(directory, webpFile);
            
            try {
                console.log(`Converting ${avifFile} to ${webpFile}...`);
                
                // Use Sharp to convert avif to webp
                await sharp(avifPath)
                    .webp({ quality: 80 })
                    .toFile(webpPath);
                
                console.log(`✅ Converted ${baseName}.avif → ${baseName}.webp`);
            } catch (error) {
                console.error(`❌ Failed to convert ${baseName}.avif:`, error.message);
            }
        }

        console.log('\n✨ Conversion process completed!');
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkAndConvertFiles();
