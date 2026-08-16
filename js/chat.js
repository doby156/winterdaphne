let currentUser = null;
let currentUserData = null;
let currentRoomId = null;
let messagesUnsub = null;
let roomsUnsub = null;

const roomListEl = document.getElementById('roomList');
const chatPaneEmpty = document.getElementById('chatPaneEmpty');
const chatActive = document.getElementById('chatActive');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const chatRoomName = document.getElementById('chatRoomName');

// -------- 로그인 여부 확인 --------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  const doc = await db.collection('users').doc(user.uid).get();
  currentUserData = doc.data();
  document.getElementById('meNickname').textContent = currentUserData.nickname;
  document.getElementById('meUsername').textContent = '@' + currentUserData.displayUsername;
  listenRooms();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  auth.signOut();
});

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
        const otherName = getOtherMemberName(room);
        const item = document.createElement('div');
        item.className = 'room-item' + (docSnap.id === currentRoomId ? ' active' : '');
        item.innerHTML = `
          <div class="avatar">${otherName.charAt(0).toUpperCase()}</div>
          <div class="room-meta">
            <div class="room-name">${escapeHtml(otherName)}</div>
            <div class="room-last">${escapeHtml(room.lastMessage || '대화를 시작해보세요')}</div>
          </div>
        `;
        item.addEventListener('click', () => openRoom(docSnap.id, room));
        roomListEl.appendChild(item);
      });
    }, (err) => {
      console.error(err);
      roomListEl.innerHTML = '<div class="empty-note">방 목록을 불러오지 못했어요.</div>';
    });
}

function getOtherMemberName(room) {
  const idx = room.members.indexOf(currentUser.uid);
  const otherIdx = idx === 0 ? 1 : 0;
  return (room.memberNicknames && room.memberNicknames[otherIdx]) || '상대방';
}

// -------- 방 열기 --------
function openRoom(roomId, roomData) {
  currentRoomId = roomId;
  chatPaneEmpty.classList.add('hidden');
  chatActive.classList.remove('hidden');
  chatRoomName.textContent = getOtherMemberName(roomData);
  document.getElementById('sidebar').classList.add('hide-mobile');

  document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));

  if (messagesUnsub) messagesUnsub();
  messagesEl.innerHTML = '';

  messagesUnsub = db.collection('rooms').doc(roomId).collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot((snap) => {
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
        renderMessage(msg);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
}

function renderMessage(msg) {
  const mine = msg.senderId === currentUser.uid;
  const row = document.createElement('div');
  row.className = 'msg-row ' + (mine ? 'mine' : 'theirs');
  const time = msg.createdAt.toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  row.innerHTML = `
    <div class="bubble">${escapeHtml(msg.text)}</div>
    <div class="msg-time">${time}</div>
  `;
  messagesEl.appendChild(row);
}

// -------- 메시지 전송 --------
document.getElementById('sendBtn').addEventListener('click', sendMessage);
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
