import { initializeApp } from "firebase/app";

// Your client-side public web app Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDmJjhP7Al4Hn54rf2X6LkINtIuLINld8A",
  authDomain: "rausgucken-notification.firebaseapp.com",
  projectId: "rausgucken-notification",
  storageBucket: "rausgucken-notification.firebasestorage.app",
  messagingSenderId: "204790417960",
  appId: "1:204790417960:web:06547f098c630e9e4fc31d"
};

// Initialize and export the instance context for the browser/Capacitor environment
export const firebaseApp = initializeApp(firebaseConfig);
