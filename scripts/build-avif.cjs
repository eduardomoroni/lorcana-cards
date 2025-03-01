const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, '../public');

fs.readdir(directory, (err, files) => {
    if (err) throw err;

    files.forEach(file => {
        if (path.extname(file) === '.webp') {
            fs.unlink(path.join(directory, file), err => {
                if (err) throw err;
                console.log(`Deleted: ${file}`);
            });
        }
    });
});