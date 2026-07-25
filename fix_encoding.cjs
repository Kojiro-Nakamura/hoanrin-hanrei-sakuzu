const fs = require('fs');

try {
  const dataProcPath = 'src/utils/dataProcessing.js';
  const parseKmlPath = 'C:/Users/gyrom/.gemini/antigravity/brain/50999789-22d5-4f48-8a45-22becdec61e5/parseKml.js';
  
  let lines = fs.readFileSync(dataProcPath, 'utf8').split('\n');
  
  // Find where parseKml starts
  const startIndex = lines.findIndex(l => l.includes('export const parseKml'));
  if (startIndex !== -1) {
    lines = lines.slice(0, startIndex);
  }
  
  const parseKmlContent = fs.readFileSync(parseKmlPath, 'utf8');
  
  const newContent = lines.join('\n') + (lines.length > 0 && lines[lines.length-1] !== '' ? '\n' : '') + parseKmlContent;
  
  fs.writeFileSync(dataProcPath, newContent, 'utf8');
  console.log("Successfully rebuilt dataProcessing.js with correct encoding.");
} catch(e) {
  console.error(e);
}
