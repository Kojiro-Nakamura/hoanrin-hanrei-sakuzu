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
