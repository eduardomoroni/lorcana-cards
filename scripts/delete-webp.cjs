const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, '../public');

function deleteNonAvifFiles(dir) {
    fs.readdir(dir, { withFileTypes: true }, (err, files) => {
        if (err) throw err;

        files.forEach(file => {
            const filePath = path.join(dir, file.name);
            if (file.isDirectory()) {
                deleteNonAvifFiles(filePath);
            } else if (path.extname(file.name) !== '.webp') {
                fs.unlink(filePath, err => {
                    if (err) throw err;
                    console.log(`Deleted: ${filePath}`);
                });
            }
        });
    });
}

deleteNonAvifFiles(directory);