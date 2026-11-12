import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { IonIcon } from "@ionic/angular/standalone";
import type { OrderStatus, PrintOrder, PrintShop, Profile } from "../../core/models";
import { statusClass as getStatusClass } from "../../core/order-ui";

@Component({
  selector: "app-admin-home",
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: "./admin-home.component.html",
  styleUrl: "./admin-home.component.css",
})
export class AdminHomeComponent {
  @Input() today = new Date();
  @Input() shops: PrintShop[] = [];
  @Input() orders: PrintOrder[] = [];
  @Input() users: Profile[] = [];
  @Input() openShopCount = 0;
  @Input() needsAttentionCount = 0;

  @Output() readonly deleteAccount = new EventEmitter<Profile>();
  @Output() readonly toggleShop = new EventEmitter<PrintShop>();

  statusClass(status: OrderStatus): string { return getStatusClass(status); }
}