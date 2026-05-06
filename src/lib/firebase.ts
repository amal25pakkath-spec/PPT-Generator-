import { initializeApp } from 'firebase/app';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Ensure we have a valid configuration
const app = initializeApp(firebaseConfig);

// Use the explicit database ID from config
const dbId = (firebaseConfig as any).firestoreDatabaseId;

if (!dbId) {
  console.warn("Firestore Database ID is missing from config!");
}

// Use initializeFirestore with databaseId to ensure it doesn't default to (default)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, dbId || '(default)'); // Usually AI Studio projects have a specific ID, so dbId should exist.

export const auth = getAuth(app);
