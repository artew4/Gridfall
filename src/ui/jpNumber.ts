const JP_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** A number in kanji (up to 99): 三, 十二, 二十三. */
export function jpNumber(n: number): string {
  if (n <= 10) return JP_NUM[n];
  if (n < 20) return '十' + JP_NUM[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return JP_NUM[t] + '十' + (o ? JP_NUM[o] : '');
}
