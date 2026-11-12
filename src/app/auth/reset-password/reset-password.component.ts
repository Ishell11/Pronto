import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonIcon, IonSpinner } from "@ionic/angular/standalone"; // Ionic components

@Component({
  selector: "app-reset-password",
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonIcon, IonSpinner], // Ionic components
  templateUrl: "./reset-password.component.html",
  styleUrl: "./reset-password.component.css",
})
export class ResetPasswordComponent {
  @Input() busy = false;
  @Input() error = "";
  @Input() notice = "";
  @Output() readonly submitEmail = new EventEmitter<string>();
  @Output() readonly backToSignIn = new EventEmitter<void>();
  @Output() readonly back = new EventEmitter<void>();

  email = "";
}