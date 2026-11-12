import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonIcon } from "@ionic/angular/standalone";
import type { OrderStatus, PrintOrder, PrintShop } from "../../core/models";
import { statusClass as getStatusClass } from "../../core/order-ui";

@Component({
  selector: "app-customer-orders",
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonIcon],
  templateUrl: "./customer-orders.component.html",
  styleUrl: "./customer-orders.component.css",
})
export class CustomerOrdersComponent {
  @Input() orders: PrintOrder[] = [];
  @Input() shops: PrintShop[] = [];
  @Input() paymentReferences: Record<string, string> = {};
  @Input() paypalBusyOrderId = "";
  @Output() readonly createOrder = new EventEmitter<void>();
  @Output() readonly editOrder = new EventEmitter<PrintOrder>();
  @Output() readonly openFile = new EventEmitter<PrintOrder>();
  @Output() readonly respondQuote = new EventEmitter<{ order: PrintOrder; accept: boolean }>();
  @Output() readonly submitPayment = new EventEmitter<{ order: PrintOrder; reference: string }>();
  @Output() readonly paypalCheckout = new EventEmitter<PrintOrder>();
  @Output() readonly deleteOrder = new EventEmitter<PrintOrder>();

  selectedReceiptOrder: PrintOrder | null = null;

  statusClass(status: OrderStatus): string { return getStatusClass(status); }
  shopForOrder(shopId: string): PrintShop | undefined { return this.shops.find((shop) => shop.id === shopId); }
  submitReference(order: PrintOrder): void { this.submitPayment.emit({ order, reference: this.paymentReferences[order.id] ?? "" }); }

  openReceipt(order: PrintOrder): void {
    this.selectedReceiptOrder = order;
  }

  closeReceipt(): void {
    this.selectedReceiptOrder = null;
  }
}