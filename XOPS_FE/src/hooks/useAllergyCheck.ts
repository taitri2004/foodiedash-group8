/**
 * FSS-40: useAllergyCheck
 * Chỉ cảnh báo khi món xung đột với hồ sơ người dùng:
 *   1. Dị ứng & hạn chế (preferences.allergies[]) → danger / warning
 *   2. Chế độ ăn (preferences.dietary[]) → warning
 *   3. Mục tiêu sức khỏe (preferences.health_goals[]) → warning
 * health_warning chỉ hiển thị khi văn bản chứa từ khóa khớp dị ứng / chế độ ăn / mục tiêu (bước 4).
 */

import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import type { Product } from '@/types/product';
import { ALLERGY_ID_KEYWORDS } from '@/constants/allergyIdKeywords';

export type AllergyLevel = 'safe' | 'warning' | 'danger';

export interface AllergyCheckResult {
  level: AllergyLevel;
  conflictIngredients: string[];
  warningMessage: string;
}

// ─── Normalize string for fuzzy matching ───────────────────────────────────
function normalize(str: string): string {
  return str.toLowerCase().trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return nb.includes(na) || na.includes(nb);
}

// ─── Dietary restriction rules ─────────────────────────────────────────────

/** Ingredients that are NOT vegetarian/vegan (dùng cho recipe + quét tên/mô tả món) */
const MEAT_INGREDIENTS = [
  'thịt bò', 'thịt heo', 'thịt lợn', 'thịt gà', 'thịt vịt', 'thịt dê',
  'bò', 'heo', 'lợn', 'gà', 'vịt', 'dê', 'trâu', 'cừu',
  'sườn', 'sườn cốt lết', 'ba chỉ', 'nạc heo', 'nạc dăm', 'bì heo', 'tai heo', 'phèo',
  'thịt xá xíu', 'xá xíu', 'thịt xông khói', 'bacon', 'thịt xay',
  'xúc xích', 'giăm bông', 'ham', 'lạp xưởng', 'chả lụa', 'chả giò', 'nem nướng', 'nem chua',
  'chà bông', 'patê', 'pate', 'giò thủ',
  'thịt nướng', 'bò viên', 'gân bò', 'nạm bò',
];

/** Ingredients that are NOT pescatarian-safe (seafood) */
const SEAFOOD_INGREDIENTS = [
  'tôm', 'cua', 'mực', 'nghêu', 'sò', 'ngêu', 'hải sản', 'cá',
  'cá hồi', 'cá ngừ', 'cá lóc', 'cá thu', 'sò điệp', 'tôm hùm',
  'tôm sú', 'surimi', 'chả cá', 'mắm', 'mắm tôm', 'mắm ruốc',
];

/** Dietary keywords that mean "vegetarian or vegan" */
const VEGETARIAN_KEYWORDS = ['chay', 'vegan', 'vegetarian', 'thuần chay', 'ăn chay'];

/** Dietary keywords that restrict red meat but allow seafood */
const PESCATARIAN_KEYWORDS = ['pescatarian', 'ăn cá', 'no meat'];

/** Dietary keywords for low-carb / keto users */
const LOW_CARB_KEYWORDS = ['keto', 'low carb', 'low-carb', 'ít carb'];

/** High-carb ingredients to warn low-carb users */
const HIGH_CARB_INGREDIENTS = [
  'cơm', 'bún', 'mì', 'bánh mì', 'khoai tây', 'bánh gạo', 'bột mì', 'mì gạo', 'đường', 'ngọt', 'trân châu'
];

/** Broad allergy dictionaries */
const ALLERGY_MAP: Record<string, string[]> = {
  'hải sản': SEAFOOD_INGREDIENTS,
  'sữa': ['phô mai', 'sữa bò', 'sữa đặc', 'sữa tươi', 'kem béo', 'bơ sữa', 'whipping cream', 'yogurt', 'sữa chua'],
  'trứng': ['trứng gà', 'trứng vịt', 'trứng cút', 'trứng muối', 'lòng đỏ', 'lòng trắng'],
  'đậu phộng': ['lạc', 'bơ đậu phộng'],
};

