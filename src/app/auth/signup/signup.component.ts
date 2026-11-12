import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonIcon, IonSpinner } from "@ionic/angular/standalone"; // Ionic components
import type { Role } from "../../core/models";

export interface SignupDetails {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: Role;
  acceptedTerms: boolean;
}

@Component({
  selector: "app-signup",
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonIcon, IonSpinner], // Ionic components
  templateUrl: "./signup.component.html",
  styleUrl: "./signup.component.css",
})
export class SignupComponent {
  @Input() busy = false;
  @Input() error = "";
  @Output() readonly submitSignup = new EventEmitter<SignupDetails>();
  @Output() readonly signIn = new EventEmitter<void>();
  @Output() readonly back = new EventEmitter<void>();

  name = "";
  email = "";
  password = "";
  confirmPassword = "";
  role: Role = "customer";
  acceptedTerms = false;
  showPassword = false;

  submit(): void {
    this.submitSignup.emit({
      name: this.name,
      email: this.email,
      password: this.password,
      confirmPassword: this.confirmPassword,
      role: this.role,
      acceptedTerms: this.acceptedTerms,
    });
  }
}