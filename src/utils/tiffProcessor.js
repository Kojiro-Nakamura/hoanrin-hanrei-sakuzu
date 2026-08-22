import JSZip from 'jszip';
import * as GeoTIFF from 'geotiff';

export async function parseTiffZip(file) {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  let tifFile = null;
  let tfwFile = null;

  for (const [filename, zipEntry] of Object.entries(loadedZip.files)) {
    if (zipEntry.dir) continue;
    const lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.tif') || lowerName.endsWith('.tiff')) {
      tifFile = zipEntry;
    } else if (lowerName.endsWith('.tfw')) {
      tfwFile = zipEntry;
    }
  }

  if (!tifFile) throw new Error("ZIP内にTIFF画像が見つかりません。");
  if (!tfwFile) throw new Error("ZIP内にTFWファイルが見つかりません。");

  // Parse TFW
  const tfwText = await tfwFile.async('string');
  const tfwLines = tfwText.split(/[\r\n]+/).map(line => parseFloat(line.trim())).filter(n => !isNaN(n));
  if (tfwLines.length < 6) {
    throw new Error("TFWファイルの形式が正しくありません。");
  }
  const tfw = {
    A: tfwLines[0],
    D: tfwLines[1],
    B: tfwLines[2],
    E: tfwLines[3],
    C: tfwLines[4],
    F: tfwLines[5]
  };

  // Parse TIFF
  const tifBuffer = await tifFile.async('arraybuffer');
  const tiff = await GeoTIFF.fromArrayBuffer(tifBuffer);
  const image = await tiff.getImage();
  
  const width = image.getWidth();
  const height = image.getHeight();
  
  const rasters = await image.readRasters({ interleave: true });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);

  const numChannels = rasters.length / (width * height);
  const data = imageData.data;

  for (let i = 0; i < width * height; i++) {
    if (numChannels === 1) {
      const val = rasters[i];
      data[i * 4] = val;
      data[i * 4 + 1] = val;
      data[i * 4 + 2] = val;
      data[i * 4 + 3] = 255;
    } else if (numChannels === 3) {
      data[i * 4] = rasters[i * 3];
      data[i * 4 + 1] = rasters[i * 3 + 1];
      data[i * 4 + 2] = rasters[i * 3 + 2];
      data[i * 4 + 3] = 255;
    } else if (numChannels >= 4) {
      data[i * 4] = rasters[i * numChannels];
      data[i * 4 + 1] = rasters[i * numChannels + 1];
      data[i * 4 + 2] = rasters[i * numChannels + 2];
      data[i * 4 + 3] = rasters[i * numChannels + 3];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

  return {
    name: tifFile.name,
    dataUrl,
    tfw,
    width,
    height
  };
}
