import { CommonModule } from "@angular/common";
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonIcon } from "@ionic/angular/standalone";
import type { PrintShop } from "../../core/models";
import { distanceToShop, shopMapUrl } from "../../core/order-ui";

declare const L: any;

@Component({
  selector: "app-customer-shops",
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: "./customer-shops.component.html",
  styleUrl: "./customer-shops.component.css",
})
export class CustomerShopsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild("mapContainer") mapContainer?: ElementRef<HTMLDivElement>;

  @Input() shops: PrintShop[] = [];
  @Input() search = "";
  @Input() locationMessage = "";
  @Input() locating = false;
  @Input() customerLatitude: number | null = null;
  @Input() customerLongitude: number | null = null;

  @Output() readonly searchChange = new EventEmitter<string>();
  @Output() readonly locate = new EventEmitter<void>();
  @Output() readonly createOrder = new EventEmitter<PrintShop>();

  showDropdown = false;
  private map: any = null;
  private pins: any = null;
  private searchTimer: any = null;

  get mappedShopCount(): number {
    return this.shops.filter((shop) => typeof shop.latitude === "number" && typeof shop.longitude === "number").length;
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    
    if (changes["shops"]) {
      this.drawPins(true); 
    }
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.map) { this.map.remove(); this.map = null; }
  }

  distanceLabel(shop: PrintShop): string | null {
    if (this.customerLatitude === null || this.customerLongitude === null) return null;
    const distance = distanceToShop(shop, this.customerLatitude, this.customerLongitude);
    return Number.isFinite(distance) ? `${distance.toFixed(1)} km away` : null;
  }

  mapUrl(shop: PrintShop): string { return shopMapUrl(shop); }

  hideDropdown(): void {
    // Mag-hintay ng 200ms bago itago para pumayag mag-click sa dropdown item
    setTimeout(() => this.showDropdown = false, 200);
  }

  private initMap(): void {
    if (!this.mapContainer || typeof L === "undefined" || this.map) return;
    const firstLocatedShop = this.shops.find((shop) => typeof shop.latitude === "number" && typeof shop.longitude === "number");
    const hasCustomerLocation = typeof this.customerLatitude === "number" && typeof this.customerLongitude === "number";
    const hasShopLocation = firstLocatedShop !== undefined;
    
    const center: [number, number] = hasCustomerLocation
      ? [this.customerLatitude!, this.customerLongitude!]
      : hasShopLocation
        ? [firstLocatedShop.latitude!, firstLocatedShop.longitude!]
        : [12.8797, 121.774];
        
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      scrollWheelZoom: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelDebounceTime: 80,
      wheelPxPerZoomLevel: 100,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      zoomAnimationThreshold: 4,
      inertia: true,
      inertiaDeceleration: 2000,
      inertiaMaxSpeed: 1500,
      easeLinearity: 0.2,
      keyboard: true,
      touchZoom: true,
      dragging: true,
    }).setView(center, hasCustomerLocation || hasShopLocation ? 13 : 6);
    
    L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
    }).addTo(this.map);
    
    this.pins = L.layerGroup().addTo(this.map);
    this.drawPins(true);
  }

  private drawPins(fitBounds = false): void {
    if (!this.map || !this.pins) return;
    this.pins.clearLayers();

    const bounds: [number, number][] = [];
    const hasCustomerLocation = typeof this.customerLatitude === "number" && typeof this.customerLongitude === "number";
    
    if (typeof this.customerLatitude === "number" && typeof this.customerLongitude === "number") {
      L.circleMarker([this.customerLatitude, this.customerLongitude], { radius: 7, color: "#ffffff", weight: 2, fillColor: "#2b7de9", fillOpacity: 1 })
        .bindPopup("Your location")
        .addTo(this.pins);
      bounds.push([this.customerLatitude, this.customerLongitude]);
    }

    const located = this.shops.filter((shop) => typeof shop.latitude === "number" && typeof shop.longitude === "number");
    
    for (const shop of located) {
      const popup = `
        <div style="font-family:'DM Sans',sans-serif;min-width:170px;">
          <strong style="display:block;color:#321a48;font-size:13px;margin-bottom:3px;">${this.escape(shop.name)}</strong>
          <span style="display:inline-flex;align-items:center;gap:5px;color:${shop.open ? "#16834f" : "#817889"};font-size:11px;font-weight:600;margin-bottom:4px;">
            <span style="width:7px;height:7px;border-radius:50%;background:${shop.open ? "#16834f" : "#a77717"};"></span>
            ${shop.open ? "Open" : "Closed"}
          </span><br>
          <span style="color:#817889;font-size:11px;">${this.escape(shop.city)}</span><br>
          <a href="${shopMapUrl(shop)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;color:#a32959;font-size:11px;font-weight:600;text-decoration:none;">Google Maps</a>
        </div>`;
        
      const markerColor = shop.open ? "#16834f" : "#817889";
      const statusColor = shop.open ? "#16834f" : "#a77717";
      
      const icon = L.divIcon({
        className: "shop-map-icon",
        html: `<svg class="shop-map-pin" viewBox="0 0 36 44"><path d="M18 1C8.6 1 1 8.6 1 18c0 11.6 17 25 17 25s17-13.4 17-25C35 8.6 27.4 1 18 1Z" fill="${markerColor}" stroke="#fff" stroke-width="2"/><circle cx="18" cy="17" r="8" fill="#fff"/><circle cx="18" cy="17" r="5" fill="${statusColor}"/></svg>`,
        iconSize: [36, 44],
        iconAnchor: [18, 42],
        popupAnchor: [0, -38],
      });

      L.marker([shop.latitude!, shop.longitude!], { icon, riseOnHover: true, keyboard: true })
        .bindPopup(popup)
        .bindTooltip(shop.name, {
          permanent: true,
          direction: 'right',
          className: 'custom-shop-tooltip',
          offset: [12, -10]
        })
        .addTo(this.pins);
        
      bounds.push([shop.latitude!, shop.longitude!]);
    }

    if (fitBounds && bounds.length > 0) {
      if (located.length === 1 && !hasCustomerLocation) {
        this.map.setView(bounds[0], 15, { animate: true });
      } else {
        this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true, duration: 0.5 });
      }
    }
  }

  private escape(value: string): string {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => {
      switch (ch) { case "&": return "&amp;"; case "<": return "&lt;"; case ">": return "&gt;"; case '"': return "&quot;"; case "'": return "&#39;"; default: return ch; }
    });
  }
}