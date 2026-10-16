import 'dotenv/config';
import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
const Bucket = process.env.S3_BUCKET!;
if (!Bucket || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)
  throw Error('Configure S3_BUCKET and credentials');
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
try {
  await client.send(new HeadBucketCommand({ Bucket }));
  console.log('Bucket exists:', Bucket);
} catch (e) {
  const status = (e as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode;
  if (status !== 404) throw e;
  await client.send(new CreateBucketCommand({ Bucket }));
  console.log('Private bucket created:', Bucket);
} finally {
  client.destroy();
}
