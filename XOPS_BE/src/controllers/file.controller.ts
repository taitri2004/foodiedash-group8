import { Request, Response } from 'express';
import { catchErrors } from '@/utils/asyncHandler';
import { CREATED, OK } from '@/constants/http';
import { uploadAndSaveFile, removeFile } from '@/services/file.service';
import { FileOwnerType } from '@/types/file.type';
import appAssert from '@/utils/appAssert';
import { BAD_REQUEST } from '@/constants/http';
import { getPresignedUploadUrl, confirmS3Upload } from '@/services/file.service';
/**
 * POST /api/files/upload
 * Upload ảnh lên Cloudinary và lưu metadata vào MongoDB.
 * Yêu cầu: multipart/form-data với field "file"
 * Query param: ownerType (optional, default: "product")
 */
export const uploadFileHandler = catchErrors(async (req: Request, res: Response) => {
  appAssert(req.file, BAD_REQUEST, 'Thiếu file ảnh');

  const ownerType = (req.query.ownerType as FileOwnerType) ?? FileOwnerType.PRODUCT;

  let folder = 'food_order_app/products';
  let prefix = 'product';

  if (ownerType === FileOwnerType.REVIEW) {
    folder = 'food_order_app/reviews';
    prefix = 'review';
  }

  const fileDoc = await uploadAndSaveFile({
    file: req.file,
    ownerType,
    ownerId: (req as any).userId,
    folder,
    prefix,
  });

  return res.success(CREATED, {
    data: {
      _id: fileDoc._id,
      secure_url: fileDoc.secure_url,
      public_id: fileDoc.public_id,
      width: fileDoc.width,
      height: fileDoc.height,
      bytes: fileDoc.bytes,
    },
    message: 'Upload ảnh thành công',
  });
});

/**
 * DELETE /api/files/:id
 * Xoá file khỏi Cloudinary và MongoDB.
 * Chỉ Admin mới có quyền.
 */
export const deleteFileHandler = catchErrors(async (req: Request, res: Response) => {
  const { id } = req.params;
  await removeFile(id);
  return res.success(OK, { message: 'Xoá file thành công' });
});

/**
 * POST /api/files/presigned-url
 * Body: { fileName: string, mimeType: string, ownerType?: string }
 * Trả về: { presignedUrl, key, cdnUrl }
 * Client dùng presignedUrl để PUT file trực tiếp lên S3
 */
export const getPresignedUrlHandler = catchErrors(async (req: Request, res: Response) => {
  const { fileName, mimeType, ownerType = 'product' } = req.body;

  appAssert(fileName, BAD_REQUEST, 'Thiếu fileName');
  appAssert(mimeType, BAD_REQUEST, 'Thiếu mimeType');

  const result = await getPresignedUploadUrl({
    originalName: fileName,
    mimeType,
    ownerType,
    ownerId: (req as any).userId,
  });

  return res.success(OK, {
    data: result,
    message: 'Tạo presigned URL thành công',
  });
});

/**
 * POST /api/files/confirm-upload
 * Body: { key: string, cdnUrl: string, ownerType?: string, bytes?: number }
 * Gọi sau khi client upload xong lên S3 → lưu metadata vào DB
 * Trả về: file document với secure_url là CloudFront URL
 */
export const confirmUploadHandler = catchErrors(async (req: Request, res: Response) => {
  const { key, cdnUrl, ownerType = 'product', bytes } = req.body;

  appAssert(key, BAD_REQUEST, 'Thiếu key');
  appAssert(cdnUrl, BAD_REQUEST, 'Thiếu cdnUrl');

  const fileDoc = await confirmS3Upload({
    key,
    cdnUrl,
    ownerType,
    ownerId: (req as any).userId,
    bytes,
  });

  return res.success(CREATED, {
    data: {
      _id: fileDoc._id,
      secure_url: fileDoc.secure_url,
      public_id: fileDoc.public_id,
    },
    message: 'Xác nhận upload thành công',
  });
});