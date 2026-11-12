export type Role = "customer" | "shop";
export type AccountRole = Role | "admin";

export type OrderStatus =
  | "New request"
  | "Awaiting customer"
  | "Awaiting payment"
  | "Printing"
  | "Ready for pickup"
  | "Completed"
  | "Cancelled";

export interface Profile {
  uid: string;
  name: string;
  email: string;
  role: AccountRole;
}

export interface PrintShop {
  id: string;
  ownerId: string;
  name: string;
  city: string;
  address: string;
  services: string;
  open: boolean;
  latitude?: number;
  longitude?: number;
  gcashAccountName?: string;
  gcashNumber?: string;
}

export interface PrintOrder {
  id: string;
  customerId: string;
  customerName: string;
  shopId: string;
  shopName: string;
  description: string;
  specs: string;
  quantity: number;
  fileName: string;
  filePath: string;
  status: OrderStatus;
  quoteAmount?: number | null;
  quoteNote?: string;
  createdAt: number;
  requestedPickupAt?: string;
  confirmedPickupAt?: string;
  paymentReference?: string;
  paymentSubmittedAt?: string;
  paymentVerifiedAt?: string;
  paymentProvider?: "paypal_sandbox";
  paypalOrderId?: string;
  paypalStatus?: string;
  paypalCaptureId?: string;
  filestackHandle?: string;
  filestackUrl?: string;
  cloudinaryPublicId?: string;
  cloudinaryResourceType?: "image" | "raw" | "";
  cloudinaryFormat?: string;
}
