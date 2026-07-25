export const DB_NAME = 'HoanrinAppDB';
export const DB_VERSION = 1;
export const STORE_NAME = 'workspace';

export const CS_ORIGINS = {
  1: [33, 129.5], 2: [33, 131], 3: [36, 132 + 10/60], 4: [33, 133.5], 5: [36, 134 + 20/60],
  6: [36, 136], 7: [36, 137 + 10/60], 8: [36, 138.5], 9: [36, 139 + 50/60], 10: [40, 139 + 50/60],
  11: [44, 140.25], 12: [44, 142.25], 13: [44, 144.25], 14: [26, 142], 15: [26, 127.5],
  16: [26, 124], 17: [26, 131], 18: [20, 136], 19: [26, 154]
};

export const LINE_STYLES = [
  { id: 'single', name: '単線' },
  { id: 'double', name: '二重線' },
  { id: 'double_dashed', name: '二重線 (内側が破線)' },
  { id: 'single_inner', name: '単線＋内側二点鎖線' },
  { id: 'double_inner', name: '二重線＋内側二点鎖線' },
  { id: 'dashed', name: '破線 (択伐区域など)' },
  { id: 'dashdot', name: '一点鎖線 (間伐区域など)' },
  { id: 'dotted', name: '点線 (字界など)' },
  { id: 'none', name: '線なし (記号のみ配置)' }
];

export const DECO_PATTERNS = [
  { id: 'none', name: 'なにもなし', pattern: null },
  { id: 'hige', name: 'ヒゲのみ', pattern: 'hige' },
  { id: 'cross', name: '× (バツ)', pattern: 'cross' },
  { id: 'triangle', name: '△ (三角)', pattern: 'triangle' },
  { id: 'circle', name: '〇 (丸)', pattern: 'circle' },
  { id: 'circle_triangle', name: '〇・△ 交互', pattern: 'circle_triangle' },
  { id: 'hige_circle', name: 'ヒゲ・〇 交互', pattern: 'hige_circle_alt' },
  { id: 'hige_triangle', name: 'ヒゲ・△ 交互', pattern: 'hige_triangle_alt' },
  { id: 'hige_circle_triangle', name: 'ヒゲ・△・〇 交互', pattern: 'hige_circle_triangle_alt' },
  { id: 'solid_circle', name: '● (線上黒丸)', pattern: 'solid_circle' },
  { id: 'angle_bracket', name: '＜・＞ (県界)', pattern: 'angle_bracket' }
];

export const CS_PREFECTURES = [
  { lat: 43.06, lon: 141.34, sys: 12 }, { lat: 41.76, lon: 140.73, sys: 11 }, { lat: 43.82, lon: 143.89, sys: 13 },
  { lat: 40.82, lon: 140.74, sys: 10 }, { lat: 39.70, lon: 141.15, sys: 10 }, { lat: 38.26, lon: 140.87, sys: 10 },
  { lat: 39.71, lon: 140.10, sys: 10 }, { lat: 38.24, lon: 140.36, sys: 10 }, { lat: 37.75, lon: 140.46, sys: 9 },
  { lat: 36.34, lon: 140.44, sys: 9 }, { lat: 36.56, lon: 139.88, sys: 9 }, { lat: 36.39, lon: 139.06, sys: 9 },
  { lat: 35.85, lon: 139.64, sys: 9 }, { lat: 35.60, lon: 140.12, sys: 9 }, { lat: 35.68, lon: 139.69, sys: 9 },
  { lat: 35.44, lon: 139.64, sys: 9 }, { lat: 37.90, lon: 139.02, sys: 8 }, { lat: 36.69, lon: 137.21, sys: 7 },
  { lat: 36.59, lon: 136.62, sys: 7 }, { lat: 36.06, lon: 136.22, sys: 6 }, { lat: 35.66, lon: 138.56, sys: 8 },
  { lat: 36.65, lon: 138.18, sys: 8 }, { lat: 35.39, lon: 136.72, sys: 7 }, { lat: 34.97, lon: 138.38, sys: 8 },
  { lat: 35.18, lon: 136.90, sys: 7 }, { lat: 34.73, lon: 136.50, sys: 6 }, { lat: 35.00, lon: 135.86, sys: 6 },
  { lat: 35.02, lon: 135.75, sys: 6 }, { lat: 34.68, lon: 135.52, sys: 6 }, { lat: 34.69, lon: 135.18, sys: 5 },
  { lat: 34.68, lon: 135.80, sys: 6 }, { lat: 34.22, lon: 135.16, sys: 6 }, { lat: 35.50, lon: 134.23, sys: 5 },
  { lat: 35.47, lon: 133.05, sys: 3 }, { lat: 34.66, lon: 133.93, sys: 5 }, { lat: 34.39, lon: 132.45, sys: 3 },
  { lat: 34.18, lon: 131.47, sys: 3 }, { lat: 34.06, lon: 134.55, sys: 4 }, { lat: 34.34, lon: 134.04, sys: 4 },
  { lat: 33.84, lon: 132.76, sys: 4 }, { lat: 33.55, lon: 133.53, sys: 4 }, { lat: 33.60, lon: 130.40, sys: 2 },
  { lat: 33.24, lon: 130.29, sys: 2 }, { lat: 32.74, lon: 129.87, sys: 1 }, { lat: 32.78, lon: 130.74, sys: 2 },
  { lat: 33.23, lon: 131.61, sys: 2 }, { lat: 31.91, lon: 131.42, sys: 2 }, { lat: 31.56, lon: 130.55, sys: 2 },
  { lat: 26.21, lon: 127.68, sys: 15 }
];

