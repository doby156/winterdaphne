// 이 파일은 index.html, chat.html과 같은 최상위(루트) 경로에 있어야만 정상 동작합니다.
// (하위 폴더로 옮기면 서비스 워커 등록(navigator.serviceWorker.register('/firebase-messaging-sw.js'))이 실패해요.)

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCERGsq18ge50jGU9gtZ0YsvPhAinXx7uA",
  authDomain: "doby1-5184b.firebaseapp.com",
  projectId: "doby1-5184b",
  storageBucket: "doby1-5184b.firebasestorage.app",
  messagingSenderId: "265803550530",
  appId: "1:265803550530:web:e97415dd1fbeae6a77c2db"
});

const messaging = firebase.messaging();

// 앱이 백그라운드(또는 완전히 꺼진 상태)일 때 푸시가 도착하면 실행됩니다.
// 참고: 이 서비스 워커는 "받은 푸시를 화면에 띄우는" 역할만 합니다.
// 실제로 상대방이 메시지를 보냈을 때 이 푸시를 "보내는" 트리거는 별도의 Cloud Function이 필요해요 (아직 미구현, 안내 참고).
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'CASTANEA';
  const options = {
    body: (payload.notification && payload.notification.body) || '새 메시지가 도착했어요.',
  };
  self.registration.showNotification(title, options);
});
