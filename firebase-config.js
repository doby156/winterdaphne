// ⚠️ 아래 값을 Firebase 콘솔에서 발급받은 본인의 설정값으로 반드시 교체하세요.
// 경로: Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성 > "구성" 선택
const firebaseConfig = {
  apiKey: "AIzaSyCERGsq18ge50jGU9gtZ0YsvPhAinXx7uA",
  authDomain: "doby1-5184b.firebaseapp.com",
  projectId: "doby1-5184b",
  storageBucket: "doby1-5184b.firebasestorage.app",
  messagingSenderId: "265803550530",
  appId: "1:265803550530:web:e97415dd1fbeae6a77c2db"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 아이디(문자) 로그인을 이메일 기반인 Firebase Auth 위에서 쓰기 위한 변환 규칙.
// 예: 아이디가 "minsu"면 내부적으로 "minsu@chatapp.local" 이라는 가짜 이메일로 가입/로그인합니다.
// 사용자에게는 절대 노출되지 않고, 실제 이메일이 필요하지도 않습니다.
function usernameToEmail(username) {
  return username.trim().toLowerCase() + "@chatapp.local";
}
