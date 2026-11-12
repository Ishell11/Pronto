import type { OrderStatus, PrintOrder, PrintShop } from "./models";

export function statusClass(status: string): string {
  return `status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

export function orderNotificationText(order: PrintOrder): string {
  if (order.status === "Awaiting customer" && order.quoteAmount) {
    return `${order.shopName} sent a ₱${order.quoteAmount.toFixed(2)} quote for ${order.description}.`;
  }
  if (order.status === "Printing" && order.paymentVerifiedAt) {
    return `Your GCash payment was verified. ${order.description} is now printing.`;
  }
  return `${order.description} · ${order.status}`;
}

export function shopMapUrl(shop: PrintShop): string {
  const query = typeof shop.latitude === "number" && typeof shop.longitude === "number"
    ? `${shop.latitude},${shop.longitude}`
    : `${shop.address}, ${shop.city}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function distanceToShop(shop: PrintShop, latitude: number, longitude: number): number {
  if (typeof shop.latitude !== "number" || typeof shop.longitude !== "number") {
    return Number.POSITIVE_INFINITY;
  }
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(shop.latitude - latitude);
  const longitudeDelta = radians(shop.longitude - longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(shop.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function allowedShopStatusChanges(order: PrintOrder): OrderStatus[] {
  if (order.status === "Printing") return ["Ready for pickup", "Cancelled"];
  if (order.status === "Ready for pickup") return ["Completed", "Cancelled"];
  return [];
}
