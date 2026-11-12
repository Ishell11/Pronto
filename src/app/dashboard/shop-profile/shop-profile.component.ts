import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonIcon } from "@ionic/angular/standalone";
import type { Profile, PrintShop } from "../../core/models";

@Component({
  selector: "app-shop-profile",
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonIcon],
  templateUrl: "./shop-profile.component.html",
  styleUrl: "./shop-profile.component.css",
})
export class ShopProfileComponent {
  @Input() profile!: Profile;
  @Input() shop!: PrintShop;
  @Output() readonly saveProfile = new EventEmitter<{ name: string; shop: Partial<PrintShop> }>();
  @Output() readonly toggleOpen = new EventEmitter<void>();
  @Output() readonly signOut = new EventEmitter<void>();

  isEditing = false;
  editName = "";
  shopName = "";
  shopCity = "";
  shopAddress = "";
  shopServices = "";
  shopGcashAccountName = "";
  shopGcashNumber = "";
  error = "";

  startEditing(): void {
    this.isEditing = true;
    this.error = "";
    this.editName = this.profile.name;
    this.shopName = this.shop.name || "";
    this.shopCity = this.shop.city || "";
    this.shopAddress = this.shop.address || "";
    this.shopServices = this.shop.services || "";
    this.shopGcashAccountName = this.shop.gcashAccountName || "";
    this.shopGcashNumber = this.shop.gcashNumber || "";
  }

  cancelEditing(): void {
    this.isEditing = false;
    this.error = "";
  }

  submit(): void {
    if (!this.editName.trim() || !this.shopName.trim() || !this.shopCity.trim() || !this.shopAddress.trim() || !this.shopServices.trim()) {
      this.error = "Please complete all required fields.";
      return;
    }
    this.saveProfile.emit({
      name: this.editName.trim(),
      shop: {
        name: this.shopName.trim(),
        city: this.shopCity.trim(),
        address: this.shopAddress.trim(),
        services: this.shopServices.trim(),
        gcashAccountName: this.shopGcashAccountName.trim(),
        gcashNumber: this.shopGcashNumber.trim(),
      }
    });
    this.isEditing = false;
  }
}