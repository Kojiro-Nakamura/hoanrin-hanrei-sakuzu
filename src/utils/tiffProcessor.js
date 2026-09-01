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
    } else if (lowerName.endsWith('.tfw') || lowerName.endsWith('.txt')) {
      tfwFile = zipEntry;
    }
  }

  if (!tifFile) throw new Error("ZIP内にTIFF画像が見つかりません。");
  if (!tfwFile) throw new Error("ZIP内にTFW(またはTXT)ファイルが見つかりません。");

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
  
  // Downscale if too large to prevent canvas toDataURL crashes
  const MAX_DIM = 4096;
  let scale = 1;
  if (width > MAX_DIM || height > MAX_DIM) {
    scale = Math.max(width / MAX_DIM, height / MAX_DIM);
  }
  
  const canvasWidth = Math.max(1, Math.floor(width / scale));
  const canvasHeight = Math.max(1, Math.floor(height / scale));

  // Let GeoTIFF.js handle the downsampling and color conversion internally!
  // Passing width and height prevents it from loading a massive image into memory and hanging.
  const rgb = await image.readRGB({ width: canvasWidth, height: canvasHeight, resampleMethod: 'nearest' });

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(canvasWidth, canvasHeight);
  const data = imageData.data;

  // readRGB always returns interleaved data (usually 3 or 4 channels).
  const numChannels = Math.floor(rgb.length / (canvasWidth * canvasHeight));
  
  // Find min/max for normalization if it's float or uint16
  let maxVal = 255;
  if (rgb instanceof Uint16Array) maxVal = 65535;
  else if (rgb instanceof Float32Array || rgb instanceof Float64Array) {
    let m = 0;
    for(let i=0; i<Math.min(rgb.length, 10000); i++) if(rgb[i] > m) m = rgb[i];
    maxVal = m > 0 ? m : 1.0;
  }
  
  const multiplier = 255 / maxVal;

  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const dstIdx = (y * canvasWidth + x) * 4;
      const srcIdx = (y * canvasWidth + x) * numChannels;
      
      data[dstIdx]   = rgb[srcIdx] * multiplier;
      data[dstIdx+1] = rgb[srcIdx + 1] * multiplier;
      data[dstIdx+2] = rgb[srcIdx + 2] * multiplier;
      data[dstIdx+3] = (numChannels >= 4) ? (rgb[srcIdx + 3] * multiplier) : 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  if (dataUrl === "data:,") throw new Error("画像変換に失敗しました。ファイルが大きすぎる可能性があります。");

  console.log('TIFF Pixel Info:', {
    originalWidth: width,
    originalHeight: height,
    scale,
    canvasWidth,
    canvasHeight,
    numChannels,
    maxVal,
    sampleDataLength: rgb.length
  });

  return {
    name: tifFile.name,
    dataUrl,
    tfw,
    width,
    height
  };
}
