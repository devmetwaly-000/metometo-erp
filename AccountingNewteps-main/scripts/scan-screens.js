const fs = require('fs');
const path = require('path');

function scanDbActions(dir) {
    const actions = [];
    const files = fs.readdirSync(dir);
    files.forEach(f => {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) {
            if (f !== 'node_modules' && f !== '.next') {
                actions.push(...scanDbActions(fp));
            }
        } else if (fp.endsWith('.ts') || fp.endsWith('.tsx')) {
            const content = fs.readFileSync(fp, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                const match = line.match(/dbAction\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/);
                if (match) {
                    actions.push({
                        file: path.relative('d:/MultiBranch_Account/AccountingNewteps-main', fp),
                        line: idx + 1,
                        path: match[1],
                        rootCollection: match[1].split('/')[0],
                        action: match[2]
                    });
                }
            });
        }
    });
    return actions;
}

const actions = scanDbActions('d:/MultiBranch_Account/AccountingNewteps-main/src');
const uniqueRoots = Array.from(new Set(actions.map(a => a.rootCollection))).sort();
console.log('=== TOTAL dbAction calls found:', actions.length);
console.log('=== UNIQUE collections called via dbAction:', uniqueRoots);

// Group by collection
const byCollection = {};
actions.forEach(a => {
    if (!byCollection[a.rootCollection]) byCollection[a.rootCollection] = [];
    byCollection[a.rootCollection].push({ file: a.file, action: a.action, line: a.line });
});

for (const [col, list] of Object.entries(byCollection)) {
    console.log(`\nCollection [${col}] (${list.length} calls):`);
    list.slice(0, 3).forEach(l => console.log(`   ${l.action} in ${l.file}:${l.line}`));
    if (list.length > 3) console.log(`   ... and ${list.length - 3} more`);
}

