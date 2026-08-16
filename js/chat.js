let currentUser = null;
let currentUserData = null;
let currentRoomId = null;
let messagesUnsub = null;
let roomsUnsub = null;
let lastMessagesSnap = null;

// uid -> users/{uid} 문서 데이터를 캐시 (닉네임 실시간 반영 + 탈퇴 여부 확인용)
const userCache = {};

const roomListEl = document.getElementById('roomList');
const chatPaneEmpty = document.getElementById('chatPaneEmpty');
const chatActive = document.getElementById('chatActive');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const chatRoomName = document.getElementById('chatRoomName');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const uploadProgressEl = document.getElementById('uploadProgress');

// -------- 로그인 여부 확인 --------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  const doc = await db.collection('users').doc(user.uid).get();
  currentUserData = doc.data();
  userCache[user.uid] = currentUserData;
  document.getElementById('meNickname').textContent = currentUserData.nickname;
  document.getElementById('meUsername').textContent = '@' + currentUserData.displayUsername;
  listenRooms();
  checkAdmin();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  auth.signOut();
});

// -------- 사용자 정보 실시간(에 가깝게) 조회 + 캐시 --------
// 탈퇴한 사용자는 users/{uid} 문서 자체가 삭제되므로, 조회 결과가 없으면 탈퇴로 간주합니다.
async function getUserLive(uid) {
  if (userCache[uid] !== undefined) return userCache[uid];
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      userCache[uid] = doc.data();
    } else {
      userCache[uid] = { nickname: '(탈퇴한 사용자)', withdrawn: true };
    }
  } catch (e) {
    console.error(e);
    userCache[uid] = null;
  }
  return userCache[uid];
}

function getOtherUid(room) {
  const idx = room.members.indexOf(currentUser.uid);
  const otherIdx = idx === 0 ? 1 : 0;
  return room.members[otherIdx];
}
function getCachedOtherMemberName(room) {
  const idx = room.members.indexOf(currentUser.uid);
  const otherIdx = idx === 0 ? 1 : 0;
  return (room.memberNicknames && room.memberNicknames[otherIdx]) || '상대방';
}

// -------- 방 목록 실시간 구독 --------
function listenRooms() {
  if (roomsUnsub) roomsUnsub();
  roomsUnsub = db.collection('rooms')
    .where('members', 'array-contains', currentUser.uid)
    .orderBy('lastMessageAt', 'desc')
    .onSnapshot((snap) => {
      roomListEl.innerHTML = '';
      if (snap.empty) {
        roomListEl.innerHTML = '<div class="empty-note">아직 대화방이 없어요.<br>오른쪽 위 + 버튼으로 상대방 아이디를 입력해 초대해보세요.</div>';
        return;
      }
      snap.forEach((docSnap) => {
        const room = docSnap.data();
        const otherUid = getOtherUid(room);
        const fallbackName = getCachedOtherMemberName(room);
        const item = document.createElement('div');
        item.className = 'room-item' + (docSnap.id === currentRoomId ? ' active' : '');
        item.innerHTML = `
          <div class="avatar">${fallbackName.charAt(0).toUpperCase()}</div>
          <div class="room-meta">
            <div class="room-name">${escapeHtml(fallbackName)}</div>
            <div class="room-last">${escapeHtml(room.lastMessage || '대화를 시작해보세요')}</div>
          </div>
        `;
        item.addEventListener('click', () => openRoom(docSnap.id, room));
        roomListEl.appendChild(item);

        // 최신 닉네임/탈퇴 여부로 비동기 업데이트
        if (otherUid) {
          getUserLive(otherUid).then((u) => {
            if (!u) return;
            const liveName = u.withdrawn ? '(탈퇴한 사용자)' : u.nickname;
            const nameEl = item.querySelector('.room-name');
            const avatarEl = item.querySelector('.avatar');
            if (nameEl) nameEl.textContent = liveName;
            if (avatarEl) avatarEl.textContent = liveName.charAt(0).toUpperCase();
          });
        }
      });
    }, (err) => {
      console.error(err);
      roomListEl.innerHTML = '<div class="empty-note">방 목록을 불러오지 못했어요.</div>';
    });
}

