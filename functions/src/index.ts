import { randomUUID } from "node:crypto";
import Busboy from "busboy";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { getApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall, onRequest, type CallableRequest, type Request } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";

initializeApp();
setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

const apiKey = defineSecret("CLOUDINARY_API_KEY");
const apiSecret = defineSecret("CLOUDINARY_API_SECRET");
const paypalClientId = defineSecret("PAYPAL_CLIENT_ID");
const paypalClientSecret = defineSecret("PAYPAL_CLIENT_SECRET");
const cloudName = "pefbqwu7";
const paypalApiBaseUrl = "https://api-m.sandbox.paypal.com";
const validExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);
const maximumFileSize = 20 * 1024 * 1024;

interface OrderFileRequest {
  orderId: string;
}

interface DeleteOrderFileRequest {
  orderId: string;
  publicId: string;
  resourceType: "image" | "raw";
}

interface PayPalCheckoutRequest {
  orderId: string;
  appOrigin: string;
}

interface PayPalCaptureRequest {
  orderId: string;
}

interface PayPalApiObject {
  [key: string]: unknown;
}

function configureCloudinary(): void {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey.value(),
    api_secret: apiSecret.value(),
    secure: true,
  });
}

function isRecord(value: unknown): value is PayPalApiObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getPayPalAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${paypalClientId.value()}:${paypalClientSecret.value()}`).toString("base64");
  const response = await fetch(`${paypalApiBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || typeof payload["access_token"] !== "string") {
    console.error("PayPal OAuth token request failed:", response.status);
    throw new HttpsError("unavailable", "PayPal Sandbox is unavailable. Check the configured sandbox credentials.");
  }
  return payload["access_token"];
}

