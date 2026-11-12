import { Component, EventEmitter, Output } from "@angular/core";
import { IonButton, IonIcon } from "@ionic/angular/standalone"; // Ionic components

@Component({
  selector: "app-welcome",
  standalone: true,
  imports: [IonButton, IonIcon], 
  templateUrl: "./welcome.component.html",
  styleUrl: "./welcome.component.css",
})
export class WelcomeComponent {
  @Output() readonly getStarted = new EventEmitter<void>();
  @Output() readonly signIn = new EventEmitter<void>();
}