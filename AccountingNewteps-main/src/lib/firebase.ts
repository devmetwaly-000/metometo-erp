// استيراد الدوال اللازمة من مكتبات Firebase
import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase, goOffline, goOnline } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getMessaging } from "firebase/messaging";

// Your web app's Firebase configuration
// const firebaseConfig = {
//   apiKey: "AIzaSyB5eWTzBcT7WFXEpUd0MavS4rhrpciyxi4",
//   authDomain: "multibranch-accounting.firebaseapp.com",
//   databaseURL: "https://multibranch-accounting-default-rtdb.firebaseio.com",
//   projectId: "multibranch-accounting",
//   storageBucket: "multibranch-accounting.appspot.com",
//   messagingSenderId: "152457207026",
//   appId: "1:152457207026:web:c7cbac5d940ddaf87f046b"
// };
const firebaseConfig = {
  apiKey: "AIzaSyDSJdpoRR3U8rIjCLmhkVBvN2DKFkJ91Ns",
  authDomain: "meto-pos.firebaseapp.com",
  databaseURL: "https://meto-pos-default-rtdb.firebaseio.com",
  projectId: "meto-pos",
  storageBucket: "meto-pos.firebasestorage.app",
  messagingSenderId: "800263991208",
  appId: "1:800263991208:web:d1be71624dbf263106b79d"
};

// تهيئة تطبيق Firebase
// يتم التحقق مما إذا كان التطبيق قد تم تهيئته بالفعل لتجنب الأخطاء
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// الحصول على مثيل من قاعدة البيانات والمصادقة
const database = app ? getDatabase(app) : null;
const auth = app ? getAuth(app) : null;
const messaging = (typeof window !== "undefined" && app) ? getMessaging(app) : null;

// تصدير المثيلات لاستخدامها في جميع أنحاء التطبيق.
export { app, database, auth, messaging };