/** Health goal mapping warnings */
const HEALTH_GOAL_CONFLICT_MAP: Record<string, string[]> = {
  'giảm cân': ['đường', 'sữa đặc', 'trân châu', 'kem béo', 'phô mai', 'nước cốt dừa', 'chiên', 'rán'],
  'tiểu đường': ['đường', 'sữa đặc', 'nước đường', 'trân châu', 'ngọt'],
  'ít đường': ['đường', 'sữa đặc', 'nước đường', 'trân châu', 'ngọt'],
  'mỡ máu': ['chiên', 'rán', 'dầu mỡ', 'da gà', 'nội tạng', 'mỡ bò', 'mỡ heo', 'bơ béo'],
};

function isDietaryKeyword(diet: string, keywords: string[]): boolean {
  return keywords.some(k => fuzzyMatch(k, diet));
}

function containsIngredient(product: Product, ingredients: string[]): string[] {
  const found: string[] = [];
  if (!product.recipe) return found;
  for (const item of product.recipe) {
    for (const ing of ingredients) {
      if (fuzzyMatch(ing, item.name) && !found.includes(item.name)) {
        found.push(item.name);
      }
    }
  }
  return found;
}

/** Gộp tên món, mô tả, tag, nguyên liệu — nhiều món chỉ mô tả trong tên mà không nhập recipe đủ. */
function buildProductScanText(product: Product): string {
  const parts: string[] = [];
  if (product.name) parts.push(product.name);
  if (product.description) parts.push(product.description);
  if (product.tags?.length) parts.push(...product.tags);
  if (product.health_tags?.length) parts.push(...product.health_tags);
  if (product.recipe?.length) {
    parts.push(...product.recipe.map((r) => r.name).filter(Boolean) as string[]);
  }
  return parts.join(' ');
}

/** Khớp từ khóa cấm là chuỗi con trong toàn bộ văn bản đã gộp (normalize thường). */
function findKeywordsInText(fullText: string, keywords: string[]): string[] {
  const n = normalize(fullText);
  const hits: string[] = [];
  for (const kw of keywords) {
    const kn = normalize(kw);
    if (kn.length < 2) continue;
    if (n.includes(kn) && !hits.includes(kw)) hits.push(kw);
  }
  return hits;
}

/** Trứng / sữa — chỉ áp dụng khi user chọn vegan / thuần chay (id app: `vegan`). */
const VEGAN_EGG_DAIRY_KEYWORDS = [
  'trứng muối', 'trứng gà', 'trứng vịt', 'trứng cút', 'trứng ốp la', 'trứng chiên',
  'lòng đỏ', 'lòng trắng',
  'phô mai', 'sữa bò', 'sữa đặc', 'sữa tươi', 'kem béo', 'sữa chua', 'yogurt', 'bơ sữa',
];

/** Tập từ khóa dị ứng đã mở rộng (đồng bộ với bước kiểm tra recipe). */
function buildExpandedAllergyTokens(userAllergies: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const a of userAllergies) {
    const an = normalize(a);
    if (an.length >= 1) expanded.add(an);
    const byId = ALLERGY_ID_KEYWORDS[a] ?? ALLERGY_ID_KEYWORDS[an];
    if (byId) {
      byId.forEach((i) => expanded.add(normalize(i)));
    }
    for (const [broad, items] of Object.entries(ALLERGY_MAP)) {
      if (an.includes(broad) || broad.includes(an)) {
        items.forEach((i) => expanded.add(normalize(i)));
      }
    }
  }
  return expanded;
}

/** Cảnh báo chữa có từ khóa liên quan (chuỗi con, tối thiểu 2 ký tự sau normalize). */
function warningTextMentionsToken(warningNorm: string, token: string): boolean {
  const t = normalize(token);
  if (t.length < 2) return false;
  return warningNorm.includes(t);
}

