import { S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'us-west-2',
});

export const S3_BUCKET_MEDIA = process.env.S3_BUCKET_MEDIA ?? 'foodiedash-media-490178243777';
export const CLOUDFRONT_DOMAIN = process.env.APP_ORIGIN ?? ''; // e.g. https://dxxxxx.cloudfront.net

export default s3Client;
