import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonIcon } from "@ionic/angular/standalone";
import type { Profile, PrintShop } from "../../core/models";

@Component({
  selector: "app-customer-profile",
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonIcon],
  templateUrl: "./customer-profile.component.html",
  styleUrl: "./customer-profile.component.css",
})
export class CustomerProfileComponent {
  @Input() profile!: Profile;
  @Input() isAdmin = false;
  @Input() currentShop: PrintShop | null = null;
  @Output() readonly saveProfile = new EventEmitter<{ name: string; shop?: Partial<PrintShop> }>();
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
    if (this.currentShop) {
      this.shopName = this.currentShop.name || "";
      this.shopCity = this.currentShop.city || "";
      this.shopAddress = this.currentShop.address || "";
      this.shopServices = this.currentShop.services || "";
      this.shopGcashAccountName = this.currentShop.gcashAccountName || "";
      this.shopGcashNumber = this.currentShop.gcashNumber || "";
    }
  }

  cancelEditing(): void {
    this.isEditing = false;
    this.error = "";
  }

  submit(): void {
    if (!this.editName.trim()) {
      this.error = "Name cannot be empty.";
      return;
    }
    
    const payload: { name: string; shop?: Partial<PrintShop> } = { name: this.editName.trim() };
    
    if (this.profile.role === "shop") {
      if (!this.shopName.trim() || !this.shopCity.trim() || !this.shopAddress.trim() || !this.shopServices.trim()) {
        this.error = "Please complete all shop details.";
        return;
      }
      payload.shop = {
        name: this.shopName.trim(),
        city: this.shopCity.trim(),
        address: this.shopAddress.trim(),
        services: this.shopServices.trim(),
        gcashAccountName: this.shopGcashAccountName.trim(),
        gcashNumber: this.shopGcashNumber.trim(),
      };
    }
    
    this.saveProfile.emit(payload);
    this.isEditing = false;
  }
}