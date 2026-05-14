import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import path from 'path';
import s3Client, { S3_BUCKET_MEDIA, CLOUDFRONT_DOMAIN } from '@/config/s3';

/**
 * Generate presigned URL để client upload trực tiếp lên S3
 * Presigned URL có hiệu lực 5 phút
 */
export const generatePresignedUploadUrl = async ({
  originalName,
  mimeType,
  folder = 'uploads',
}: {
  originalName: string;
  mimeType: string;
  folder?: string;
}) => {
  const ext = path.extname(originalName).toLowerCase();
  const key = `${folder}/${randomUUID()}${ext}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_MEDIA,
    Key: key,
    ContentType: mimeType,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 phút

  // URL phục vụ ảnh qua CloudFront
  const cdnUrl = CLOUDFRONT_DOMAIN
    ? `${CLOUDFRONT_DOMAIN}/${key}`
    : `https://${S3_BUCKET_MEDIA}.s3.us-west-2.amazonaws.com/${key}`;

  return { presignedUrl, key, cdnUrl };
};

/**
 * Xoá object khỏi S3
 */
export const deleteS3Object = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET_MEDIA,
    Key: key,
  });
  return s3Client.send(command);
};
