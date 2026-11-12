const apiKey = "AVtLRfS0ASgiskPmj0jM5z";
const maximumFileSize = 20 * 1024 * 1024;

export interface UploadedAsset {
  handle: string;
  url: string;
}

export async function uploadOrderFile(file: File, orderId: string): Promise<UploadedAsset> {
  if (!orderId.trim()) {
    throw new Error("Kailangan ng order ID bago mag-upload.");
  }
  await validateOrderFile(file);

  const { init } = await import("filestack-js");
  const client = init(apiKey);
  let result: unknown;
  try {
    result = await client.upload(
      file,
      { retry: 3, retryMaxTime: 15000, tags: { orderId } },
      { filename: file.name },
    );
  } catch (error) {
    if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
      throw new Error(
        "Hindi maabot ang Filestack upload. Sa Filestack Security, payagan ang localhost at pronto-ce630.web.app; tingnan din kung naka-enable ang upload at storage sa app settings.",
      );
    }
    throw error;
  }

  if (typeof result !== "object" || result === null
    || !("handle" in result) || typeof result.handle !== "string"
    || !("url" in result) || typeof result.url !== "string"
    || !result.url.startsWith("https://cdn.filestackcontent.com/")) {
    throw new Error("Hindi kumpleto o hindi valid ang Filestack upload response.");
  }

  return { handle: result.handle, url: result.url };
}

export async function validateOrderFile(file: File): Promise<void> {
  if (file.size > maximumFileSize) {
    throw new Error("Hanggang 20 MB lang ang file.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  const mimeByExtension: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  const expectedMimeType = extension ? mimeByExtension[extension] : undefined;
  if (!expectedMimeType || (file.type && file.type !== expectedMimeType)) {
    throw new Error("PDF, JPG, o PNG lang ang puwedeng i-upload.");
  }

  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = extension === "pdf"
    && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  const isPng = extension === "png"
    && bytes.length >= 8
    && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const isJpeg = (extension === "jpg" || extension === "jpeg")
    && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  if (!isPdf && !isPng && !isJpeg) {
    throw new Error("Hindi tugma ang laman ng file sa PDF, JPG, o PNG extension nito.");
  }
}
