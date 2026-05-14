/**
 * Shared product constants — Single source of truth.
 * Dùng chung giữa Admin và Customer để tránh mismatch với database.
 */

export const CATEGORIES = [
  "Món chính",
  "Khai vị",
  "Đồ uống",
  "Tráng miệng",
  "Đồ ăn nhanh",
  "Salad",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Category list kèm nhãn hiển thị cho Customer filter */
export const CUSTOMER_CATEGORY_FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "Món chính", label: "Món chính" },
  { id: "Khai vị", label: "Khai vị" },
  { id: "Đồ uống", label: "Đồ uống" },
  { id: "Tráng miệng", label: "Tráng miệng" },
  { id: "Đồ ăn nhanh", label: "Đồ ăn nhanh" },
  { id: "Salad", label: "Salad" },
] as const;

/** Price range presets (đơn vị: VNĐ) */
export const PRICE_STEPS = [
  { label: "Dưới 50.000đ", max: 50_000 },
  { label: "50.000 – 100.000đ", min: 50_000, max: 100_000 },
  { label: "100.000 – 200.000đ", min: 100_000, max: 200_000 },
  { label: "Trên 200.000đ", min: 200_000 },
] as const;

/** Health tag options dùng chung */
export const HEALTH_TAG_OPTIONS = [
  {
    id: "vegan",
    label: "Ăn chay",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  {
    id: "keto",
    label: "Keto",
    color: "bg-purple-100 text-purple-700 border-purple-200",
  },
  {
    id: "eat_clean",
    label: "Eat Clean",
    color: "bg-blue-100 text-blue-700 border-blue-200",
  },
  {
    id: "low_carb",
    label: "Low Carb",
    color: "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
  {
    id: "gluten_free",
    label: "Không Gluten",
    color: "bg-orange-100 text-orange-700 border-orange-200",
  },
] as const;
