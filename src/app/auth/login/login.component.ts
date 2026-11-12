import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonIcon, IonSpinner } from "@ionic/angular/standalone"; 

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonIcon, IonSpinner], 
  templateUrl: "./login.component.html",
  styleUrl: "./login.component.css",
})
export class LoginComponent {
  @Input() busy = false;
  @Input() error = "";
  @Input() rememberMe = true;
  @Output() readonly submitLogin = new EventEmitter<LoginCredentials>();
  @Output() readonly forgotPassword = new EventEmitter<void>();
  @Output() readonly createAccount = new EventEmitter<void>();
  @Output() readonly back = new EventEmitter<void>();

  email = "";
  password = "";
  showPassword = false;

  submit(): void {
    this.submitLogin.emit({
      email: this.email,
      password: this.password,
      rememberMe: this.rememberMe,
    });
  }
}