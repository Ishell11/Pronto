# PRONTO

PRONTO is a mobile-first **Ionic + Angular** frontend backed by Firebase Authentication and Cloud Firestore, with Filestack for new attachments. React is not used.

## Run locally

```sh
npm install
ionic serve
```

`npm start` and `npm run ionic:serve` run the same Ionic development server.

The Firebase web app configuration is in `src/app/core/firebase.ts`. Firebase web configuration is public by design; access control is enforced by Firebase Security Rules, not by hiding the configuration.

### PayPal Sandbox link preview

On localhost, the order page's PayPal button opens the official PayPal Sandbox sign-in page in a new tab and shows a demo notice in PRONTO. This is only an outbound link preview: it does not authenticate/connect a PayPal account, create a checkout, charge money, or update an order. Hosted checkout still requires deployed Firebase Functions and securely configured Sandbox credentials.

## Source layout

- `src/app/app.component.ts` — Firebase session, shared data listeners, and customer/shop actions.
- `src/app/app.component.html` — auth routing, workspace navigation, shared dialogs, and page wiring.
- `src/app/app.component.css` — workspace shell, shared dashboard cards/forms, and responsive layout.
- `src/app/auth/` — splash, welcome, login, signup, password reset, and profile setup screens; each screen keeps its TypeScript, HTML, and CSS together.
- `src/app/dashboard/customer-home/` — customer home and nearby-shop preview.
- `src/app/dashboard/customer-shops/` — customer shop search, location, map, and new-request entry.
- `src/app/dashboard/customer-orders/` — customer order status, quotes, payments, attachments, and edit/delete actions.
- `src/app/dashboard/customer-notifications/` — live customer order updates.
- `src/app/dashboard/customer-profile/` — customer account details and sign-out.
- `src/app/dashboard/shop-home/` — shop dashboard, pickup calendar, and production overview.
- `src/app/dashboard/shop-requests/` — shop quote, payment verification, file review, and job status actions.
- `src/app/dashboard/shop-services/` — shop service and location listing.
- `src/app/dashboard/shop-earnings/` — quote totals and payment-waiting summary (not a payout ledger).
- `src/app/dashboard/shop-profile/` — shop listing status and profile actions.
- `src/app/dashboard/admin-home/` — administrator marketplace overview.
- `src/app/core/firebase.ts` — Firebase initialization.
- `src/app/core/filestack.ts` — Filestack upload and client-side file validation.
- `src/app/core/legacy-order-files.ts` — read/delete support for existing Cloudinary-backed orders.
- `src/app/core/order-ui.ts` — shared order status, notifications, location/map, and shop-status helpers.
- `src/app/core/models.ts` — shared account, shop, and order types.
- `src/theme.css` — global fonts, design tokens, and reset styles; shared dashboard styling is in `app.component.css`.

Angular uses HTML templates rather than React `.tsx` files.

## Firebase setup

In Firebase Console for project `pronto-ce630`:

1. Enable **Authentication → Email/Password**.
2. Create a **Cloud Firestore** database.
3. Set up **Cloud Storage** only if the project still has legacy Firebase Storage attachments; Firebase currently requires the Blaze billing plan to create/use the project's Storage bucket.
4. Deploy the rules with the Firebase CLI (`firebase deploy --only firestore:rules` and, only if using Firebase Storage, `firebase deploy --only storage`) after confirming the CLI account has access to `pronto-ce630`.
5. Add the development and production hosts to **Authentication → Settings → Authorized domains**.

### Filestack order files

New order attachments upload directly to Filestack using the public Filestack API key and are limited in the client to one PDF/JPG/PNG file up to 20 MB, with a file-signature check. Configure the Filestack app's allowed domains, storage, and security settings in the Filestack dashboard. The key is not an application secret; never place the Filestack application secret or a signing policy in Angular source.

The current browser upload does not request a signed policy, so Filestack security settings that require signed uploads will reject it. Direct-uploaded Filestack URLs are not protected by Firebase Firestore rules: anyone who obtains a URL may be able to open the file. Do not store sensitive/private documents this way. Private per-user file access requires a trusted server to issue short-lived Filestack policies/signatures and enforce ownership; that backend is not configured here. Configure domain restrictions in Filestack as a minimum, and do not disable required security settings just to make uploads work.

New files save their Filestack handle and URL on the Firestore order. Existing Firebase Storage attachments remain readable through their old path. Older Cloudinary attachment records retain a legacy read/delete path through the existing Firebase Functions deployment; new uploads do not use Cloudinary. Deleting a Filestack-backed order removes the Firestore order but does not remove its Filestack asset; clean up those assets in Filestack or add a trusted server-side deletion workflow.

Admin access uses the same sign-in form as customer and shop accounts. In Firebase Console, create the administrator in **Authentication → Users** with a strong, private password, then grant access only through a trusted Admin SDK custom claim (`admin: true`) or set the user's `users/{uid}` profile role to `admin` from the trusted Firebase Console. The app routes authenticated admin profiles/claims to the administrator dashboard and subscribes to marketplace data. Do not grant admin rights through signup, do not use a shared weak password such as `pronto123`, and never put admin credentials in Angular code or Firestore rules.

Until those services are enabled and the security rules deployed, Firebase will return an explicit error instead of showing fake/simulated data.

## Implemented flows

- Email/password registration, sign-in, persistent auth state, and password-reset email.
- Customer and print-shop accounts, with role-specific dashboards.
- Print shops can publish/edit their listing, save shop coordinates, add optional GCash receiving details, pause or accept new requests, review jobs, confirm pickup dates, and move accepted/paid jobs through production stages.
- Customers can sort shops by device location, open shop addresses/coordinates in OpenStreetMap, create print requests with a requested pickup time, attach PDF/JPG/PNG files, accept or decline quotes, edit/delete new requests, and see live order updates.
- In-app order notifications are scoped to the signed-in user's own orders: shops see their assigned new requests and customer-submitted GCash references; customers see shop quotes and later order/payment status updates, not a notification for creating their own request. GCash reference and verification timestamps remain visible on the customer's order after payment verification. These are live in-app updates, not push notifications.
- Empty states are shown when shops or orders have not been added yet.
- Payment supports manual GCash transfer details and a customer-submitted reference number; shops must verify the transaction in GCash before starting production. On localhost, the PayPal Sandbox button only opens PayPal's sign-in page and shows a demo notice. Actual checkout/capture requires deployed Firebase Functions and securely configured Sandbox credentials; never put provider secret keys in the web app.
- Pickup scheduling is stored on each Firestore order: customers request a date/time, shops confirm it with their quote, and a navigable monthly calendar shows confirmed pickup appointments.
- Administrator access cannot be self-selected during signup. The app recognizes either the Firebase Auth custom claim `admin: true` or a protected `users/{uid}` profile with `role: "admin"`; grant either only through a trusted Admin SDK process or the Firebase Console. An account with admin access opens the admin dashboard automatically after sign-in. Never use a shared or hard-coded admin password.
