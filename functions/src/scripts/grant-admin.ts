import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2]?.trim();
if (!email) {
  throw new Error("Usage: npm run grant-admin -- <existing-firebase-auth-email>");
}

async function grantAdmin(): Promise<void> {
  initializeApp({
    credential: applicationDefault(),
    projectId: "pronto-ce630",
  });

  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, {
    ...user.customClaims,
    admin: true,
  });

  console.log(`Granted admin access to ${user.email}. Sign out and back in to refresh the role.`);
}

void grantAdmin();
