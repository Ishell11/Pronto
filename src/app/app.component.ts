import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonApp, IonButton, IonIcon } from "@ionic/angular/standalone";
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword,
  getIdTokenResult, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword,
  signOut, setPersistence, updateProfile, type User,
} from "firebase/auth";
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp,
  setDoc, updateDoc, where, type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref } from "firebase/storage";
import { auth, db, functions, storage } from "./core/firebase";
import { deleteLegacyOrderFile, getLegacyOrderFileUrl } from "./core/legacy-order-files";
import { uploadOrderFile, validateOrderFile } from "./core/filestack";
import { distanceToShop, orderNotificationText } from "./core/order-ui";
import type { AccountRole, OrderStatus, PrintOrder, PrintShop, Profile, Role } from "./core/models";
import { SplashComponent } from "./auth/splash/splash.component";
import { WelcomeComponent } from "./auth/welcome/welcome.component";
import { LoginComponent, type LoginCredentials } from "./auth/login/login.component";
import { SignupComponent, type SignupDetails } from "./auth/signup/signup.component";
import { ResetPasswordComponent } from "./auth/reset-password/reset-password.component";
import { ProfileSetupComponent, type ProfileDetails } from "./auth/profile-setup/profile-setup.component";
import { CustomerHomeComponent } from "./dashboard/customer-home/customer-home.component";
import { CustomerShopsComponent } from "./dashboard/customer-shops/customer-shops.component";
import { CustomerOrdersComponent } from "./dashboard/customer-orders/customer-orders.component";
import { CustomerNotificationsComponent } from "./dashboard/customer-notifications/customer-notifications.component";
import { CustomerProfileComponent } from "./dashboard/customer-profile/customer-profile.component";
import { ShopHomeComponent } from "./dashboard/shop-home/shop-home.component";
import { ShopRequestsComponent } from "./dashboard/shop-requests/shop-requests.component";
import { ShopServicesComponent } from "./dashboard/shop-services/shop-services.component";
import { ShopEarningsComponent } from "./dashboard/shop-earnings/shop-earnings.component";
import { ShopProfileComponent } from "./dashboard/shop-profile/shop-profile.component";
import { AdminHomeComponent } from "./dashboard/admin-home/admin-home.component";

