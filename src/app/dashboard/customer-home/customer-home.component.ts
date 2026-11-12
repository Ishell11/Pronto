import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonIcon } from "@ionic/angular/standalone";
import type { PrintOrder, PrintShop } from "../../core/models";
import { shopMapUrl as getShopMapUrl, statusClass as getStatusClass } from "../../core/order-ui";

@Component({
  selector: "app-customer-home",
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: "./customer-home.component.html",
  styleUrl: "./customer-home.component.css",
})
export class CustomerHomeComponent {
  @Input() profileName = "";
  @Input() search = "";
  @Input() latestOrder: PrintOrder | null = null;
  @Input() visibleShops: PrintShop[] = [];
  @Input() shops: PrintShop[] = [];
  @Input() locationMessage = "";
  @Input() locating = false;
  @Input() paypalBusyOrderId = "";
  @Input() customerLatitude: number | null = null;
  @Input() customerLongitude: number | null = null;
  paymentReference = "";

  @Output() readonly searchChange = new EventEmitter<string>();
  @Output() readonly findShops = new EventEmitter<void>();
  @Output() readonly showOrders = new EventEmitter<void>();
  @Output() readonly createOrder = new EventEmitter<void>();
  @Output() readonly editOrder = new EventEmitter<PrintOrder>();
  @Output() readonly openFile = new EventEmitter<PrintOrder>();
  @Output() readonly respondQuote = new EventEmitter<{ order: PrintOrder; accept: boolean }>();
  @Output() readonly openShopOrder = new EventEmitter<PrintShop>();
  @Output() readonly locate = new EventEmitter<void>();
  @Output() readonly submitPayment = new EventEmitter<{ order: PrintOrder; reference: string }>();
  @Output() readonly paypalCheckout = new EventEmitter<PrintOrder>();

  statusClass(status: string): string { return getStatusClass(status); }
  shopMapUrl(shop: PrintShop): string { return getShopMapUrl(shop); }
  shopForOrder(shopId: string): PrintShop | undefined { return this.shops.find((shop) => shop.id === shopId); }
}