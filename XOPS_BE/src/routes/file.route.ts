import { Router } from 'express';
import authenticate from '@/middlewares/authenticate';
import authorize from '@/middlewares/authorize';
import { Role } from '@/types/user.type';
import { uploadImage } from '@/config/multer';
import { uploadFileHandler, deleteFileHandler, getPresignedUrlHandler, confirmUploadHandler } from '@/controllers/file.controller';
const fileRoutes = Router();

/**
 * POST /api/files/upload
 * Chỉ Admin và Staff mới được upload ảnh.
 * Multer xử lý multipart/form-data trước khi vào controller.
 */
fileRoutes.post(
  '/upload',
  authenticate,
  authorize(Role.ADMIN, Role.STAFF, Role.CUSTOMER),
  uploadImage.single('file'),
  uploadFileHandler
);

/**
 * DELETE /api/files/:id
 * Chỉ Admin mới được xoá file.
 */
fileRoutes.delete('/:id', authenticate, authorize(Role.ADMIN), deleteFileHandler);

export default fileRoutes;

/**
 * POST /api/files/presigned-url
 * Bước 1: Lấy presigned URL để upload thẳng lên S3
 */
fileRoutes.post(
  '/presigned-url',
  authenticate,
  authorize(Role.ADMIN, Role.STAFF, Role.CUSTOMER),
  getPresignedUrlHandler
);

/**
 * POST /api/files/confirm-upload
 * Bước 2: Sau khi upload xong → xác nhận lưu metadata vào DB
 */
fileRoutes.post(
  '/confirm-upload',
  authenticate,
  authorize(Role.ADMIN, Role.STAFF, Role.CUSTOMER),
  confirmUploadHandler
);