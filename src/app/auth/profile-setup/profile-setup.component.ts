import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonIcon } from "@ionic/angular/standalone"; // Ionic components
import type { Role } from "../../core/models";

export interface ProfileDetails {
  name: string;
  role: Role;
}

@Component({
  selector: "app-profile-setup",
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonIcon], // Ionic components
  templateUrl: "./profile-setup.component.html",
  styleUrl: "./profile-setup.component.css",
})
export class ProfileSetupComponent implements OnChanges {
  @Input() busy = false;
  @Input() error = "";
  @Input() initialName = "";
  @Input() initialRole: Role = "customer";
  @Output() readonly submitProfile = new EventEmitter<ProfileDetails>();
  @Output() readonly refreshAccess = new EventEmitter<void>();

  name = "";
  role: Role = "customer";

  ngOnChanges(): void { this.name = this.initialName; this.role = this.initialRole; }
  submit(): void { this.submitProfile.emit({ name: this.name, role: this.role }); }
}