/**
 * So khớp health_warning của món với hồ sơ: chỉ coi là liên quan khi có từ khớp có kiểm soát.
 * Trả về { allergyHits, dietaryHits, goalHits } để phân cấp danger vs warning.
 */
function matchHealthWarningToProfile(
  warningRaw: string,
  userAllergies: string[],
  userDietary: string[],
  userHealthGoals: string[]
): { allergyHits: string[]; dietaryHits: string[]; goalHits: string[] } {
  const warningNorm = normalize(warningRaw);

  const allergyHits: string[] = [];
  const expanded = buildExpandedAllergyTokens(userAllergies);
  for (const token of expanded) {
    if (warningTextMentionsToken(warningNorm, token) && !allergyHits.includes(token)) {
      allergyHits.push(token);
    }
  }

  const dietaryHits: string[] = [];
  const pushDiet = (w: string) => {
    if (!dietaryHits.includes(w)) dietaryHits.push(w);
  };

  for (const d of userDietary) {
    const isVeg = isDietaryKeyword(d, VEGETARIAN_KEYWORDS);
    const dn = normalize(d);
    const isVegan = dn.includes('vegan') || dn.includes('thuần chay');

    if (isVeg) {
      for (const ing of MEAT_INGREDIENTS) {
        if (warningTextMentionsToken(warningNorm, ing)) pushDiet(ing);
      }
      for (const ing of SEAFOOD_INGREDIENTS) {
        if (warningTextMentionsToken(warningNorm, ing)) pushDiet(ing);
      }
      if (isVegan) {
        for (const ing of ['trứng', 'phô mai', 'sữa bò', 'sữa đặc', 'sữa tươi', 'kem béo', 'sữa chua', 'yogurt']) {
          if (warningTextMentionsToken(warningNorm, ing)) pushDiet(ing);
        }
      }
    }

    const isPesc = isDietaryKeyword(d, PESCATARIAN_KEYWORDS);
    if (isPesc && !isVeg) {
      for (const ing of MEAT_INGREDIENTS) {
        if (warningTextMentionsToken(warningNorm, ing)) pushDiet(ing);
      }
    }

    if (isDietaryKeyword(d, LOW_CARB_KEYWORDS)) {
      for (const ing of HIGH_CARB_INGREDIENTS) {
        if (warningTextMentionsToken(warningNorm, ing)) pushDiet(ing);
      }
      for (const ing of ['phở', 'bột', 'trái cây']) {
        if (warningTextMentionsToken(warningNorm, ing)) pushDiet(ing);
      }
    }

    if (dn.includes('eat clean')) {
      for (const ing of ['chiên', 'rán', 'đường', 'mỡ', 'xúc xích', 'lạp xưởng', 'béo']) {
        if (warningTextMentionsToken(warningNorm, ing)) pushDiet(ing);
      }
    }
  }

  const goalHits: string[] = [];
  const pushGoal = (w: string) => {
    if (!goalHits.includes(w)) goalHits.push(w);
  };

  for (const goal of userHealthGoals) {
    const gn = normalize(goal);
    if (gn.length >= 3 && warningNorm.includes(gn)) {
      pushGoal(goal.trim());
    }
    for (const [key, forbiddenList] of Object.entries(HEALTH_GOAL_CONFLICT_MAP)) {
      if (gn.includes(key)) {
        for (const word of forbiddenList) {
          if (warningTextMentionsToken(warningNorm, word)) pushGoal(word);
        }
      }
    }
  }

  return { allergyHits, dietaryHits, goalHits };
}

// ─── Core check function ───────────────────────────────────────────────────

