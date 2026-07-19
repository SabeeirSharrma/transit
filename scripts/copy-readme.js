const fs = require('fs');
const path = require('path');

const rootReadme = path.join(__dirname, '..', 'README.md');
if (!fs.existsSync(rootReadme)) {
  console.log('No root README found.');
  process.exit(0);
}

const dirs = ['cli', 'packages'];

for (const dir of dirs) {
  const fullDirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullDirPath)) continue;
  
  const packages = fs.readdirSync(fullDirPath);
  for (const pkg of packages) {
    const pkgPath = path.join(fullDirPath, pkg);
    if (fs.statSync(pkgPath).isDirectory() && fs.existsSync(path.join(pkgPath, 'package.json'))) {
      const dest = path.join(pkgPath, 'README.md');
      fs.copyFileSync(rootReadme, dest);
      console.log(`Copied README to ${path.join(dir, pkg)}`);
    }
  }
}
