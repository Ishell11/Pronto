import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDNGdS9T7jexOqUrDmo_Nt50OI_AVIgQRI",
  authDomain: "pronto-ce630.firebaseapp.com",
  projectId: "pronto-ce630",
  storageBucket: "pronto-ce630.firebasestorage.app",
  messagingSenderId: "180754785806",
  appId: "1:180754785806:web:386fd60d17baa6cd437e5f",
  measurementId: "G-C8JKSX3RNJ",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-southeast1");