type AuthPage = "welcome" | "login" | "signup" | "reset";
type CustomerPage = "Home" | "Find Shops" | "My Orders" | "Notifications" | "Profile";
type ShopPage = "Dashboard" | "Requests" | "Services" | "Earnings" | "Shop Profile";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonApp, IonButton, IonIcon,
    SplashComponent, WelcomeComponent, LoginComponent, SignupComponent, ResetPasswordComponent,
    ProfileSetupComponent, CustomerHomeComponent, CustomerShopsComponent, CustomerOrdersComponent,
    CustomerNotificationsComponent, CustomerProfileComponent, ShopHomeComponent, ShopRequestsComponent,
    ShopServicesComponent, ShopEarningsComponent, ShopProfileComponent, AdminHomeComponent,
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild("customerProfileComp") customerProfileComp?: CustomerProfileComponent;
  @ViewChild("shopProfileComp") shopProfileComp?: ShopProfileComponent;

  readonly statuses: OrderStatus[] = [
    "New request", "Awaiting customer", "Awaiting payment", "Printing",
    "Ready for pickup", "Completed", "Cancelled",
  ];

  authPage: AuthPage = "welcome";
  authUser: User | null = null;
  profile: Profile | null = null;
  isAdmin = false;
  loading = true;
  showSplash = true;
  busy = false;
  rememberMe = true;
  acceptedTerms = false;
  role: Role = "customer";
  name = "";
  email = "";
  password = "";
  confirmPassword = "";
  error = "";
  notice = "";
  customerPage: CustomerPage = "Home";
  adminPage = false;
  shopPage: ShopPage = "Dashboard";
  shops: PrintShop[] = [];
  orders: PrintOrder[] = [];
  users: Profile[] = [];
  search = "";
  currentShop: PrintShop | null = null;
  modal: "order" | "shop" | "quote" | null = null;
  quoteOrder: PrintOrder | null = null;
  quoteAmount = 0;
  quoteNote = "";
  confirmedPickupAt = "";
  paymentReferences: Record<string, string> = {};
  notificationsOpen = false;
  readonly today = new Date();
  editingOrder: PrintOrder | null = null;
  orderShopId = "";
  requestedPickupAt = "";
  orderDescription = "";
  orderSpecs = "";
  orderQuantity = 1;
  orderFile: File | null = null;
  shopName = "";
  shopCity = "";
  shopAddress = "";
  shopServices = "";
  shopLatitude: number | null = null;
  shopLongitude: number | null = null;
  shopGcashAccountName = "";
  shopGcashNumber = "";
  customerLatitude: number | null = null;
  customerLongitude: number | null = null;
  locationMessage = "";
  locating = false;
  paypalBusyOrderId = "";
  private unsubscribers: Unsubscribe[] = [];
  private authUnsubscribe: Unsubscribe | null = null;
  private splashTimer: number | undefined;
  private signupInProgress = false;

  get isShopAccount(): boolean { return this.profile?.role === "shop"; }
  get page(): CustomerPage | ShopPage | "Overview" { return this.adminPage ? "Overview" : this.isShopAccount ? this.shopPage : this.customerPage; }
  get visibleShops(): PrintShop[] {
    const term = this.search.trim().toLowerCase();
    return this.shops.filter((shop) => !term || `${shop.name} ${shop.city} ${shop.address} ${shop.services}`.toLowerCase().includes(term));
  }
  get activeOrders(): PrintOrder[] { return this.orders.filter((order) => !["Completed", "Cancelled"].includes(order.status)); }
  get newRequestCount(): number { return this.orders.filter((order) => order.status === "New request").length; }
  get openShopCount(): number { return this.shops.filter((shop) => shop.open).length; }
  get latestOrder(): PrintOrder | undefined { return this.activeOrders[0] ?? this.orders[0]; }
  get openShops(): PrintShop[] { return this.visibleShops.filter((shop) => shop.open); }
  get orderShops(): PrintShop[] { return this.shops.filter((shop) => shop.open || shop.id === this.editingOrder?.shopId); }
  get shopsSortedByDistance(): PrintShop[] {
    if (this.customerLatitude === null || this.customerLongitude === null) return this.visibleShops;
    return [...this.visibleShops].sort((a, b) => this.distanceToShop(a) - this.distanceToShop(b));
  }
  get notificationOrders(): PrintOrder[] {
    if (this.isAdmin && this.adminPage) return this.orders;
    if (this.isShopAccount) {
      return this.orders.filter((order) => order.status === "New request" || (order.status === "Awaiting payment" && Boolean(order.paymentSubmittedAt)));
    }
    return this.orders.filter((order) => order.status !== "New request" && !(order.status === "Awaiting payment" && Boolean(order.paymentSubmittedAt)));
  }
  get minPickupDateTime(): string { return this.toLocalDateTime(new Date().toISOString()); }

  ngOnInit(): void {
    this.splashTimer = window.setTimeout(() => this.showSplash = false, 1700);
    this.authUnsubscribe = onAuthStateChanged(auth, (user) => {
      this.authUser = user;
      if (user && this.signupInProgress) return;
      this.error = "";
      this.notice = "";
      this.profile = null;
      this.isAdmin = false;
      this.adminPage = false;
      this.loading = true;
      if (!user) {
        this.clearDataListeners();
        this.loading = false;
        return;
      }
      void this.loadProfile(user);
    });
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
    this.clearDataListeners();
    if (this.splashTimer !== undefined) window.clearTimeout(this.splashTimer);
  }

  async submitAuth(): Promise<void> {
    this.error = "";
    this.notice = "";
    if (!this.email.trim()) { this.error = "Ilagay ang email address mo."; return; }
    if (this.authPage === "signup") {
      if (this.password.length < 6) { this.error = "Gumamit ng password na hindi bababa sa 6 na character."; return; }
      if (this.password !== this.confirmPassword) { this.error = "Hindi magkatugma ang mga password."; return; }
      if (!this.acceptedTerms) { this.error = "Kailangan mong sumang-ayon sa Terms at Privacy Policy."; return; }
      if (!this.name.trim()) { this.error = "Ilagay ang buong pangalan mo."; return; }
    }
    this.busy = true;
    const isSignup = this.authPage === "signup";
    let createdUser: User | null = null;
    if (isSignup) {
      this.signupInProgress = true;
      this.loading = true;
    }
    try {
      if (this.authPage === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, this.email.trim(), this.password);
        createdUser = credential.user;
        await updateProfile(credential.user, { displayName: this.name.trim() });
        const profile: Profile = {
          uid: credential.user.uid,
          name: this.name.trim(),
          email: credential.user.email ?? this.email.trim(),
          role: this.role,
        };
        await setDoc(doc(db, "users", credential.user.uid), { ...profile, createdAt: serverTimestamp() });
        this.profile = profile;
        this.error = "";
        this.notice = "";
        this.attachDataListeners();
        this.signupInProgress = false;
        this.loading = false;
      } else if (this.authPage === "login") {
        await setPersistence(auth, this.rememberMe ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, this.email.trim(), this.password);
      } else if (this.authPage === "reset") {
        await sendPasswordResetEmail(auth, this.email.trim());
        this.notice = "Naipadala na ang password reset link. Tingnan ang inbox mo.";
      }
    } catch (error) {
      this.error = createdUser
        ? `Na-create ang account, pero hindi nakumpleto ang profile. Maaari mong subukang tapusin ito sa profile setup. ${this.firebaseError(error, "pag-save ng profile")}`
        : this.firebaseError(error);
      if (createdUser) {
        this.authUser = createdUser;
        this.signupInProgress = false;
        await this.loadProfile(createdUser);
      }
    } finally {
      this.signupInProgress = false;
      this.busy = false;
      if (isSignup) this.loading = false;
    }
  }

  useLogin(credentials: LoginCredentials): void { this.email = credentials.email; this.password = credentials.password; this.rememberMe = credentials.rememberMe; this.authPage = "login"; void this.submitAuth(); }
  useSignup(details: SignupDetails): void { this.name = details.name; this.email = details.email; this.password = details.password; this.confirmPassword = details.confirmPassword; this.role = details.role; this.acceptedTerms = details.acceptedTerms; this.authPage = "signup"; void this.submitAuth(); }
  useResetEmail(email: string): void { this.email = email; this.authPage = "reset"; void this.submitAuth(); }
  setAuthPage(page: AuthPage): void { this.authPage = page; this.error = ""; this.notice = ""; }
  navigateToCustomerPage(page: CustomerPage): void { this.customerPage = page; this.error = ""; this.notice = ""; }
  navigateToShopPage(page: ShopPage): void { this.shopPage = page; this.error = ""; this.notice = ""; }
  setAdminPage(show: boolean): void { this.adminPage = show; this.error = ""; this.notice = ""; }
  openNotifications(): void {
    this.notificationsOpen = false;
    if (this.isShopAccount) this.navigateToShopPage("Requests");
    else this.navigateToCustomerPage("Notifications");
  }

  async signOut(): Promise<void> { await signOut(auth); this.authPage = "welcome"; this.clearDataListeners(); }

  async loadProfile(user: User): Promise<void> {
    try {
      const [snapshot, token] = await Promise.all([getDoc(doc(db, "users", user.uid)), getIdTokenResult(user, true)]);
      const hasAdminClaim = token.claims["admin"] === true;
      if (snapshot.exists()) {
        const data = snapshot.data();
        const role: AccountRole | null = hasAdminClaim ? "admin" : this.accountRole(data["role"]);
        if (!role) throw new Error("Hindi suportado ang role ng account na ito. Makipag-ugnayan sa administrator.");
        this.profile = { uid: user.uid, name: this.stringValue(data["name"]) || this.stringValue(data["fullName"]) || user.displayName || user.email || "", email: this.stringValue(data["email"]) || user.email || "", role };
        this.isAdmin = hasAdminClaim || role === "admin";
        this.attachDataListeners();
        if (role === "customer") await this.handlePayPalReturn(user);
      } else {
        this.isAdmin = hasAdminClaim;
        this.profile = hasAdminClaim ? { uid: user.uid, name: user.displayName || user.email || "Administrator", email: user.email || "", role: "admin" } : null;
        if (!hasAdminClaim) this.name = user.displayName ?? ""; else this.attachDataListeners();
      }
      this.adminPage = this.isAdmin;
    } catch (error) { this.error = this.firebaseError(error, "pagbasa sa profile"); } finally { this.loading = false; }
  }

  async completeProfile(): Promise<void> {
    if (!this.authUser || !this.name.trim()) { this.error = "Ilagay ang buong pangalan mo."; return; }
    this.busy = true; this.error = "";
    const profile: Profile = { uid: this.authUser.uid, name: this.name.trim(), email: this.authUser.email ?? "", role: this.role };
    try {
      await setDoc(doc(db, "users", this.authUser.uid), { ...profile, createdAt: serverTimestamp() });
      this.profile = profile;
      this.error = "";
      this.attachDataListeners();
    } catch (error) { this.error = this.firebaseError(error); } finally { this.busy = false; }
  }

  useProfileDetails(details: ProfileDetails): void { this.name = details.name; this.role = details.role; void this.completeProfile(); }
  refreshProfileAccess(): void { if (!this.authUser || this.loading) return; this.error = ""; this.loading = true; void this.loadProfile(this.authUser); }

  async saveProfileChanges(event: { name: string; shop?: Partial<PrintShop> }): Promise<void> {
    if (!this.authUser || !this.profile) return;
    if (!event.name.trim()) { this.error = "Name cannot be empty."; return; }
    this.busy = true;
    this.error = "";
    try {
      await updateDoc(doc(db, "users", this.authUser.uid), { name: event.name, updatedAt: serverTimestamp() });
      this.profile = { ...this.profile, name: event.name };
      
      if (event.shop && this.profile.role === "shop") {
        await setDoc(doc(db, "shops", this.authUser.uid), {
          ...event.shop,
          ownerId: this.authUser.uid,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      this.notice = "Profile updated successfully!";
      setTimeout(() => this.notice = "", 3000);
    } catch (error) {
      this.error = this.firebaseError(error, "updating profile");
    } finally {
      this.busy = false;
    }
  }

  async adminDeleteUser(targetUser: Profile): Promise<void> {
    if (!this.isAdmin || targetUser.uid === this.authUser?.uid) return;
    if (!window.confirm(`Are you sure you want to delete ${targetUser.name}'s account? This action cannot be undone.`)) return;
    this.busy = true;
    try {
      await deleteDoc(doc(db, "users", targetUser.uid));
      if (targetUser.role === "shop") {
        await deleteDoc(doc(db, "shops", targetUser.uid));
      }
      this.notice = `${targetUser.name}'s account has been removed.`;
      setTimeout(() => this.notice = "", 3000);
    } catch (error) {
      this.error = this.firebaseError(error, "deleting user account");
    } finally {
      this.busy = false;
    }
  }

  async adminToggleShop(shop: PrintShop): Promise<void> {
    if (!this.isAdmin) return;
    try {
      await updateDoc(doc(db, "shops", shop.id), { open: !shop.open, updatedAt: serverTimestamp() });
    } catch (error) {
      this.error = this.firebaseError(error, "updating shop status");
    }
  }

  attachDataListeners(): void {
    this.clearDataListeners();
    this.unsubscribers.push(onSnapshot(collection(db, "shops"), (snapshot) => { this.shops = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PrintShop); }, (error) => this.error = this.firebaseError(error, "pagbasa ng listahan ng mga shop")));
    
    if (this.isAdmin) {
      this.unsubscribers.push(onSnapshot(collection(db, "orders"), (snapshot) => this.orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PrintOrder).sort((a, b) => b.createdAt - a.createdAt), (error) => this.error = this.firebaseError(error)));
      this.unsubscribers.push(onSnapshot(collection(db, "users"), (snapshot) => this.users = snapshot.docs.map((item) => ({ ...item.data(), uid: item.id }) as Profile), (error) => this.error = this.firebaseError(error, "fetching users")));
    } else if (this.isShopAccount && this.authUser) {
      const uid = this.authUser.uid;
      this.unsubscribers.push(onSnapshot(doc(db, "shops", uid), (snapshot) => { this.currentShop = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as PrintShop) : null; this.copyShopToForm(); }, (error) => this.error = this.firebaseError(error, "pagbasa sa profile ng shop")));
      this.unsubscribers.push(onSnapshot(query(collection(db, "orders"), where("shopId", "==", uid)), (snapshot) => this.orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PrintOrder).sort((a, b) => b.createdAt - a.createdAt), (error) => this.error = this.firebaseError(error, "pagbasa ng mga order ng shop")));
    } else if (this.authUser) {
      this.unsubscribers.push(onSnapshot(query(collection(db, "orders"), where("customerId", "==", this.authUser.uid)), (snapshot) => this.orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PrintOrder).sort((a, b) => b.createdAt - a.createdAt), (error) => this.error = this.firebaseError(error, "pagbasa ng mga order ng customer")));
    }
  }

  openOrderForm(order?: PrintOrder): void {
    this.error = ""; this.editingOrder = order ?? null;
    this.orderShopId = order?.shopId ?? this.openShops[0]?.id ?? "";
    this.requestedPickupAt = this.toLocalDateTime(order?.requestedPickupAt) || this.defaultPickupDate();
    this.orderDescription = order?.description ?? ""; this.orderSpecs = order?.specs ?? ""; this.orderQuantity = order?.quantity ?? 1; this.orderFile = null; this.modal = "order";
  }

  openOrderFormForShop(shop: PrintShop): void { this.openOrderForm(); this.orderShopId = shop.id; }

  openQuoteForm(order: PrintOrder): void {
    this.quoteOrder = order; this.quoteAmount = order.quoteAmount ?? 0; this.quoteNote = order.quoteNote ?? "";
    this.confirmedPickupAt = this.toLocalDateTime(order.requestedPickupAt) || this.defaultPickupDate(); this.error = ""; this.modal = "quote";
  }

  async sendQuote(): Promise<void> {
    if (!this.quoteOrder || !Number.isFinite(this.quoteAmount) || this.quoteAmount <= 0) { this.error = "Maglagay ng quote na higit sa ₱0."; return; }
    const pickupDate = new Date(this.confirmedPickupAt);
    if (!this.confirmedPickupAt || Number.isNaN(pickupDate.getTime()) || pickupDate <= new Date()) { this.error = "Pumili ng pickup date at time sa hinaharap."; return; }
    this.busy = true; this.error = "";
    try {
      await updateDoc(doc(db, "orders", this.quoteOrder.id), { quoteAmount: Math.round(this.quoteAmount * 100) / 100, quoteNote: this.quoteNote.trim(), confirmedPickupAt: pickupDate.toISOString(), status: "Awaiting customer", updatedAt: serverTimestamp() });
      this.error = "";
      this.notice = "";
      this.modal = null; this.quoteOrder = null;
    } catch (error) { this.error = this.firebaseError(error); } finally { this.busy = false; }
  }

  async respondToQuote(order: PrintOrder, accept: boolean): Promise<void> {
    if (!accept && !window.confirm("I-decline at kanselahin ang quote na ito?")) return;
    try { await updateDoc(doc(db, "orders", order.id), { status: accept ? "Awaiting payment" : "Cancelled", updatedAt: serverTimestamp() }); this.error = ""; this.notice = ""; } catch (error) { this.error = this.firebaseError(error); }
  }

  async confirmPaymentReceived(order: PrintOrder): Promise<void> {
    if (!order.paymentReference || !order.paymentSubmittedAt) { this.error = "Wala pang payment reference ang customer. Huwag simulan ang production."; return; }
    if (order.paymentProvider === "paypal_sandbox" && !order.paymentVerifiedAt) { this.error = "Hindi pa kumpirmado ang bayad ng PayPal Sandbox."; return; }
    const confirmed = order.paymentProvider === "paypal_sandbox"
      ? window.confirm("Kumpirmado na ng PayPal Sandbox ang test payment na ₱" + (order.quoteAmount ?? 0).toFixed(2) + ". Simulan ang production?")
      : window.confirm("Na-verify mo ba ang GCash transfer na ₱" + (order.quoteAmount ?? 0).toFixed(2) + " gamit ang reference na " + order.paymentReference + "? Ipagpapatuloy nito ang order sa production.");
    if (!confirmed) return;
    try { await updateDoc(doc(db, "orders", order.id), { status: "Printing", ...(order.paymentProvider === "paypal_sandbox" ? {} : { paymentVerifiedAt: new Date().toISOString() }), updatedAt: serverTimestamp() }); this.error = ""; this.notice = ""; } catch (error) { this.error = this.firebaseError(error); }
  }

  async submitPaymentReference(order: PrintOrder, enteredReference?: string): Promise<void> {
    if (order.paypalOrderId) { this.error = "Tapusin muna o huwag ituloy ang PayPal Sandbox checkout bago magsumite ng GCash reference."; return; }
    const reference = (enteredReference ?? "").trim();
    if (!reference || reference.length < 4 || reference.length > 100) { this.error = "Ilagay ang wastong GCash reference number (4–100 characters)."; return; }
    try { await updateDoc(doc(db, "orders", order.id), { paymentReference: reference, paymentSubmittedAt: new Date().toISOString(), updatedAt: serverTimestamp() }); this.error = ""; } catch (error) { this.error = this.firebaseError(error); }
  }

  async startPayPalCheckout(order: PrintOrder): Promise<void> {
    if (!this.authUser || order.status !== "Awaiting payment" || !order.quoteAmount || order.paymentSubmittedAt) {
      this.error = "Hindi pa handa ang order na ito para sa PayPal checkout.";
      return;
    }
    if (this.isLocalPaypalDemo) {
      this.error = "";
      this.notice = "";
      const sandboxSignIn = "https://www.sandbox.paypal.com/signin";
      const paypalWindow = window.open(sandboxSignIn, "_blank");
      if (paypalWindow) {
        paypalWindow.opener = null;
      } else {
        window.location.assign(sandboxSignIn);
      }
      return;
    }

    this.paypalBusyOrderId = order.id;
    this.error = "";
    try {
      const createCheckout = httpsCallable<{ orderId: string; appOrigin: string }, { approvalUrl: string }>(functions, "createPayPalSandboxCheckout");
      const result = await createCheckout({ orderId: order.id, appOrigin: window.location.origin });
      const approvalUrl = new URL(result.data.approvalUrl);
      if (approvalUrl.protocol !== "https:" || approvalUrl.hostname !== "www.sandbox.paypal.com") {
        throw new Error("Nagbalik ang PayPal Sandbox ng hindi inaasahang checkout URL.");
      }
      window.location.assign(approvalUrl.toString());
    } catch (error) {
      this.error = this.firebaseError(error);
      this.paypalBusyOrderId = "";
    }
  }

  private get isLocalPaypalDemo(): boolean {
    return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  }

  private async handlePayPalReturn(user: User): Promise<void> {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("paypal");
    if (result !== "return" && result !== "cancel") return;
    const orderId = url.searchParams.get("orderId") ?? "";
    url.searchParams.delete("paypal");
    url.searchParams.delete("orderId");
    url.searchParams.delete("token");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    this.error = "";
    this.notice = "";
    if (result === "cancel") {
      this.notice = "Kinansela ang PayPal Sandbox checkout. Walang siningil na bayad.";
      return;
    }
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(orderId) || !this.profile || this.profile.uid !== user.uid) {
      this.error = "Hindi mabasa ang order na ibinalik mula sa PayPal.";
      return;
    }
    try {
      const capturePayment = httpsCallable<{ orderId: string }, { paid: boolean }>(functions, "capturePayPalSandboxPayment");
      const capture = await capturePayment({ orderId });
      this.error = "";
      this.notice = capture.data.paid
        ? "Kumpirmado ng PayPal Sandbox ang test payment. Walang totoong pera na siningil."
        : "Hindi nakumpirma ng PayPal Sandbox ang payment.";
    } catch (error) {
      this.error = this.firebaseError(error);
    }
  }

  locateCustomer(): void {
    if (!navigator.geolocation) { this.locationMessage = "Hindi suportado ng browser ang location."; return; }
    this.locating = true; this.locationMessage = "";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { this.customerLatitude = coords.latitude; this.customerLongitude = coords.longitude; this.locating = false; },
      (error) => { this.locating = false; this.locationMessage = error.code === error.PERMISSION_DENIED ? "Hindi pinayagan ang location. Puwede pa ring maghanap gamit ang address." : "Hindi makuha ang location. Subukan ulit o maghanap gamit ang address."; },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  locateShop(): void {
    if (!navigator.geolocation) { this.error = "Hindi suportado ng browser ang location."; return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { this.shopLatitude = coords.latitude; this.shopLongitude = coords.longitude; this.error = ""; },
      (error) => { this.error = error.code === error.PERMISSION_DENIED ? "Hindi pinayagan ang location. Puwede mong ilagay ang coordinates nang mano-mano." : "Hindi makuha ang location. Subukan ulit o ilagay ang coordinates nang mano-mano."; },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  distanceToShop(shop: PrintShop): number {
    if (this.customerLatitude === null || this.customerLongitude === null || typeof shop.latitude !== "number" || typeof shop.longitude !== "number") return Number.POSITIVE_INFINITY;
    return distanceToShop(shop, this.customerLatitude, this.customerLongitude);
  }

  countOrders(status: OrderStatus): number { return this.orders.filter((order) => order.status === status).length; }
  
  async declineRequest(order: PrintOrder): Promise<void> {
    if (!window.confirm(`Decline the print request for ${order.description}?`)) return;
    await this.updateStatus(order, "Cancelled");
  }

  async saveOrder(): Promise<void> {
    if (!this.authUser || !this.profile) return;
    const shop = this.shops.find((item) => item.id === this.orderShopId);
    if (!shop) { this.error = "Pumili ng print shop bago magpatuloy."; return; }
    if (!shop.open && !this.editingOrder) { this.error = "Sarado muna ang shop na ito at hindi tumatanggap ng bagong requests."; return; }
    if (!this.orderDescription.trim() || !this.orderSpecs.trim() || !Number.isInteger(Number(this.orderQuantity)) || this.orderQuantity < 1 || this.orderQuantity > 1000) { this.error = "Kumpletuhin ang detalye ng print request."; return; }
    const requestedDate = new Date(this.requestedPickupAt);
    if (!this.requestedPickupAt || Number.isNaN(requestedDate.getTime()) || requestedDate <= new Date()) { this.error = "Pumili ng pickup date at time sa hinaharap."; return; }
    
    if (this.orderFile) { try { await validateOrderFile(this.orderFile); } catch (error) { this.error = this.firebaseError(error); return; } }
    
    this.busy = true; this.error = "";
    try {
      const orderId = this.editingOrder?.id ?? crypto.randomUUID();
      let fileName = this.editingOrder?.fileName ?? "";
      let filePath = this.editingOrder?.filePath ?? "";
      const payload = {
        customerId: this.authUser.uid, customerName: this.profile.name, shopId: shop.id, shopName: shop.name,
        description: this.orderDescription.trim(), specs: this.orderSpecs.trim(), quantity: Math.floor(this.orderQuantity),
        fileName, filePath, filestackHandle: this.editingOrder?.filestackHandle ?? "", filestackUrl: this.editingOrder?.filestackUrl ?? "",
        cloudinaryPublicId: this.editingOrder?.cloudinaryPublicId ?? "", cloudinaryResourceType: this.editingOrder?.cloudinaryResourceType ?? "", cloudinaryFormat: this.editingOrder?.cloudinaryFormat ?? "",
        requestedPickupAt: requestedDate.toISOString(), status: this.editingOrder?.status ?? "New request", updatedAt: serverTimestamp(),
        ...(this.editingOrder ? {} : { createdAt: Date.now() }),
      };
      if (this.editingOrder) { await updateDoc(doc(db, "orders", this.editingOrder.id), payload); } 
      else { await setDoc(doc(db, "orders", orderId), payload); this.editingOrder = { ...payload, id: orderId, createdAt: Date.now() }; }
      
      if (this.orderFile) {
        const uploadedAsset = await uploadOrderFile(this.orderFile, orderId);
        fileName = this.orderFile.name; filePath = "";
        await updateDoc(doc(db, "orders", orderId), { fileName, filePath, filestackHandle: uploadedAsset.handle, filestackUrl: uploadedAsset.url, cloudinaryPublicId: "", cloudinaryResourceType: "", cloudinaryFormat: "", updatedAt: serverTimestamp() });
        this.editingOrder = { ...this.editingOrder!, fileName, filePath, filestackHandle: uploadedAsset.handle, filestackUrl: uploadedAsset.url, cloudinaryPublicId: "", cloudinaryResourceType: "", cloudinaryFormat: "" };
      }
      this.error = "";
      this.notice = "";
      this.modal = null;
    } catch (error) { this.error = this.editingOrder ? `Na-save ang request details, pero hindi na-upload o na-link ang file sa Filestack: ${this.firebaseError(error)}` : this.firebaseError(error); } finally { this.busy = false; }
  }

  async deleteOrder(order: PrintOrder): Promise<void> {
    if (!window.confirm(`I-delete ang request na ${order.description}?`)) return;
    try {
      await deleteDoc(doc(db, "orders", order.id));
      this.error = "";
      this.notice = "";
      if (order.cloudinaryPublicId && (order.cloudinaryResourceType === "image" || order.cloudinaryResourceType === "raw")) { await deleteLegacyOrderFile(order.id, order.cloudinaryPublicId, order.cloudinaryResourceType); } 
      else if (order.filePath) { try { await deleteObject(ref(storage, order.filePath)); } catch (error) { this.error = `Na-delete ang request, pero hindi natanggal ang uploaded file: ${this.firebaseError(error)}`; } }
    } catch (error) { this.error = this.firebaseError(error); }
  }

  async saveShop(): Promise<void> {
    if (!this.authUser) return;
    if (!this.shopName.trim() || !this.shopCity.trim() || !this.shopAddress.trim() || !this.shopServices.trim()) { this.error = "Kumpletuhin ang shop name, lokasyon, address, at services."; return; }
    if ((this.shopLatitude === null) !== (this.shopLongitude === null) || (this.shopLatitude !== null && (Math.abs(this.shopLatitude) > 90 || Math.abs(this.shopLongitude!) > 180))) { this.error = "Ilagay ang parehong valid na latitude at longitude."; return; }
    if ((this.shopGcashAccountName.trim() && !this.shopGcashNumber.trim()) || (this.shopGcashNumber.trim() && !this.shopGcashAccountName.trim())) { this.error = "Kumpletuhin ang GCash account name at number, o iwanang parehong walang laman."; return; }
    this.busy = true; this.error = "";
    try {
      await setDoc(doc(db, "shops", this.authUser.uid), {
        ownerId: this.authUser.uid, name: this.shopName.trim(), city: this.shopCity.trim(), address: this.shopAddress.trim(),
        services: this.shopServices.trim(), latitude: this.shopLatitude, longitude: this.shopLongitude,
        gcashAccountName: this.shopGcashAccountName.trim(), gcashNumber: this.shopGcashNumber.trim(),
        open: this.currentShop?.open ?? true, updatedAt: serverTimestamp(), ...(this.currentShop ? {} : { createdAt: serverTimestamp() }),
      }, { merge: true });
      this.error = "";
      this.notice = "";
      this.modal = null;
    } catch (error) { this.error = this.firebaseError(error); } finally { this.busy = false; }
  }

  openShopForm(): void { this.copyShopToForm(); this.error = ""; this.modal = "shop"; }

  async toggleShopOpen(): Promise<void> {
    if (!this.currentShop || !this.authUser) return;
    try { await updateDoc(doc(db, "shops", this.authUser.uid), { open: !this.currentShop.open, updatedAt: serverTimestamp() }); this.error = ""; this.notice = ""; } catch (error) { this.error = this.firebaseError(error); }
  }

  async updateStatus(order: PrintOrder, status: OrderStatus): Promise<void> {
    try { await updateDoc(doc(db, "orders", order.id), { status, updatedAt: serverTimestamp() }); this.error = ""; this.notice = ""; } catch (error) { this.error = this.firebaseError(error); }
  }

  async openOrderFile(order: PrintOrder): Promise<void> {
    try {
      const url = order.filestackUrl || (order.cloudinaryPublicId ? await getLegacyOrderFileUrl(order.id) : order.filePath ? await getDownloadURL(ref(storage, order.filePath)) : "");
      if (!url) { this.error = "Walang file na nakakabit sa order na ito."; return; }
      window.open(url, "_blank", "noopener,noreferrer");
      this.error = "";
    } catch (error) { this.error = this.firebaseError(error); }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.orderFile = input.files?.[0] ?? null;
  }

  closeModal(): void { this.modal = null; this.quoteOrder = null; this.error = ""; }

  notificationText(order: PrintOrder): string {
    if (this.isShopAccount && order.status === "New request") return `New print request from ${order.customerName}: ${order.description}.`;
    if (this.isShopAccount && order.status === "Awaiting payment" && order.paymentReference) {
      return order.paymentProvider === "paypal_sandbox"
        ? `PayPal Sandbox confirmed a test payment for ${order.description}.`
        : `${order.customerName} submitted GCash reference ${order.paymentReference} for ${order.description}. Verify the transfer.`;
    }
    if (order.status === "Printing" && order.paymentVerifiedAt) return order.paymentProvider === "paypal_sandbox"
      ? `PayPal Sandbox confirmed the test payment. ${order.description} is now printing.`
      : `Your payment was verified by the shop. ${order.description} is now printing.`;
    return orderNotificationText(order);
  }

  private copyShopToForm(): void {
    this.shopName = this.currentShop?.name ?? ""; this.shopCity = this.currentShop?.city ?? "";
    this.shopAddress = this.currentShop?.address ?? ""; this.shopServices = this.currentShop?.services ?? "";
    this.shopLatitude = this.currentShop?.latitude ?? null; this.shopLongitude = this.currentShop?.longitude ?? null;
    this.shopGcashAccountName = this.currentShop?.gcashAccountName ?? ""; this.shopGcashNumber = this.currentShop?.gcashNumber ?? "";
  }

  private defaultPickupDate(): string {
    const pickup = new Date(Date.now() + 24 * 60 * 60 * 1000);
    pickup.setMinutes(0, 0, 0); pickup.setHours(Math.max(9, pickup.getHours()));
    return this.toLocalDateTime(pickup.toISOString());
  }

  private toLocalDateTime(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  private accountRole(value: unknown): AccountRole | null {
    if (value === "customer" || value === "shop" || value === "admin") return value;
    if (value === "shop_owner" || value === "owner") return "shop";
    return null;
  }

  private stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

  private clearDataListeners(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = []; this.orders = []; this.shops = []; this.currentShop = null; this.users = [];
  }

  private firebaseError(error: unknown, operation?: string): string {
    if (error instanceof Error) {
      const code = "code" in error ? String(error.code) : "";
      if (code === "functions/internal" || code === "internal") return "Hindi pa available ang PayPal Sandbox service. Kailangan munang ma-deploy ang Firebase Functions at maitakda ang PAYPAL_CLIENT_ID at PAYPAL_CLIENT_SECRET sa Firebase Secret Manager. Huwag ilagay ang mga key sa app o ipadala rito.";
      if (code === "functions/not-found") return "Hindi pa naka-deploy ang PayPal Sandbox function. I-deploy muna ang createPayPalSandboxCheckout at capturePayPalSandboxPayment.";
      if (code === "functions/unauthenticated") return "Mag-sign in ulit bago simulan ang PayPal checkout.";
      if (code === "functions/unavailable") return error.message;
      if (code === "functions/failed-precondition") return error.message;
      if (code === "auth/email-already-in-use") return "May account na para sa email na ito.";
      if (code === "auth/invalid-credential") return "Hindi tugma ang email at password. Siguraduhing na-create ang account sa Firebase Authentication.";
      if (code === "auth/weak-password") return "Gumamit ng mas matibay na password.";
      if (code === "auth/too-many-requests") return "Masyadong maraming pagtatangka. Subukan ulit mamaya.";
      if (code === "auth/network-request-failed") return "Walang koneksyon. Tingnan ang internet at subukan ulit.";
      if (code === "permission-denied" || code === "functions/permission-denied") {
        const action = operation ? ` ang ${operation}` : " ang request";
        return `Hindi pinayagan ng Firebase${action}. Maaaring hindi tugma ang naka-deploy na Firebase rules sa app o kulang ang access ng account.`;
      }
      return error.message;
    }
    return "May hindi inaasahang error. Subukan ulit.";
  }
}