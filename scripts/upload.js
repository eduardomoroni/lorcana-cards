const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configure these parameters as needed
const CHUNK_SIZE = 100;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|bmp|webp)$/i;

// Get all image files in current directory
const files = fs.readdirSync(process.cwd())
  .filter(file => IMAGE_EXTENSIONS.test(file))
  .sort(); // Sort files for consistent ordering

// Get current Git branch
const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  encoding: 'utf-8'
}).stdout.trim();

let chunkNumber = 0;

for (let i = 0; i < files.length; i += CHUNK_SIZE) {
  chunkNumber++;
  const chunk = files.slice(i, i + CHUNK_SIZE);
  console.log(`Processing batch ${chunkNumber} (${chunk.length} files)`);

  try {
    // Add files
    const addResult = spawnSync('git', ['add', ...chunk], { stdio: 'inherit' });
    if (addResult.status !== 0) throw new Error('git add failed');

    // Check for changes to commit
    const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf-8' });
    if (!status.stdout.trim()) {
      console.log('No changes to commit. Skipping batch.');
      continue;
    }

    // Commit changes
    const commitMessage = `Add images batch ${chunkNumber}`;
    const commitResult = spawnSync('git', ['commit', '-m', commitMessage], { 
      stdio: 'inherit' 
    });
    if (commitResult.status !== 0) throw new Error('git commit failed');

    // Push changes
    const pushResult = spawnSync('git', ['push', 'origin', branch], { 
      stdio: 'inherit' 
    });
    if (pushResult.status !== 0) throw new Error('git push failed');

    console.log(`Successfully pushed batch ${chunkNumber}\n`);
  } catch (error) {
    console.error(`Error processing batch ${chunkNumber}:`, error.message);
    process.exit(1);
  }
}

console.log('All batches processed successfully!');