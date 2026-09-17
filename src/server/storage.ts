import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | undefined;
export function getStorage() {
  const { R2_ACCOUNT_ID, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if ((!R2_ACCOUNT_ID && !R2_ENDPOINT) || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials are not configured");
  }
  return client ??= new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT || "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}
function bucket() {
  if (!process.env.R2_BUCKET) throw new Error("R2_BUCKET is not configured");
  return process.env.R2_BUCKET;
}
// Call after the route verifies ownership and chooses a server-generated key.
export async function signUpload(key: string, contentType: string, expiresIn = 300) {
  return getSignedUrl(getStorage(), new PutObjectCommand({
    Bucket: bucket(), Key: key, ContentType: contentType,
  }), { expiresIn });
}
export async function signDownload(key: string, expiresIn = 300) {
  return getSignedUrl(getStorage(), new GetObjectCommand({
    Bucket: bucket(), Key: key,
  }), { expiresIn });
}
export async function deleteStoredObject(key: string) {
  await getStorage().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