// -------- 방 열기 --------
function openRoom(roomId, roomData) {
  currentRoomId = roomId;
  chatPaneEmpty.classList.add('hidden');
  chatActive.classList.remove('hidden');
  chatRoomName.textContent = getCachedOtherMemberName(roomData);
  document.getElementById('sidebar').classList.add('hide-mobile');

  document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));

  setComposerEnabled(true);
  const otherUid = getOtherUid(roomData);
  if (otherUid) {
    getUserLive(otherUid).then((u) => {
      if (currentRoomId !== roomId || !u) return; // 그 사이 다른 방을 열었으면 무시
      if (u.withdrawn) {
        chatRoomName.textContent = '(탈퇴한 사용자)';
        setComposerEnabled(false);
      } else {
        chatRoomName.textContent = u.nickname;
      }
    });
  }

  if (messagesUnsub) messagesUnsub();
  messagesEl.innerHTML = '';

  messagesUnsub = db.collection('rooms').doc(roomId).collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot((snap) => renderAllMessages(snap));
}

function setComposerEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  attachBtn.disabled = !enabled;
  messageInput.placeholder = enabled ? '메시지를 입력하세요' : '탈퇴한 사용자와는 대화할 수 없어요';
}

// -------- 메시지 렌더링 --------
function renderAllMessages(snap) {
  lastMessagesSnap = snap;
  messagesEl.innerHTML = '';
  let lastDay = null;
  snap.forEach((docSnap) => {
    const msg = docSnap.data();
    if (!msg.createdAt) return; // 서버 타임스탬프 반영 전 임시 문서는 스킵
    const day = msg.createdAt.toDate().toLocaleDateString('ko-KR');
    if (day !== lastDay) {
      const divider = document.createElement('div');
      divider.className = 'day-divider';
      divider.textContent = day;
      messagesEl.appendChild(divider);
      lastDay = day;
    }
    renderMessage(msg, docSnap.id);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function rebuildMessagesView() {
  if (lastMessagesSnap) renderAllMessages(lastMessagesSnap);
}

function renderMessage(msg, msgId) {
  const mine = msg.senderId === currentUser.uid;
  const row = document.createElement('div');
  row.className = 'msg-row ' + (mine ? 'mine' : 'theirs');
  const time = msg.createdAt.toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  const col = document.createElement('div');
  col.className = 'msg-col';

  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (msg.imageUrl ? ' image-bubble' : '');

  if (msg.imageUrl) {
    const img = document.createElement('img');
    img.className = 'msg-image';
    img.src = msg.imageUrl;
    img.alt = '사진';
    img.addEventListener('click', () => window.open(msg.imageUrl, '_blank'));
    bubble.appendChild(img);
  } else {
    const textSpan = document.createElement('span');
    textSpan.className = 'msg-text';
    textSpan.textContent = msg.text;
    bubble.appendChild(textSpan);
    if (msg.edited) {
      const editedLabel = document.createElement('span');
      editedLabel.className = 'edited-label';
      editedLabel.textContent = '(수정됨)';
      bubble.appendChild(editedLabel);
    }
  }
  col.appendChild(bubble);

  // 수정된 텍스트 메시지: 원본은 숨겨두고, 말풍선을 탭하면 토글되어 보임
  if (msg.edited && !msg.imageUrl && msg.originalText) {
    bubble.classList.add('editable');
    bubble.title = '탭하면 원래 메시지를 볼 수 있어요';
    const originalEl = document.createElement('div');
    originalEl.className = 'original-text hidden';
    originalEl.textContent = '수정 전: ' + msg.originalText;
    bubble.addEventListener('click', () => originalEl.classList.toggle('hidden'));
    col.appendChild(originalEl);
  }

  // 내 텍스트 메시지에는 수정 버튼
  if (mine && !msg.imageUrl) {
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✎';
    editBtn.title = '메시지 수정';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditMessage(col, msg, msgId);
    });
    row.appendChild(editBtn);
  }

  row.appendChild(col);

  const timeEl = document.createElement('div');
  timeEl.className = 'msg-time';
  timeEl.textContent = time;
  row.appendChild(timeEl);

  messagesEl.appendChild(row);
}

function startEditMessage(col, msg, msgId) {
  const original = msg.text;
  col.innerHTML = '';

  const editRow = document.createElement('div');
  editRow.className = 'edit-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = original;
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '저장';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '취소';
  cancelBtn.style.background = 'var(--tint-2)';
  cancelBtn.style.color = 'var(--card-ink)';

  editRow.appendChild(input);
  editRow.appendChild(saveBtn);
  editRow.appendChild(cancelBtn);
  col.appendChild(editRow);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  cancelBtn.addEventListener('click', () => rebuildMessagesView());

  async function submitEdit() {
    const newText = input.value.trim();
    if (!newText || newText === original) {
      rebuildMessagesView();
      return;
    }
    saveBtn.disabled = true;
    try {
      const updateData = { text: newText, edited: true };
      // 최초 수정 시에만 원본을 저장 (이후 재수정해도 최초 원본을 유지)
      if (!msg.edited) updateData.originalText = original;
      await db.collection('rooms').doc(currentRoomId).collection('messages').doc(msgId).update(updateData);
      // Firestore 실시간 구독이 알아서 다시 그려줍니다.
    } catch (err) {
      console.error(err);
      alert('수정에 실패했어요: ' + err.message);
      rebuildMessagesView();
    }
  }
  saveBtn.addEventListener('click', submitEdit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitEdit(); });
}

