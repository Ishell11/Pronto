import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonIcon } from "@ionic/angular/standalone"; // Inalis si IonButton
import type { OrderStatus, PrintOrder } from "../../core/models";
import { allowedShopStatusChanges, statusClass as getStatusClass } from "../../core/order-ui";

@Component({
  selector: "app-shop-requests",
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon], // Inalis si IonButton
  templateUrl: "./shop-requests.component.html",
  styleUrl: "./shop-requests.component.css",
})
export class ShopRequestsComponent {
  @Input() orders: PrintOrder[] = [];
  @Output() readonly sendQuote = new EventEmitter<PrintOrder>();
  @Output() readonly declineRequest = new EventEmitter<PrintOrder>();
  @Output() readonly confirmPayment = new EventEmitter<PrintOrder>();
  @Output() readonly openFile = new EventEmitter<PrintOrder>();
  @Output() readonly statusChange = new EventEmitter<{ order: PrintOrder; status: OrderStatus }>();

  statusClass(status: OrderStatus): string { return getStatusClass(status); }
  allowedStatusChanges(order: PrintOrder): OrderStatus[] { return allowedShopStatusChanges(order); }
}