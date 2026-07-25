const fs = require('fs');
const path = require('path');

const rootReadme = path.join(__dirname, '..', 'README.md');
const rootLicense = path.join(__dirname, '..', 'LICENSE');

if (!fs.existsSync(rootReadme)) {
  console.log('No root README found.');
}

const dirs = ['cli', 'packages'];

for (const dir of dirs) {
  const fullDirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullDirPath)) continue;
  
  const packages = fs.readdirSync(fullDirPath);
  for (const pkg of packages) {
    const pkgPath = path.join(fullDirPath, pkg);
    if (fs.statSync(pkgPath).isDirectory() && fs.existsSync(path.join(pkgPath, 'package.json'))) {
      if (fs.existsSync(rootReadme)) {
        fs.copyFileSync(rootReadme, path.join(pkgPath, 'README.md'));
        console.log(`Copied README to ${path.join(dir, pkg)}`);
      }
      if (fs.existsSync(rootLicense)) {
        fs.copyFileSync(rootLicense, path.join(pkgPath, 'LICENSE'));
        console.log(`Copied LICENSE to ${path.join(dir, pkg)}`);
      }
    }
  }
}
