import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { IonIcon } from "@ionic/angular/standalone";
import type { OrderStatus, PrintOrder } from "../../core/models";
import { statusClass as getStatusClass } from "../../core/order-ui";

@Component({
  selector: "app-shop-earnings",
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: "./shop-earnings.component.html",
  styleUrl: "./shop-earnings.component.css",
})
export class ShopEarningsComponent {
  @Input() orders: PrintOrder[] = [];

  selectedReceiptOrder: PrintOrder | null = null;

  get quotedOrders(): PrintOrder[] { 
    return this.orders.filter((order) => typeof order.quoteAmount === "number"); 
  }
  
  get completedQuoteTotal(): number { 
    return this.orders.filter((order) => order.status === "Completed").reduce((sum, order) => sum + (order.quoteAmount ?? 0), 0); 
  }
  
  countOrders(status: OrderStatus): number { 
    return this.orders.filter((order) => order.status === status).length; 
  }
  
  statusClass(status: OrderStatus): string { 
    return getStatusClass(status); 
  }

  openReceipt(order: PrintOrder): void {
    this.selectedReceiptOrder = order;
  }

  closeReceipt(): void {
    this.selectedReceiptOrder = null;
  }
}