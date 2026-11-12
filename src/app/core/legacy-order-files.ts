import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

interface DownloadUrlRequest {
  orderId: string;
}

interface DownloadUrlResponse {
  url: string;
}

interface DeleteAssetRequest {
  orderId: string;
  publicId: string;
  resourceType: "image" | "raw";
}

const getLegacyDownloadUrl = httpsCallable<DownloadUrlRequest, DownloadUrlResponse>(
  functions,
  "getCloudinaryOrderFileUrl",
);
const deleteLegacyAsset = httpsCallable<DeleteAssetRequest, { deleted: boolean }>(
  functions,
  "deleteCloudinaryOrderFile",
);

export async function getLegacyOrderFileUrl(orderId: string): Promise<string> {
  const { data } = await getLegacyDownloadUrl({ orderId });
  return data.url;
}

export async function deleteLegacyOrderFile(
  orderId: string,
  publicId: string,
  resourceType: "image" | "raw",
): Promise<void> {
  await deleteLegacyAsset({ orderId, publicId, resourceType });
}
