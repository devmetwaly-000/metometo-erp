const fs = require('fs');
const path = require('path');

function findFiles(dir, match) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.next') {
                results = results.concat(findFiles(filePath, match));
            }
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js')) {
            const content = fs.readFileSync(filePath, 'utf8');
            if (match.test(content)) {
                results.push(filePath);
            }
        }
    });
    return results;
}

const found = findFiles('d:/MultiBranch_Account/AccountingNewteps-main/src', /from ['"]firebase/);
console.log('Files importing firebase:', found);