async function callPayPalApi(path: string, accessToken: string, options: {
  method?: "GET" | "POST";
  body?: PayPalApiObject;
  requestId?: string;
} = {}): Promise<PayPalApiObject> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;
  const response = await fetch(`${paypalApiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload)) {
    console.error("PayPal API request failed:", response.status, path);
    throw new HttpsError("unavailable", "PayPal Sandbox could not process the request. Please try again.");
  }
  return payload;
}

function getPayPalApprovalUrl(paypalOrder: PayPalApiObject): string {
  const links = paypalOrder["links"];
  if (!Array.isArray(links)) throw new HttpsError("unavailable", "PayPal did not return a checkout link.");
  const approval = links.find((link: unknown) =>
    isRecord(link) && (link["rel"] === "approve" || link["rel"] === "payer-action") && typeof link["href"] === "string");
  if (!isRecord(approval) || typeof approval["href"] !== "string") {
    throw new HttpsError("unavailable", "PayPal did not return a checkout link.");
  }
  const url = new URL(approval["href"]);
  if (url.protocol !== "https:" || url.hostname !== "www.sandbox.paypal.com") {
    throw new HttpsError("unavailable", "PayPal returned an unexpected checkout link.");
  }
  return url.toString();
}

function requireAuth(request: CallableRequest<unknown>): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return request.auth.uid;
}

async function isAdmin(uid: string, claims: Record<string, unknown>): Promise<boolean> {
  if (claims["admin"] === true) return true;
  const profile = await getFirestore(getApp()).doc(`users/${uid}`).get();
  return profile.data()?.["role"] === "admin";
}

function validateOrderId(orderId: unknown): asserts orderId is string {
  if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(orderId)) {
    throw new HttpsError("invalid-argument", "Invalid order ID.");
  }
}

interface ParsedUpload {
  orderId: string;
  shopId: string;
  fileName: string;
  buffer: Buffer;
}

function parseUpload(request: Request): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    let orderId = "";
    let shopId = "";
    let fileName = "";
    let fileBuffer: Buffer | null = null;
    let fileCount = 0;
    let fileTooLarge = false;
    let settled = false;
    const parser = Busboy({
      headers: request.headers,
      limits: { files: 1, fileSize: maximumFileSize },
    });
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    parser.on("field", (name, value) => {
      if (name === "orderId") orderId = value;
      if (name === "shopId") shopId = value;
    });
    parser.on("file", (name, stream, info) => {
      fileCount += 1;
      if (name !== "file" || fileCount > 1) {
        stream.resume();
        return;
      }
      fileName = info.filename ?? "";
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => { fileTooLarge = true; });
      stream.on("error", fail);
      stream.on("end", () => { fileBuffer = Buffer.concat(chunks); });
    });
    parser.on("filesLimit", () => fail(new HttpsError("invalid-argument", "Only one file can be uploaded per order.")));
    parser.on("error", (error: Error) => fail(new HttpsError("invalid-argument", "Invalid multipart upload.")));
    parser.on("finish", () => {
      if (settled) return;
      if (fileTooLarge) {
        fail(new HttpsError("invalid-argument", "File exceeds the 20 MB limit."));
      } else if (!fileBuffer || !fileName) {
        fail(new HttpsError("invalid-argument", "Select a file to upload."));
      } else {
        settled = true;
        resolve({ orderId, shopId, fileName, buffer: fileBuffer });
      }
    });
    parser.end(request.rawBody);
  });
}

function identifyFile(file: ParsedUpload): { resourceType: "image" | "raw" } {
  const extension = file.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!validExtensions.has(extension)) {
    throw new HttpsError("invalid-argument", "Only PDF, JPG, and PNG files are supported.");
  }
  const bytes = file.buffer;
  const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const valid = extension === "pdf" ? isPdf
    : extension === "png" ? isPng
      : (extension === "jpg" || extension === "jpeg") && isJpeg;
  if (!valid) throw new HttpsError("invalid-argument", "The file content does not match its file type.");
  return { resourceType: extension === "pdf" ? "raw" : "image" };
}

export const uploadCloudinaryOrderFile = onRequest(
  { secrets: [apiKey, apiSecret], cors: true, memory: "512MiB", timeoutSeconds: 120 },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({ error: "Use POST to upload an order file." });
      return;
    }
    try {
      const authorization = request.header("authorization") ?? "";
      const idToken = authorization.match(/^Bearer (.+)$/)?.[1];
      if (!idToken) {
        response.status(401).json({ error: "Sign in before uploading a file." });
        return;
      }
      const decodedToken = await getAuth(getApp()).verifyIdToken(idToken);
      const uid = decodedToken.uid;
      const upload = await parseUpload(request);
      validateOrderId(upload.orderId);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(upload.shopId)) {
        throw new HttpsError("invalid-argument", "Invalid shop ID.");
      }
      const { resourceType } = identifyFile(upload);
      const firestore = getFirestore(getApp());
      const [profile, order] = await Promise.all([
        firestore.doc(`users/${uid}`).get(),
        firestore.doc(`orders/${upload.orderId}`).get(),
      ]);
      if (profile.data()?.["role"] !== "customer" || !order.exists
        || order.data()?.["customerId"] !== uid
        || order.data()?.["shopId"] !== upload.shopId
        || order.data()?.["status"] !== "New request") {
        response.status(403).json({ error: "This order cannot accept an uploaded file." });
        return;
      }

      configureCloudinary();
      const publicId = `pronto/orders/${uid}/${upload.orderId}/asset-${randomUUID()}`;
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder: `pronto/orders/${uid}/${upload.orderId}`,
          public_id: publicId.split("/").pop(),
          resource_type: resourceType,
          type: "authenticated",
          overwrite: false,
        }, (error, uploaded) => {
          if (error) reject(error);
          else if (!uploaded) reject(new Error("Cloudinary returned no upload result."));
          else resolve(uploaded);
        });
        stream.end(upload.buffer);
      });
      if (result.public_id !== publicId || result.resource_type !== resourceType) {
        await cloudinary.uploader.destroy(result.public_id, {
          resource_type: result.resource_type,
          type: "authenticated",
          invalidate: true,
        });
        throw new Error("Cloudinary returned an unexpected asset.");
      }
      response.status(200).json({
        publicId: result.public_id,
        resourceType: result.resource_type,
        format: result.format,
        fileName: upload.fileName,
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        response.status(error.code === "invalid-argument" ? 400 : 403).json({ error: error.message });
        return;
      }
      console.error("Cloudinary order upload failed:", error);
      response.status(500).json({ error: "Cloudinary upload failed. Please try again." });
    }
  },
);

export const getCloudinaryOrderFileUrl = onCall(
  { secrets: [apiKey, apiSecret] },
  async (request: CallableRequest<OrderFileRequest>) => {
    const uid = requireAuth(request);
    const { orderId } = request.data ?? {};
    validateOrderId(orderId);
    const firestore = getFirestore(getApp());
    const orderSnapshot = await firestore.doc(`orders/${orderId}`).get();
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    const customerAccess = order["customerId"] === uid;
    const shopSnapshot = typeof order["shopId"] === "string"
      ? await firestore.doc(`shops/${order["shopId"]}`).get()
      : null;
    const shopAccess = shopSnapshot?.data()?.["ownerId"] === uid;
    const adminAccess = await isAdmin(uid, request.auth?.token ?? {});
    if (!customerAccess && !shopAccess && !adminAccess) {
      throw new HttpsError("permission-denied", "You cannot access this order file.");
    }

    const publicId = order["cloudinaryPublicId"];
    const resourceType = order["cloudinaryResourceType"];
    const format = order["cloudinaryFormat"];
    if (typeof publicId !== "string" || !publicId.startsWith(`pronto/orders/${order["customerId"]}/${orderId}/`)
      || (resourceType !== "image" && resourceType !== "raw")
      || typeof format !== "string") {
      throw new HttpsError("not-found", "No Cloudinary file is attached to this order.");
    }

    configureCloudinary();
    const url = cloudinary.utils.private_download_url(publicId, format, {
      resource_type: resourceType,
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 600,
      attachment: true,
    });
    return { url };
  },
);

export const deleteCloudinaryOrderFile = onCall(
  { secrets: [apiKey, apiSecret] },
  async (request: CallableRequest<DeleteOrderFileRequest>) => {
    const uid = requireAuth(request);
    const { orderId, publicId, resourceType } = request.data ?? {};
    validateOrderId(orderId);
    if (typeof publicId !== "string"
      || !publicId.startsWith(`pronto/orders/${uid}/${orderId}/`)
      || (resourceType !== "image" && resourceType !== "raw")) {
      throw new HttpsError("permission-denied", "You cannot delete this file.");
    }
    configureCloudinary();
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: "authenticated",
      invalidate: true,
    });
    if (result.result !== "ok" && result.result !== "not found") {
      throw new HttpsError("internal", "Cloudinary could not delete the uploaded file.");
    }
    return { deleted: result.result === "ok" };
  },
);

export const createPayPalSandboxCheckout = onCall(
  { secrets: [paypalClientId, paypalClientSecret] },
  async (request: CallableRequest<PayPalCheckoutRequest>) => {
    const uid = requireAuth(request);
    const { orderId, appOrigin } = request.data ?? {};
    validateOrderId(orderId);
    if (typeof appOrigin !== "string") throw new HttpsError("invalid-argument", "Invalid application origin.");
    let origin: URL;
    try {
      origin = new URL(appOrigin);
    } catch {
      throw new HttpsError("invalid-argument", "Invalid application origin.");
    }
    const allowedOrigins = new Set([
      "https://pronto-ce630.web.app",
      "https://pronto-ce630.firebaseapp.com",
      "http://localhost:8100",
      "http://localhost:4200",
      "http://127.0.0.1:8100",
      "http://127.0.0.1:4200",
    ]);
    if (origin.origin !== appOrigin || !allowedOrigins.has(origin.origin)) {
      throw new HttpsError("invalid-argument", "PayPal return URL is not allowed for this application.");
    }

    const firestore = getFirestore(getApp());
    const orderRef = firestore.doc(`orders/${orderId}`);
    const newRequestId = randomUUID();
    const reservation = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "Order not found.");
      const order = snapshot.data()!;
      if (order["customerId"] !== uid) throw new HttpsError("permission-denied", "This order does not belong to you.");
      if (order["status"] !== "Awaiting payment" || typeof order["quoteAmount"] !== "number" || order["quoteAmount"] <= 0) {
        throw new HttpsError("failed-precondition", "This order is not ready for payment.");
      }
      if (order["paymentReference"] || order["paymentVerifiedAt"]) {
        throw new HttpsError("failed-precondition", "A payment has already been submitted for this order.");
      }
      if (typeof order["paypalOrderId"] === "string" && typeof order["paypalRequestId"] === "string") {
        return { paypalOrderId: order["paypalOrderId"], requestId: order["paypalRequestId"] };
      }
      const requestId = typeof order["paypalRequestId"] === "string" ? order["paypalRequestId"] : newRequestId;
      transaction.update(orderRef, { paypalRequestId: requestId });
      return { paypalOrderId: null, requestId };
    });

    const accessToken = await getPayPalAccessToken();
    let paypalOrder: PayPalApiObject;
    if (reservation.paypalOrderId) {
      paypalOrder = await callPayPalApi(`/v2/checkout/orders/${encodeURIComponent(reservation.paypalOrderId)}`, accessToken);
      if (paypalOrder["status"] !== "CREATED" && paypalOrder["status"] !== "APPROVED") {
        throw new HttpsError("failed-precondition", "This PayPal checkout is no longer available. Create a new print request to try again.");
      }
    } else {
      const snapshot = await orderRef.get();
      const order = snapshot.data();
      if (!snapshot.exists || !order || order["customerId"] !== uid || order["status"] !== "Awaiting payment"
        || typeof order["quoteAmount"] !== "number" || order["quoteAmount"] <= 0) {
        throw new HttpsError("failed-precondition", "This order is no longer ready for payment.");
      }
      const returnUrl = new URL("/", origin.origin);
      returnUrl.searchParams.set("paypal", "return");
      returnUrl.searchParams.set("orderId", orderId);
      const cancelUrl = new URL("/", origin.origin);
      cancelUrl.searchParams.set("paypal", "cancel");
      cancelUrl.searchParams.set("orderId", orderId);
      paypalOrder = await callPayPalApi("/v2/checkout/orders", accessToken, {
        method: "POST",
        requestId: reservation.requestId,
        body: {
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: orderId,
            custom_id: uid,
            description: String(order["description"] ?? "PRONTO print request").slice(0, 127),
            amount: {
              currency_code: "PHP",
              value: order["quoteAmount"].toFixed(2),
            },
          }],
          application_context: {
            brand_name: "PRONTO",
            landing_page: "LOGIN",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: returnUrl.toString(),
            cancel_url: cancelUrl.toString(),
          },
        },
      });
    }

    const paypalOrderId = paypalOrder["id"];
    if (typeof paypalOrderId !== "string") throw new HttpsError("unavailable", "PayPal did not return an order ID.");
    const approvalUrl = getPayPalApprovalUrl(paypalOrder);
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "Order not found.");
      const order = snapshot.data()!;
      if (order["customerId"] !== uid || order["status"] !== "Awaiting payment"
        || order["paymentReference"] || order["paymentVerifiedAt"]) {
        throw new HttpsError("failed-precondition", "The order changed while PayPal checkout was starting.");
      }
      if (typeof order["paypalOrderId"] === "string" && order["paypalOrderId"] !== paypalOrderId) {
        throw new HttpsError("already-exists", "A different PayPal checkout is already linked to this order.");
      }
      transaction.update(orderRef, {
        paymentProvider: "paypal_sandbox",
        paypalOrderId,
        paypalStatus: String(paypalOrder["status"] ?? "CREATED"),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { approvalUrl };
  },
);

export const capturePayPalSandboxPayment = onCall(
  { secrets: [paypalClientId, paypalClientSecret] },
  async (request: CallableRequest<PayPalCaptureRequest>) => {
    const uid = requireAuth(request);
    const { orderId } = request.data ?? {};
    validateOrderId(orderId);
    const firestore = getFirestore(getApp());
    const orderRef = firestore.doc(`orders/${orderId}`);
    const snapshot = await orderRef.get();
    if (!snapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = snapshot.data()!;
    if (order["customerId"] !== uid) throw new HttpsError("permission-denied", "This order does not belong to you.");
    if (order["paymentProvider"] === "paypal_sandbox" && order["paymentVerifiedAt"]) {
      return { paid: true };
    }
    if (order["status"] !== "Awaiting payment" || order["paymentProvider"] !== "paypal_sandbox"
      || typeof order["paypalOrderId"] !== "string" || typeof order["quoteAmount"] !== "number"
      || order["paymentReference"]) {
      throw new HttpsError("failed-precondition", "No PayPal Sandbox checkout is pending for this order.");
    }

    const accessToken = await getPayPalAccessToken();
    let paypalOrder = await callPayPalApi(`/v2/checkout/orders/${encodeURIComponent(order["paypalOrderId"])}`, accessToken);
    if (paypalOrder["status"] !== "COMPLETED") {
      if (paypalOrder["status"] !== "APPROVED") {
        throw new HttpsError("failed-precondition", "PayPal has not approved this checkout yet.");
      }
      paypalOrder = await callPayPalApi(
        `/v2/checkout/orders/${encodeURIComponent(order["paypalOrderId"])}/capture`,
        accessToken,
        { method: "POST", body: {} },
      );
    }

    const purchaseUnits = paypalOrder["purchase_units"];
    const unit = Array.isArray(purchaseUnits) ? purchaseUnits.find((value: unknown) =>
      isRecord(value) && value["reference_id"] === orderId && value["custom_id"] === uid) : undefined;
    const payments = isRecord(unit) ? unit["payments"] : undefined;
    const captures = isRecord(payments) ? payments["captures"] : undefined;
    const capture = Array.isArray(captures) ? captures.find((value: unknown) => isRecord(value) && value["status"] === "COMPLETED") : undefined;
    const amount = isRecord(capture) ? capture["amount"] : undefined;
    if (!isRecord(capture) || typeof capture["id"] !== "string" || !isRecord(amount)
      || amount["currency_code"] !== "PHP" || amount["value"] !== order["quoteAmount"].toFixed(2)) {
      throw new HttpsError("failed-precondition", "PayPal's completed payment does not match this order's amount.");
    }

    const paidAt = new Date().toISOString();
    await firestore.runTransaction(async (transaction) => {
      const latest = await transaction.get(orderRef);
      if (!latest.exists) throw new HttpsError("not-found", "Order not found.");
      const current = latest.data()!;
      if (current["customerId"] !== uid || current["paypalOrderId"] !== order["paypalOrderId"]
        || current["status"] !== "Awaiting payment" || current["quoteAmount"] !== order["quoteAmount"]) {
        throw new HttpsError("failed-precondition", "The order changed while PayPal was confirming payment.");
      }
      if (current["paymentVerifiedAt"] && current["paymentProvider"] === "paypal_sandbox") return;
      if (current["paymentReference"]) throw new HttpsError("failed-precondition", "Another payment was already submitted for this order.");
      transaction.update(orderRef, {
        paymentProvider: "paypal_sandbox",
        paypalStatus: "COMPLETED",
        paypalCaptureId: capture["id"],
        paymentReference: capture["id"],
        paymentSubmittedAt: paidAt,
        paymentVerifiedAt: paidAt,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { paid: true, captureId: capture["id"] };
  },
);
