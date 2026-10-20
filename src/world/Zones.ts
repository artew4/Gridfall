export interface Zone {
  id: string;
  name: string;
  jp: string;
  rects: [number, number, number, number][]; // x0, z0, x1, z1
}

/** Named areas of the district (the zone toast reads these). Upper walkways win when above deck height. */
export const ZONES: Zone[] = [
  { id: 'plaza', name: 'FOUNTAIN PLAZA', jp: '噴水広場', rects: [[-15, -15, 15, 15]] },
  { id: 'lantern', name: 'LANTERN STREET', jp: '提灯通り', rects: [[-5, 15, 5, 48]] },
  { id: 'neon', name: 'NEON ALLEY', jp: 'ネオン横丁', rects: [[15, -3, 48, 2]] },
  { id: 'service', name: 'SERVICE PASSAGE', jp: '搬入通路', rects: [[-45, -6, -15, -2]] },
  { id: 'north', name: 'RAILWAY STREET', jp: '線路通り', rects: [[-6, -58, 6, -15]] },
  { id: 'ura', name: 'BACK ALLEY', jp: '裏路地', rects: [[-24, -2, -21, 27], [-24, 24, -5, 27]] },
  { id: 'trackside', name: 'TRACKSIDE', jp: '高架下', rects: [[6, -26, 23, -21], [19, -21, 23, -3]] },
];

export const SKYWALK: Zone = { id: 'skywalk', name: 'UPPER WALKWAY', jp: '空中回廊', rects: [] };

/** Rooftop layer (y ≈ 8.5). */
export const ROOFTOPS: Zone[] = [
  { id: 'skygarden', name: 'SKY GARDEN', jp: '屋上庭園', rects: [[15, 2, 48, 15], [32, 0, 34, 2]] },
  { id: 'techroof', name: 'TECH ROOF', jp: '電波塔屋上', rects: [[23, -9, 48, -3], [40, -3, 42.5, 2]] },
  { id: 'lanternroof', name: 'LANTERN ROOF', jp: '提灯屋上', rects: [[5, 15, 20, 24], [-5, 19, 5, 21]] },
  { id: 'westterrace', name: 'WEST TERRACE', jp: '西テラス', rects: [[-21, -2, -5, 24]] },
];

export function zoneAt(x: number, y: number, z: number): Zone | null {
  if (y > 7) {
    for (const zn of ROOFTOPS) for (const [x0, z0, x1, z1] of zn.rects) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return zn;
  }
  if (y > 3) return SKYWALK;
  for (const zn of ZONES) {
    for (const [x0, z0, x1, z1] of zn.rects) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return zn;
  }
  return null;
}
