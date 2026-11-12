import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonIcon } from "@ionic/angular/standalone";
import type { OrderStatus, PrintOrder, PrintShop } from "../../core/models";
import { allowedShopStatusChanges, statusClass as getStatusClass } from "../../core/order-ui";

interface CalendarDay {
  date: Date;
  orders: PrintOrder[];
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

@Component({
  selector: "app-shop-home",
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonIcon],
  templateUrl: "./shop-home.component.html",
  styleUrl: "./shop-home.component.css",
})
export class ShopHomeComponent implements OnInit, OnDestroy {
  @Input() profileName = "";
  @Input() today = new Date();
  @Input() currentShop: PrintShop | null = null;
  @Input() orders: PrintOrder[] = [];
  @Input() activeOrders: PrintOrder[] = [];
  @Input() newRequestCount = 0;
  
  manilaHour = this.getManilaHour();
  calendarMonth = this.manilaCalendarDate(new Date(), 1);
  selectedCalendarDate = this.manilaCalendarDate(new Date());
  readonly weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  private clockTimer: number | undefined;

  @Output() readonly createShop = new EventEmitter<void>();
  @Output() readonly toggleOpen = new EventEmitter<void>();
  @Output() readonly showRequests = new EventEmitter<void>();
  @Output() readonly sendQuote = new EventEmitter<PrintOrder>();
  @Output() readonly declineRequest = new EventEmitter<PrintOrder>();
  @Output() readonly confirmPayment = new EventEmitter<PrintOrder>();
  @Output() readonly statusChange = new EventEmitter<{ order: PrintOrder; status: OrderStatus }>();

  ngOnInit(): void {
    this.clockTimer = window.setInterval(() => this.manilaHour = this.getManilaHour(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.clockTimer !== undefined) window.clearInterval(this.clockTimer);
  }

  get greeting(): string {
    if (this.manilaHour < 12) return "Good morning";
    if (this.manilaHour < 18) return "Good afternoon";
    return "Good evening";
  }

  get productionQueueOrders(): PrintOrder[] {
    return this.activeOrders.filter((order) => order.status !== "New request");
  }

  get readyForPickupCount(): number {
    return this.orders.filter(o => o.status === "Ready for pickup").length;
  }

  get calendarDays(): CalendarDay[] {
    const firstDay = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth(), 1 - this.calendarMonth.getDay());
    const today = this.manilaCalendarDate(new Date());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + index);
      return { 
        date, 
        orders: this.ordersForDate(date), 
        inCurrentMonth: date.getMonth() === this.calendarMonth.getMonth(), 
        isToday: this.sameDate(date, today), 
        isSelected: this.sameDate(date, this.selectedCalendarDate) 
      };
    });
  }

  get selectedPickupOrders(): PrintOrder[] { return this.ordersForDate(this.selectedCalendarDate); }

  changeCalendarMonth(offset: number): void {
    this.calendarMonth = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + offset, 1);
    this.selectedCalendarDate = new Date(this.calendarMonth);
  }

  selectCalendarDate(date: Date): void {
    this.selectedCalendarDate = date;
    this.calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  }

  countOrders(status: OrderStatus): number { return this.orders.filter((order) => order.status === status).length; }
  allowedStatusChanges(order: PrintOrder): OrderStatus[] { return allowedShopStatusChanges(order); }
  statusClass(status: string): string { return getStatusClass(status); }

  private ordersForDate(date: Date): PrintOrder[] {
    return this.orders.filter((order) => order.confirmedPickupAt && !["Completed", "Cancelled"].includes(order.status) && this.sameDate(this.manilaCalendarDate(new Date(order.confirmedPickupAt)), date))
      .sort((a, b) => new Date(a.confirmedPickupAt!).getTime() - new Date(b.confirmedPickupAt!).getTime());
  }

  private manilaCalendarDate(date: Date, day = this.getManilaDateParts(date).day): Date {
    const { year, month } = this.getManilaDateParts(date);
    return new Date(year, month - 1, day);
  }

  private getManilaDateParts(date: Date): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    return {
      year: Number(parts.find((part) => part.type === "year")?.value),
      month: Number(parts.find((part) => part.type === "month")?.value),
      day: Number(parts.find((part) => part.type === "day")?.value),
    };
  }

  private sameDate(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
  }

  private getManilaHour(): number {
    const hour = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date()).find((part) => part.type === "hour")?.value;
    return Number(hour);
  }
}