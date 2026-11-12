import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { IonIcon } from "@ionic/angular/standalone";
import type { PrintShop } from "../../core/models";

@Component({
  selector: "app-shop-services",
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: "./shop-services.component.html",
  styleUrl: "./shop-services.component.css",
})
export class ShopServicesComponent {
  @Input() shop: PrintShop | null = null;
  @Output() readonly editShop = new EventEmitter<void>();
}