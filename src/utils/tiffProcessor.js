import JSZip from 'jszip';
import UTIF from 'utif';

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

  // Parse TIFF using UTIF.js for robust color and format handling
  const tifBuffer = await tifFile.async('arraybuffer');
  const ifds = UTIF.decode(tifBuffer);
  UTIF.decodeImage(tifBuffer, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  
  const width = ifds[0].width;
  const height = ifds[0].height;
  
  // Detect if image is color (PhotometricInterpretation)
  // 0, 1: Grayscale, 2: RGB, 3: Palette, 5: CMYK, 6: YCbCr
  let isColor = false;
  if (ifds[0].t262 && ifds[0].t262.length > 0) {
    const pi = ifds[0].t262[0];
    if (pi === 2 || pi === 3 || pi === 5 || pi === 6) {
      isColor = true;
    }
  }

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

  // Sample pixels from the UTIF RGBA array
  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const srcX = Math.floor(x * scale);
      const srcY = Math.floor(y * scale);
      if (srcX >= width || srcY >= height) continue;
      
      const dstIdx = (y * canvasWidth + x) * 4;
      const srcIdx = (srcY * width + srcX) * 4;
      
      data[dstIdx]   = rgba[srcIdx];
      data[dstIdx+1] = rgba[srcIdx + 1];
      data[dstIdx+2] = rgba[srcIdx + 2];
      data[dstIdx+3] = rgba[srcIdx + 3];
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
    rgbaLength: rgba.length,
    isColor
  });

  return {
    name: tifFile.name,
    dataUrl,
    tfw,
    width,
    height,
    isColor
  };
}