// -------- 메시지 전송 --------
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentRoomId) return;
  messageInput.value = '';

  const roomRef = db.collection('rooms').doc(currentRoomId);
  await roomRef.collection('messages').add({
    text: text,
    senderId: currentUser.uid,
    senderName: currentUserData.nickname,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await roomRef.update({
    lastMessage: text,
    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// -------- 사진 전송 --------
attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  imageInput.value = '';
  if (!file || !currentRoomId) return;
  if (!storage) {
    alert('사진 업로드 기능을 쓸 수 없어요 (Firebase Storage 미설정). Firebase 콘솔에서 Storage를 먼저 활성화해주세요.');
    return;
  }
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 보낼 수 있어요.');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert('사진 용량은 8MB 이하로 올려주세요.');
    return;
  }

  uploadProgressEl.classList.remove('hidden');
  uploadProgressEl.textContent = '사진 업로드 중... 0%';

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `rooms/${currentRoomId}/${currentUser.uid}_${Date.now()}_${safeName}`;
    const ref = storage.ref().child(path);
    const task = ref.put(file);

    await new Promise((resolve, reject) => {
      task.on('state_changed', (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        uploadProgressEl.textContent = `사진 업로드 중... ${pct}%`;
      }, reject, resolve);
    });

    const url = await ref.getDownloadURL();

    const roomRef = db.collection('rooms').doc(currentRoomId);
    await roomRef.collection('messages').add({
      imageUrl: url,
      senderId: currentUser.uid,
      senderName: currentUserData.nickname,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await roomRef.update({
      lastMessage: '📷 사진',
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error(err);
    alert('사진 업로드에 실패했어요: ' + err.message);
  } finally {
    uploadProgressEl.classList.add('hidden');
  }
});

// -------- 뒤로가기 (모바일) --------
document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('hide-mobile');
  chatActive.classList.add('hidden');
  chatPaneEmpty.classList.remove('hidden');
});

// -------- 초대 모달 --------
const inviteModal = document.getElementById('inviteModal');
document.getElementById('inviteBtn').addEventListener('click', () => {
  document.getElementById('inviteUsername').value = '';
  document.getElementById('inviteError').style.display = 'none';
  inviteModal.classList.remove('hidden');
});
document.getElementById('cancelInvite').addEventListener('click', () => {
  inviteModal.classList.add('hidden');
});

document.getElementById('confirmInvite').addEventListener('click', async () => {
  const inviteErrorEl = document.getElementById('inviteError');
  inviteErrorEl.style.display = 'none';
  const target = document.getElementById('inviteUsername').value.trim().toLowerCase();

  if (!target) return;
  if (target === currentUserData.username) {
    inviteErrorEl.textContent = '자기 자신은 초대할 수 없어요.';
    inviteErrorEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('confirmInvite');
  btn.disabled = true;
  btn.textContent = '찾는 중...';

  try {
    const userQuery = await db.collection('users').where('username', '==', target).limit(1).get();
    if (userQuery.empty) {
      inviteErrorEl.textContent = '해당 아이디의 사용자를 찾을 수 없어요.';
      inviteErrorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '대화 시작';
      return;
    }
    const otherUid = userQuery.docs[0].id;
    const otherData = userQuery.docs[0].data();

    // 이미 존재하는 1:1 방이 있는지 확인
    const existingRooms = await db.collection('rooms')
      .where('members', 'array-contains', currentUser.uid)
      .get();
    let foundRoomId = null;
    let foundRoomData = null;
    existingRooms.forEach((docSnap) => {
      const r = docSnap.data();
      if (r.members.includes(otherUid) && r.members.length === 2) {
        foundRoomId = docSnap.id;
        foundRoomData = r;
      }
    });

    inviteModal.classList.add('hidden');
    btn.disabled = false;
    btn.textContent = '대화 시작';

    if (foundRoomId) {
      openRoom(foundRoomId, foundRoomData);
      return;
    }

    const newRoom = {
      members: [currentUser.uid, otherUid],
      memberNicknames: [currentUserData.nickname, otherData.nickname],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: '',
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const roomRef = await db.collection('rooms').add(newRoom);
    openRoom(roomRef.id, newRoom);
  } catch (err) {
    console.error(err);
    inviteErrorEl.textContent = '오류가 발생했어요: ' + err.message;
    inviteErrorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '대화 시작';
  }
});

// -------- 계정 설정 모달 (닉네임 변경 / 알림 / 탈퇴 진입점) --------
const settingsModal = document.getElementById('settingsModal');
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('settingsNickname').value = currentUserData.nickname || '';
  document.getElementById('settingsError').style.display = 'none';
  document.getElementById('settingsNotice').classList.add('hidden');
  refreshNotifStatus();
  settingsModal.classList.remove('hidden');
});
document.getElementById('closeSettings').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

// -------- 닉네임 변경 --------
document.getElementById('saveNicknameBtn').addEventListener('click', async () => {
  const newNick = document.getElementById('settingsNickname').value.trim();
  const errEl = document.getElementById('settingsError');
  const noticeEl = document.getElementById('settingsNotice');
  errEl.style.display = 'none';
  noticeEl.classList.add('hidden');

  if (!newNick) {
    errEl.textContent = '닉네임을 입력해주세요.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('saveNicknameBtn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    await db.collection('users').doc(currentUser.uid).update({ nickname: newNick });
    currentUserData.nickname = newNick;
    userCache[currentUser.uid] = currentUserData;
    document.getElementById('meNickname').textContent = newNick;

    // 내가 속한 방들의 캐시된 닉네임(memberNicknames)도 함께 갱신
    // (상대방 화면은 다음 방 목록 갱신 시 getUserLive를 통해 최신 값으로 자동 반영됩니다)
    const myRooms = await db.collection('rooms').where('members', 'array-contains', currentUser.uid).get();
    const batch = db.batch();
    myRooms.forEach((docSnap) => {
      const r = docSnap.data();
      const idx = r.members.indexOf(currentUser.uid);
      if (idx !== -1 && r.memberNicknames) {
        const updated = [...r.memberNicknames];
        updated[idx] = newNick;
        batch.update(docSnap.ref, { memberNicknames: updated });
      }
    });
    await batch.commit();

    noticeEl.textContent = '닉네임이 변경됐어요.';
    noticeEl.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    errEl.textContent = '변경에 실패했어요: ' + err.message;
    errEl.style.display = 'block';
  }
  btn.disabled = false;
  btn.textContent = '닉네임 저장';
});

// -------- 알림 (FCM) --------
function refreshNotifStatus() {
  const statusLabel = document.getElementById('notifStatusLabel');
  const btn = document.getElementById('enableNotifBtn');
  if (!('Notification' in window) || typeof firebase.messaging !== 'function') {
    statusLabel.textContent = '이 브라우저는 알림 미지원';
    btn.disabled = true;
    return;
  }
  if (Notification.permission === 'granted') {
    statusLabel.textContent = '기기 알림 켜짐';
    btn.textContent = '켜짐';
    btn.disabled = true;
  } else if (Notification.permission === 'denied') {
    statusLabel.textContent = '알림이 차단되어 있어요 (브라우저 설정에서 허용 필요)';
    btn.disabled = true;
  } else {
    statusLabel.textContent = '기기 알림 꺼짐';
    btn.textContent = '켜기';
    btn.disabled = false;
  }
}

document.getElementById('enableNotifBtn').addEventListener('click', async () => {
  const statusLabel = document.getElementById('notifStatusLabel');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      refreshNotifStatus();
      return;
    }
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      // ⚠️ Firebase 콘솔 > 프로젝트 설정 > Cloud Messaging > 웹 푸시 인증서에서 발급받은 값으로 교체하세요.
      vapidKey: 'PASTE_YOUR_VAPID_KEY_HERE',
      serviceWorkerRegistration: registration
    });
    if (token) {
      await db.collection('users').doc(currentUser.uid).update({
        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token)
      });
    }
    messaging.onMessage((payload) => {
      console.log('포그라운드 알림 수신:', payload);
    });
    refreshNotifStatus();
  } catch (err) {
    console.error(err);
    statusLabel.textContent = '알림 설정에 실패했어요';
    alert('알림 설정에 실패했어요: ' + err.message);
  }
});

