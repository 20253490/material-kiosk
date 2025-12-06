// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// --------------------------------------------------------
// [중요] 아래 부분을 아까 웹사이트에서 복사한 내용으로 바꿔치기 하세요!
// const firebaseConfig = { ... } 이 부분 전체를 붙여넣으시면 됩니다.
// --------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAfgklnIiL1e8jrUXSub4A0dDNM7Siv3RE",
  authDomain: "material-kiosk.firebaseapp.com",
  projectId: "material-kiosk",
  storageBucket: "material-kiosk.firebasestorage.app",
  messagingSenderId: "215818525900",
  appId: "1:215818525900:web:00797784ed556f91393669"
};
// --------------------------------------------------------

// 파이어베이스 시작!
const app = initializeApp(firebaseConfig);

// 데이터베이스 도구 내보내기 (다른 파일에서 쓸 수 있게)
export const db = getFirestore(app);