export function checkProductAllergies(
  product: Product | null | undefined,
  userAllergies: string[],
  userDietary: string[] = [],
  userHealthGoals: string[] = []
): AllergyCheckResult {
  if (!product) return { level: 'safe', conflictIngredients: [], warningMessage: '' };

  const hasProfileSignal =
    userAllergies.length > 0 || userDietary.length > 0 || userHealthGoals.length > 0;
  if (!hasProfileSignal) {
    return { level: 'safe', conflictIngredients: [], warningMessage: '' };
  }

  const scanTextForProduct = buildProductScanText(product);

  // ── Step 1: Check hard allergies (DANGER) ────────────────────────────────
  if (userAllergies.length > 0) {
    const conflictIngredients: string[] = [];

    const expandedAllergies = buildExpandedAllergyTokens(userAllergies);

    // Recipe ingredient match
    if (product.recipe?.length) {
      for (const ingredient of product.recipe) {
        for (const allergen of expandedAllergies) {
          if (fuzzyMatch(allergen, ingredient.name) && !conflictIngredients.includes(ingredient.name)) {
            conflictIngredients.push(ingredient.name);
          }
        }
      }
    }

    if (conflictIngredients.length > 0) {
      return {
        level: 'danger',
        conflictIngredients,
        warningMessage: `Món này chứa nguyên liệu bạn dị ứng: ${conflictIngredients.join(', ')}`,
      };
    }

    // health_tags match (WARNING)
    const tagConflicts: string[] = [];
    for (const tag of product.health_tags ?? []) {
      for (const allergen of expandedAllergies) {
        if (fuzzyMatch(allergen, tag) && !tagConflicts.includes(tag)) {
          tagConflicts.push(tag);
        }
      }
    }
    if (tagConflicts.length > 0) {
      return {
        level: 'warning',
        conflictIngredients: tagConflicts,
        warningMessage: `Món này có thể không phù hợp với hồ sơ sức khỏe của bạn`,
      };
    }
  }

  // ── Step 2: Check dietary restrictions (WARNING) ─────────────────────────
  if (userDietary.length > 0) {
    // 2a. Vegetarian / Vegan (profile lưu id `vegan` cho mục "Ăn chay")
    const isVegetarian = userDietary.some((d) => isDietaryKeyword(d, VEGETARIAN_KEYWORDS));
    const isVeganDiet = userDietary.some((d) => {
      const x = normalize(d);
      return x.includes('vegan') || x.includes('thuần chay');
    });

    if (isVegetarian) {
      const meatFromRecipe = containsIngredient(product, MEAT_INGREDIENTS);
      const meatFromText = findKeywordsInText(scanTextForProduct, MEAT_INGREDIENTS);
      const seafoodFromRecipe = containsIngredient(product, SEAFOOD_INGREDIENTS);
      const seafoodFromText = findKeywordsInText(scanTextForProduct, SEAFOOD_INGREDIENTS);
      const allConflicts = [
        ...new Set([...meatFromRecipe, ...meatFromText, ...seafoodFromRecipe, ...seafoodFromText]),
      ];

      if (allConflicts.length > 0) {
        return {
          level: 'warning',
          conflictIngredients: allConflicts,
          warningMessage: `Bạn đang ăn chay — món này chứa: ${allConflicts.join(', ')}`,
        };
      }

      if (isVeganDiet) {
        const eggFromRecipe = containsIngredient(product, VEGAN_EGG_DAIRY_KEYWORDS);
        const eggFromText = findKeywordsInText(scanTextForProduct, VEGAN_EGG_DAIRY_KEYWORDS);
        const eggHits = [...new Set([...eggFromRecipe, ...eggFromText])];
        if (eggHits.length > 0) {
          return {
            level: 'warning',
            conflictIngredients: eggHits,
            warningMessage: `Chế độ chay thuần (vegan) — món này chứa: ${eggHits.join(', ')}`,
          };
        }
      }

      const meatTags = (product.health_tags ?? []).filter(
        (t) =>
          MEAT_INGREDIENTS.some((m) => fuzzyMatch(m, t)) ||
          SEAFOOD_INGREDIENTS.some((s) => fuzzyMatch(s, t))
      );
      if (meatTags.length > 0) {
        return {
          level: 'warning',
          conflictIngredients: meatTags,
          warningMessage: `Bạn đang ăn chay — món này có thể chứa thịt hoặc hải sản`,
        };
      }
    }

    // 2b. Pescatarian (no red meat, fish ok)
    const isPescatarian = userDietary.some((d) => isDietaryKeyword(d, PESCATARIAN_KEYWORDS));
    if (isPescatarian && !isVegetarian) {
      const meatFromRecipe = containsIngredient(product, MEAT_INGREDIENTS);
      const meatFromText = findKeywordsInText(scanTextForProduct, MEAT_INGREDIENTS);
      const meatFound = [...new Set([...meatFromRecipe, ...meatFromText])];
      if (meatFound.length > 0) {
        return {
          level: 'warning',
          conflictIngredients: meatFound,
          warningMessage: `Bạn không ăn thịt đỏ — món này chứa: ${meatFound.join(', ')}`,
        };
      }
    }

    // 2c. Low-carb / Keto
    const isLowCarb = userDietary.some((d) => isDietaryKeyword(d, LOW_CARB_KEYWORDS));
    if (isLowCarb) {
      const carbFromRecipe = containsIngredient(product, HIGH_CARB_INGREDIENTS);
      const carbFromText = findKeywordsInText(scanTextForProduct, HIGH_CARB_INGREDIENTS);
      const carbFound = [...new Set([...carbFromRecipe, ...carbFromText])];
      if (carbFound.length > 0) {
        return {
          level: 'warning',
          conflictIngredients: carbFound,
          warningMessage: `Chế độ Low-carb/Keto — món này chứa nhiều tinh bột/đường: ${carbFound.join(', ')}`,
        };
      }
    }
  }

  // ── Step 3: Check health goals (WARNING) ─────────────────────────────────
  if (userHealthGoals.length > 0) {
    const goalConflicts: string[] = [];
    for (const goal of userHealthGoals) {
      for (const [key, forbiddenList] of Object.entries(HEALTH_GOAL_CONFLICT_MAP)) {
        if (normalize(goal).includes(key)) {
          const fromRecipe = containsIngredient(product, forbiddenList);
          const fromText = findKeywordsInText(scanTextForProduct, forbiddenList);
          [...new Set([...fromRecipe, ...fromText])].forEach((f) => {
            if (!goalConflicts.includes(f)) goalConflicts.push(f);
          });
        }
      }
    }

    if (goalConflicts.length > 0) {
      return {
        level: 'warning',
        conflictIngredients: goalConflicts,
        warningMessage: `Mục tiêu sức khỏe của bạn có thể bị ảnh hưởng bởi: ${goalConflicts.join(', ')}`,
      };
    }
  }

  // ── Step 4: health_warning — chỉ khi nội dung khớp từ khóa liên quan hồ sơ ──
  const hw = product.health_warning?.trim();
  if (hw) {
    const { allergyHits, dietaryHits, goalHits } = matchHealthWarningToProfile(
      hw,
      userAllergies,
      userDietary,
      userHealthGoals
    );

    if (allergyHits.length > 0) {
      return {
        level: 'danger',
        conflictIngredients: allergyHits,
        warningMessage: hw,
      };
    }

    const profileHintHits = [...dietaryHits, ...goalHits];
    if (profileHintHits.length > 0) {
      return {
        level: 'warning',
        conflictIngredients: profileHintHits,
        warningMessage: hw,
      };
    }
  }

  return { level: 'safe', conflictIngredients: [], warningMessage: '' };
}

// ─── Hook (reads from auth store automatically) ────────────────────────────

export function useAllergyCheck(product: Product | null | undefined): AllergyCheckResult {
  const user = useAuthStore((s) => s.user);
  const userAllergies: string[] = user?.preferences?.allergies ?? [];
  const userDietary: string[] = user?.preferences?.dietary ?? [];
  const userHealthGoals: string[] = user?.preferences?.health_goals ?? [];

  return useMemo(
    () => checkProductAllergies(product, userAllergies, userDietary, userHealthGoals),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product?._id, userAllergies.join(','), userDietary.join(','), userHealthGoals.join(',')]
  );
}
