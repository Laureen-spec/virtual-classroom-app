import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

const s3 = new S3Client({ region: process.env.AWS_REGION, credentials: {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
}});

export async function uploadFileToS3(localFilePath, destKey) {
  const fileStream = fs.createReadStream(localFilePath);
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: destKey,
    Body: fileStream
  };
  const command = new PutObjectCommand(params);
  await s3.send(command);
  // build public url (if bucket public or use presigned)
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${destKey}`;
}
