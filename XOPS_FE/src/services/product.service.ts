import { apiClient } from "@/lib/api-client";
import type {
  Product,
  ProductListResponse,
  ProductFilters,
} from "@/types/product";

class ProductAPI {
  async getProducts(
    filters: ProductFilters = {},
  ): Promise<ProductListResponse> {
    const response = await apiClient.get("/products", { params: filters });
    return response.data;
  }

  async getCategories(): Promise<{ success: boolean; data: string[] }> {
    const response = await apiClient.get("/products/categories");
    return response.data;
  }

  async getProductById(
    id: string,
  ): Promise<{ success: boolean; data: Product }> {
    const response = await apiClient.get(`/products/${id}`);
    return response.data;
  }

  async createProduct(
    data: Partial<Product>,
  ): Promise<{ success: boolean; data: Product; message: string }> {
    const response = await apiClient.post("/products", data);
    return response.data;
  }

  async updateProduct(
    id: string,
    data: Partial<Product>,
  ): Promise<{ success: boolean; data: Product; message: string }> {
    const response = await apiClient.put(`/products/${id}`, data);
    return response.data;
  }

  async deleteProduct(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete(`/products/${id}`);
    return response.data;
  }

  /**
   * Upload ảnh lên server → Cloudinary → lưu metadata vào MongoDB.
   * Trả về { _id: string (MongoDB ObjectId), secure_url: string }
   * để có thể gán image field cho Product.
   */
  async uploadImage(file: File): Promise<{ _id: string; secure_url: string }> {
  // Bước 1: Lấy presigned URL từ BE
  const presignedRes = await apiClient.post("/files/presigned-url", {
    fileName: file.name,
    mimeType: file.type,
    ownerType: "product",
  });
  const { presignedUrl, key, cdnUrl } = presignedRes.data.data;

  // Bước 2: Upload thẳng lên S3 (không qua BE)
  await fetch(presignedUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  // Bước 3: Confirm để lưu metadata vào DB
  const confirmRes = await apiClient.post("/files/confirm-upload", {
    key,
    cdnUrl,
    ownerType: "product",
    bytes: file.size,
  });

  return confirmRes.data.data;
}





}

export default new ProductAPI();