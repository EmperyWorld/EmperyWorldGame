/** Soft district halos in location-decor (tile center → fillEllipse). Phaser-free. */

export type HavenTileWash = {
  tx: number;
  ty: number;
  color: number;
  a: number;
  w: number;
  h: number;
  label: string;
};

export const HAVEN_TILE_WASHES: readonly HavenTileWash[] = [
  { tx: 40, ty: 21, color: 0xc9a66b, a: 0.1, w: 760, h: 560, label: 'площадь' },
  { tx: 10, ty: 18, color: 0xd4a050, a: 0.11, w: 440, h: 360, label: 'рынок' },
  { tx: 12, ty: 8, color: 0x5a9870, a: 0.12, w: 380, h: 300, label: 'сквер (массив, не гарнизон)' },
  { tx: 42, ty: 28, color: 0xc890a0, a: 0.09, w: 300, h: 240, label: 'сцена' },
  { tx: 50, ty: 11, color: 0x6a88bb, a: 0.11, w: 400, h: 320, label: 'собор' },
  { tx: 56, ty: 7, color: 0xc8b090, a: 0.09, w: 240, h: 180, label: 'скрипторий' },
  { tx: 66, ty: 16, color: 0xd4b060, a: 0.1, w: 420, h: 340, label: 'дворец' },
  { tx: 46, ty: 16, color: 0x68a888, a: 0.1, w: 260, h: 220, label: 'лечебница' },
  { tx: 60, ty: 22, color: 0xc89050, a: 0.09, w: 300, h: 240, label: 'пивоварня' },
  { tx: 54, ty: 22, color: 0x88b8c8, a: 0.1, w: 260, h: 220, label: 'бани' },
  { tx: 62, ty: 20, color: 0xd4b080, a: 0.09, w: 240, h: 200, label: 'чайная' },
  { tx: 14, ty: 31, color: 0xcc5520, a: 0.12, w: 280, h: 240, label: 'кузня' },
  { tx: 10, ty: 36, color: 0xb89878, a: 0.09, w: 280, h: 260, label: 'мастерские' },
  { tx: 12, ty: 42, color: 0xb89860, a: 0.1, w: 300, h: 240, label: 'ЮЗ двор' },
  { tx: 28, ty: 39, color: 0xb89860, a: 0.09, w: 320, h: 260, label: 'конюшня' },
  { tx: 20, ty: 34, color: 0xc8b080, a: 0.09, w: 260, h: 220, label: 'мельница' },
  { tx: 14, ty: 9, color: 0x8890a0, a: 0.09, w: 360, h: 280, label: 'гарнизон' },
  { tx: 64, ty: 35, color: 0x1a4058, a: 0.16, w: 760, h: 500, label: 'EmperyWorld HQ' },
  { tx: 64, ty: 58, color: 0x3a4a58, a: 0.06, w: 1400, h: 980, label: 'порт' },
  { tx: 74, ty: 28, color: 0x889098, a: 0.1, w: 280, h: 260, label: 'вост. ворота' },
  { tx: 24, ty: 53, color: 0xd4c070, a: 0.14, w: 540, h: 220, label: 'поля' },
  { tx: 14, ty: 53, color: 0x708098, a: 0.12, w: 280, h: 200, label: 'некрополь' },
];
