// -------- 화면 전환 (로그인 <-> 회원가입) --------
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const showSignup = document.getElementById('showSignup');
const showLogin = document.getElementById('showLogin');
const loginError = document.getElementById('loginError');
const signupError = document.getElementById('signupError');

showSignup.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.classList.add('hidden');
  signupForm.classList.remove('hidden');
});
showLogin.addEventListener('click', (e) => {
  e.preventDefault();
  signupForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
});

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}
function hideError(el) {
  el.style.display = 'none';
}

// -------- 이미 로그인되어 있으면 채팅 화면으로 --------
auth.onAuthStateChanged((user) => {
  if (user) {
    window.location.href = 'chat.html';
  }
});

// -------- 회원가입 --------
document.getElementById('signupBtn').addEventListener('click', async () => {
  hideError(signupError);
  const username = document.getElementById('signupUsername').value.trim();
  const nickname = document.getElementById('signupNickname').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    showError(signupError, '아이디는 영문/숫자/밑줄 3~20자로 입력해주세요.');
    return;
  }
  if (!nickname) {
    showError(signupError, '닉네임을 입력해주세요.');
    return;
  }
  // 이메일은 선택 입력이지만, 입력했다면 형식은 확인합니다.
  // 참고: 이 이메일은 단순 프로필 정보로만 저장되며, 로그인/비밀번호 찾기에는 쓰이지 않아요
  // (로그인은 계속 아이디 기반 가짜 이메일(usernameToEmail)로 처리됩니다).
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError(signupError, '이메일 형식이 올바르지 않아요.');
    return;
  }
  if (password.length < 6) {
    showError(signupError, '비밀번호는 6자 이상이어야 해요.');
    return;
  }

  const btn = document.getElementById('signupBtn');
  btn.disabled = true;
  btn.textContent = '가입 중...';

  try {
    const usernameKey = username.toLowerCase();
    // 아이디 중복 확인
    const existing = await db.collection('usernames').doc(usernameKey).get();
    if (existing.exists) {
      showError(signupError, '이미 사용 중인 아이디예요.');
      btn.disabled = false;
      btn.textContent = '가입하기';
      return;
    }

    const cred = await auth.createUserWithEmailAndPassword(
      usernameToEmail(username),
      password
    );
    const uid = cred.user.uid;

    // 사용자 정보 저장 + 아이디 예약(중복 방지)
    await db.collection('users').doc(uid).set({
      username: usernameKey,
      displayUsername: username,
      nickname: nickname,
      email: email || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
      loginHistory: [{ at: new Date().toISOString() }]
    });
    await db.collection('usernames').doc(usernameKey).set({ uid: uid });

    window.location.href = 'chat.html';
  } catch (err) {
    console.error(err);
    if (err.code === 'auth/email-already-in-use') {
      showError(signupError, '이미 사용 중인 아이디예요.');
    } else {
      showError(signupError, '가입에 실패했어요: ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = '가입하기';
  }
});

// -------- 로그인 --------
document.getElementById('loginBtn').addEventListener('click', async () => {
  hideError(loginError);
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    showError(loginError, '아이디와 비밀번호를 입력해주세요.');
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = '로그인 중...';

  try {
    const cred = await auth.signInWithEmailAndPassword(usernameToEmail(username), password);
    // 로그인 기록 저장 (관리자 화면에서 확인용). 실패해도 로그인 자체는 막지 않습니다.
    try {
      const uid = cred.user.uid;
      const entry = { at: new Date().toISOString() };
      await db.collection('users').doc(uid).update({
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        loginHistory: firebase.firestore.FieldValue.arrayUnion(entry)
      });
    } catch (logErr) {
      console.error('로그인 기록 저장 실패(무시):', logErr);
    }
    window.location.href = 'chat.html';
  } catch (err) {
    console.error(err);
    showError(loginError, '아이디 또는 비밀번호가 올바르지 않아요.');
    btn.disabled = false;
    btn.textContent = '로그인';
  }
});

// 엔터키로도 제출
document.getElementById('loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});
document.getElementById('signupPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('signupBtn').click();
});