// -------- 계정 탈퇴 --------
const withdrawModal = document.getElementById('withdrawModal');
document.getElementById('openWithdrawBtn').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  document.getElementById('withdrawPassword').value = '';
  document.getElementById('withdrawError').style.display = 'none';
  withdrawModal.classList.remove('hidden');
});
document.getElementById('cancelWithdraw').addEventListener('click', () => {
  withdrawModal.classList.add('hidden');
});

document.getElementById('confirmWithdraw').addEventListener('click', async () => {
  const pw = document.getElementById('withdrawPassword').value;
  const errEl = document.getElementById('withdrawError');
  errEl.style.display = 'none';

  if (!pw) {
    errEl.textContent = '비밀번호를 입력해주세요.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('confirmWithdraw');
  btn.disabled = true;
  btn.textContent = '처리 중...';

  try {
    // 최근 로그인이 오래됐으면 삭제가 거부되므로, 비밀번호로 재인증부터 합니다.
    const cred = firebase.auth.EmailAuthProvider.credential(usernameToEmail(currentUserData.username), pw);
    await currentUser.reauthenticateWithCredential(cred);

    const usernameKey = currentUserData.username;
    await db.collection('usernames').doc(usernameKey).delete();
    await db.collection('users').doc(currentUser.uid).delete();
    await currentUser.delete();

    window.location.href = 'index.html';
  } catch (err) {
    console.error(err);
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
      errEl.textContent = '비밀번호가 올바르지 않아요.';
    } else {
      errEl.textContent = '탈퇴에 실패했어요: ' + err.message;
    }
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '탈퇴하기';
  }
});

