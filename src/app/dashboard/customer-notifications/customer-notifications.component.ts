import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { IonIcon } from "@ionic/angular/standalone"; // Ionic components
import type { PrintOrder } from "../../core/models";
import { orderNotificationText } from "../../core/order-ui";

@Component({
  selector: "app-customer-notifications",
  standalone: true,
  imports: [CommonModule, IonIcon], // Ionic components
  templateUrl: "./customer-notifications.component.html",
  styleUrl: "./customer-notifications.component.css",
})
export class CustomerNotificationsComponent {
  @Input() orders: PrintOrder[] = [];
  @Output() readonly openOrders = new EventEmitter<void>();

  notificationText(order: PrintOrder): string { return orderNotificationText(order); }
}