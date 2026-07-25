const fs = require('fs');

try {
  const dataProcPath = 'src/utils/dataProcessing.js';
  const parseKmlPath = 'C:/Users/gyrom/.gemini/antigravity/brain/50999789-22d5-4f48-8a45-22becdec61e5/parseKml.js';
  
  const buf1 = fs.readFileSync(dataProcPath);
  const buf2 = fs.readFileSync(parseKmlPath);
  
  // Make sure we have a newline between them
  const newline = Buffer.from('\n', 'utf8');
  
  const combined = Buffer.concat([buf1, newline, buf2]);
  
  fs.writeFileSync(dataProcPath, combined);
  console.log("Appended parseKml safely using Buffers.");
} catch(e) {
  console.error(e);
}
