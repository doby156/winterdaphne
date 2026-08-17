# CASTANEA (MVP: 로그인 + 텍스트 채팅)

순수 HTML/CSS/JS로 만든 정적 사이트예요. 서버 코드는 따로 없고,
**Firebase**(구글의 무료 백엔드 서비스)가 로그인/실시간 메시지 저장을 대신 해주고,
**Netlify**가 이 사이트를 인터넷에 올려주고, **GitHub**에 코드를 올려두면
Netlify가 자동으로 최신 버전을 반영해줍니다.

```
[내 컴퓨터] → git push → [GitHub 저장소] → 자동 감지 → [Netlify 배포] → 어디서든 접속
                                              ↕
                                     [Firebase: 로그인/DB]
```

---

## 1단계. Firebase 프로젝트 만들기 (5분)

1. https://console.firebase.google.com 접속 → 구글 계정으로 로그인
2. **"프로젝트 추가"** 클릭 → 이름 입력 (예: `my-chat-app`) → 애널리틱스는 꺼도 됩니다 → 만들기
3. 왼쪽 메뉴에서 **Authentication** 클릭 → "시작하기" → **로그인 방법** 탭 → **이메일/비밀번호** 를 사용 설정으로 켜기
4. 왼쪽 메뉴에서 **Firestore Database** 클릭 → "데이터베이스 만들기" → 위치는 `asia-northeast3(서울)` 선택 →
   **테스트 모드로 시작** 선택 (일단 개발용, 아래 6단계에서 보안 규칙을 넣어줄 거예요)
5. 왼쪽 위 톱니바퀴 ⚙️ → **프로젝트 설정** → 아래로 스크롤 → **내 앱** 에서 `</>` (웹) 아이콘 클릭 →
   앱 닉네임 아무거나 입력 → 등록만 하고 호스팅은 설정할 필요 없어요
6. 화면에 나오는 `firebaseConfig = { apiKey: "...", ... }` 값을 복사해서
   이 프로젝트의 **`js/firebase-config.js`** 파일 안의 값들을 그대로 교체해주세요.

### Firestore 보안 규칙 넣기
Firestore Database → **규칙(Rules)** 탭에서 아래 내용으로 바꾸고 **게시(Publish)**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /usernames/{name} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
    match /rooms/{roomId} {
      allow read, update: if request.auth != null && request.auth.uid in resource.data.members;
      allow create: if request.auth != null && request.auth.uid in request.resource.data.members;

      match /messages/{msgId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == request.resource.data.senderId;
      }
    }
  }
}
```
이 규칙은 "로그인한 사람만, 자기가 속한 방의 메시지만" 읽고 쓸 수 있게 막아줘요.

---

## 2단계. 로컬에서 테스트해보기

폴더 안에서 그냥 `index.html`을 더블클릭해서 브라우저로 열어도 되고,
VS Code를 쓴다면 "Live Server" 확장을 켜서 열어도 됩니다.
회원가입 → 로그인 → 다른 브라우저(또는 시크릿창)로 계정 하나 더 만들어서
＋ 버튼으로 서로의 아이디를 초대해보면 실시간으로 메시지가 오가는 걸 확인할 수 있어요.

---

## 3단계. GitHub에 올리기

```bash
cd chatapp
git init
git add .
git commit -m "첫 커밋: 로그인 + 실시간 채팅 MVP"
git branch -M main
git remote add origin https://github.com/내계정/저장소이름.git
git push -u origin main
```
(GitHub에서 미리 빈 저장소를 하나 만들어 두세요 — Repository 이름만 정하고 README 등은 체크 해제)

---

## 4단계. Netlify와 GitHub 연결하기

1. https://app.netlify.com 접속 → GitHub 계정으로 로그인
2. **"Add new site" → "Import an existing project"** 클릭
3. GitHub 선택 → 방금 올린 저장소 선택
4. 빌드 설정은 그대로 두고 (빌드 명령어 없음, publish directory는 루트 `/`) **Deploy** 클릭
5. 몇 초 뒤 `https://무작위이름.netlify.app` 주소가 생기고, 여기로 접속하면 실제 서비스처럼 작동해요
6. 앞으로 코드를 수정하고 `git push` 만 하면 Netlify가 자동으로 다시 배포해줍니다 (별도 작업 불필요)

---

## 지금 되는 것 / 다음에 추가할 것

**✅ 지금 MVP에서 되는 것**
- 아이디/비밀번호 회원가입, 로그인
- 상대 아이디로 검색해서 1:1 대화방 초대
- 실시간 텍스트 메시지 (여러 기기에서 동시 접속 가능)

**🔜 다음 단계로 추가 가능한 것** (원하시면 이어서 만들어드릴게요)
- 사진 전송 (Firebase Storage 연동)
- 음성/영상 통화 (WebRTC)
- 읽음 표시, 그룹 채팅, 알림(푸시)

---

## 자주 만나는 오류

| 증상 | 원인 |
|---|---|
| "Firebase: Error (auth/...)" | `firebase-config.js` 값이 잘못 붙여넣어졌을 가능성 |
| 회원가입은 되는데 로그인이 안 됨 | Authentication에서 "이메일/비밀번호" 로그인 방법을 켜지 않음 |
| 메시지가 안 보임 | Firestore 보안 규칙을 게시(Publish)하지 않았거나 오타 |
| 방 목록이 안 뜸 | 콘솔(F12)에 인덱스 생성 링크가 뜨면 그 링크를 클릭해서 인덱스 생성 (최초 1회, 1~2분 소요) |
