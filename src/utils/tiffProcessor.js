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
  
  const rasters = await image.readRasters();
  
  // Downscale if too large to prevent canvas toDataURL crashes
  const MAX_DIM = 4096;
  let scale = 1;
  if (width > MAX_DIM || height > MAX_DIM) {
    scale = Math.max(width / MAX_DIM, height / MAX_DIM);
  }
  
  const canvasWidth = Math.max(1, Math.floor(width / scale));
  const canvasHeight = Math.max(1, Math.floor(height / scale));

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(canvasWidth, canvasHeight);
  const data = imageData.data;

  // Check if rasters is interleaved or array of channels
  const isInterleaved = !Array.isArray(rasters) && !(rasters[0] && rasters[0].length);
  const numChannels = isInterleaved ? Math.floor(rasters.length / (width * height)) : rasters.length;
  
  // Find min/max for normalization if it's float or uint16
  let maxVal = 255;
  const sampleData = isInterleaved ? rasters : rasters[0];
  if (sampleData instanceof Uint16Array) maxVal = 65535;
  else if (sampleData instanceof Float32Array || sampleData instanceof Float64Array) {
    let m = 0;
    for(let i=0; i<Math.min(sampleData.length, 10000); i++) if(sampleData[i] > m) m = sampleData[i];
    maxVal = m > 0 ? m : 1.0;
  }
  
  const multiplier = 255 / maxVal;

  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const srcX = Math.floor(x * scale);
      const srcY = Math.floor(y * scale);
      if (srcX >= width || srcY >= height) continue;
      
      const dstIdx = (y * canvasWidth + x) * 4;
      const srcIdx = srcY * width + srcX;
      
      if (isInterleaved) {
        if (numChannels === 1) {
          const val = rasters[srcIdx] * multiplier;
          data[dstIdx] = val; data[dstIdx+1] = val; data[dstIdx+2] = val; data[dstIdx+3] = 255;
        } else if (numChannels >= 3) {
          data[dstIdx] = rasters[srcIdx * numChannels] * multiplier;
          data[dstIdx+1] = rasters[srcIdx * numChannels + 1] * multiplier;
          data[dstIdx+2] = rasters[srcIdx * numChannels + 2] * multiplier;
          data[dstIdx+3] = numChannels >= 4 ? rasters[srcIdx * numChannels + 3] * multiplier : 255;
        }
      } else {
        if (numChannels === 1) {
          const val = rasters[0][srcIdx] * multiplier;
          data[dstIdx] = val; data[dstIdx+1] = val; data[dstIdx+2] = val; data[dstIdx+3] = 255;
        } else if (numChannels >= 3) {
          data[dstIdx] = rasters[0][srcIdx] * multiplier;
          data[dstIdx+1] = rasters[1][srcIdx] * multiplier;
          data[dstIdx+2] = rasters[2][srcIdx] * multiplier;
          data[dstIdx+3] = numChannels >= 4 ? rasters[3][srcIdx] * multiplier : 255;
        }
      }
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
    isInterleaved,
    numChannels,
    maxVal,
    sampleDataLength: sampleData.length
  });

  return {
    name: tifFile.name,
    dataUrl,
    tfw,
    width,
    height
  };
}