// -------- 관리자 (doby 계정 전용) --------
function checkAdmin() {
  if (currentUserData && currentUserData.username === 'doby') {
    document.getElementById('adminBtn').classList.remove('hidden');
  }
}

const adminModal = document.getElementById('adminModal');
document.getElementById('adminBtn').addEventListener('click', openAdminPanel);
document.getElementById('closeAdmin').addEventListener('click', () => {
  adminModal.classList.add('hidden');
});

async function openAdminPanel() {
  adminModal.classList.remove('hidden');
  const listEl = document.getElementById('adminUserList');
  listEl.textContent = '불러오는 중...';
  try {
    const snap = await db.collection('users').get();
    if (snap.empty) {
      listEl.textContent = '사용자가 없어요.';
      return;
    }
    listEl.innerHTML = '';
    snap.forEach((docSnap) => {
      const u = docSnap.data();
      const last = (u.lastLoginAt && u.lastLoginAt.toDate) ? u.lastLoginAt.toDate().toLocaleString('ko-KR') : '기록 없음';
      const historyCount = (u.loginHistory || []).length;
      const card = document.createElement('div');
      card.className = 'admin-user-card';
      card.innerHTML = `
        <div class="au-name">${escapeHtml(u.nickname || '(닉네임 없음)')} <span style="color:var(--card-ink-soft);font-weight:400;">@${escapeHtml(u.displayUsername || u.username || '')}</span></div>
        <div class="au-meta">최근 로그인: ${escapeHtml(last)} · 총 로그인 ${historyCount}회${u.email ? ' · ' + escapeHtml(u.email) : ''}</div>
      `;
      listEl.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    listEl.textContent = '불러오지 못했어요: ' + err.message;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
