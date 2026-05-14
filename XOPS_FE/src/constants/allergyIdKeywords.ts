/**
 * Đồng bộ với BE_FOA `healthFilter.ts` — `ALLERGY_OPTIONS` lưu id tiếng Anh (fish, shrimp).
 */
export const ALLERGY_ID_KEYWORDS: Record<string, string[]> = {
  beef: ['bò', 'thịt bò', 'bò viên', 'gân bò', 'nạm bò', 'ba chỉ bò'],
  pork: ['heo', 'lợn', 'thịt heo', 'sườn', 'ba chỉ', 'nạc heo', 'xúc xích', 'chả lụa', 'giò', 'nem'],
  chicken: ['gà', 'thịt gà', 'gà ta', 'cánh gà', 'đùi gà'],
  fish: ['cá', 'chả cá', 'cá hồi', 'cá ngừ', 'cá lóc', 'cá thu', 'cá basa', 'surimi', 'mắm cá', 'hải sản'],
  shrimp: ['tôm', 'tôm hùm', 'tôm sú', 'tôm khô', 'mắm tôm', 'hải sản'],
  crab: ['cua', 'ghẹ', 'càng cua'],
  squid: ['mực', 'mực ống'],
  shellfish: ['nghêu', 'sò', 'ốc', 'hến', 'sò điệp', 'hải sản'],
  peanuts: ['đậu phộng', 'lạc', 'bơ đậu phộng'],
  eggs: ['trứng', 'trứng gà', 'trứng vịt', 'trứng cút', 'trứng muối', 'lòng đỏ', 'lòng trắng'],
  dairy: ['sữa', 'phô mai', 'kem', 'sữa chua', 'yogurt', 'bơ sữa', 'sữa đặc'],
  soy: ['đậu nành', 'tương', 'tofu', 'đậu hũ'],
};
