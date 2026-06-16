// handlers/directCallHandler.js

// ====================================
// 개인 1:1 통화 핸들러
// mainSocket(메인 네임스페이스)에서 동작
// ====================================
const { emitToUser } = require('../utils/socketHelpers');

const activeDirectCalls = new Map(); // callId -> { callerId, callerName, receiverId, receiverName, status }

function generateCallId(userA, userB) {
  return [userA, userB].sort().join('::');
}

function setupDirectCallHandler(io, socket, session, usersInfo) {

  // ─────────────────────────────────────
  // 1) 통화 요청 (발신: admin → client)
  // ─────────────────────────────────────
  socket.on('request-direct-call', (data, ack) => {
    const callerId = session.userId;
    const callerName = data.callerName || session.userName || 'Admin';
    const receiverId = data.targetUserId;

    if (!receiverId) {
      return ack?.({ success: false, message: '대상 유저가 지정되지 않았습니다.' });
    }

    if (callerId === receiverId) {
      return ack?.({ success: false, message: '자기 자신에게 전화할 수 없습니다.' });
    }

    const callId = generateCallId(callerId, receiverId);

    // 이미 통화 중인지 확인
    if (activeDirectCalls.has(callId)) {
      const existing = activeDirectCalls.get(callId);
      if (existing.status === 'ringing' || existing.status === 'connected') {
        return ack?.({ success: false, message: '이미 통화 중이거나 요청 대기 중입니다.' });
      }
    }

    // 수신자 소켓 찾기
    const receiverInfo = usersInfo.get(receiverId);
    if (!receiverInfo || (!receiverInfo.mainSocketId && !receiverInfo.projectSocketId)) {
      return ack?.({ success: false, message: '상대방이 오프라인입니다.' });
    }

    // 통화 레코드 생성
    activeDirectCalls.set(callId, {
      callId,
      callerId,
      callerName,
      receiverId,
      receiverName: null, // 수락 시 채워짐
      status: 'ringing',
      createdAt: Date.now(),
    });

    // 수신자에게 전화 알림
    const sent = emitToUser(io, usersInfo, receiverId, 'incoming-direct-call', {
      callId,
      callerId,
      callerName,
    });

    if (!sent) {
      activeDirectCalls.delete(callId);
      return ack?.({ success: false, message: '상대방에게 연결할 수 없습니다.' });
    }

    console.log(`📞 [Direct Call] ${callerName}(${callerId}) → ${receiverId} | callId=${callId}`);

    // 30초 타임아웃
    setTimeout(() => {
      const call = activeDirectCalls.get(callId);
      if (call && call.status === 'ringing') {
        activeDirectCalls.delete(callId);
        emitToUser(io, usersInfo, callerId, 'direct-call-timeout', { callId, receiverId });
        emitToUser(io, usersInfo, receiverId, 'direct-call-cancelled', { callId, callerId });
        console.log(`⏰ [Direct Call] 타임아웃: callId=${callId}`);
      }
    }, 30000);

    ack?.({ success: true, callId });
  });

  // ─────────────────────────────────────
  // 2) 통화 수락 (수신: client → admin)
  // ─────────────────────────────────────
  socket.on('accept-direct-call', (data, ack) => {
    const { callId } = data;
    const receiverId = session.userId;
    const receiverName = data.receiverName || session.userName || 'User';

    const call = activeDirectCalls.get(callId);
    if (!call || call.status !== 'ringing') {
      return ack?.({ success: false, message: '유효하지 않은 통화입니다.' });
    }
    if (call.receiverId !== receiverId) {
      return ack?.({ success: false, message: '권한이 없습니다.' });
    }

    call.status = 'connected';
    call.receiverName = receiverName;

    // ★ 발신자에게 수락 알림
    emitToUser(io, usersInfo, call.callerId, 'direct-call-accepted', {
      callId,
      receiverId,
      receiverName,
    });

    console.log(`✅ [Direct Call] 수락: ${receiverName}(${receiverId}) | callId=${callId}`);
    ack?.({ success: true, callId });
  });

  // ─────────────────────────────────────
  // 3) 통화 거절
  // ─────────────────────────────────────
  socket.on('reject-direct-call', (data, ack) => {
    const { callId } = data;
    const receiverId = session.userId;

    const call = activeDirectCalls.get(callId);
    if (!call || call.receiverId !== receiverId) {
      return ack?.({ success: false, message: '유효하지 않은 통화입니다.' });
    }

    activeDirectCalls.delete(callId);

    emitToUser(io, usersInfo, call.callerId, 'direct-call-rejected', {
      callId,
      receiverId,
      receiverName: data.receiverName || 'User',
    });

    console.log(`❌ [Direct Call] 거절: ${receiverId} | callId=${callId}`);
    ack?.({ success: true });
  });

  // ─────────────────────────────────────
  // 4) 통화 종료 (어느 쪽이든)
  // ─────────────────────────────────────
  socket.on('end-direct-call', (data, ack) => {
    const { callId } = data;
    const endedBy = session.userId;

    const call = activeDirectCalls.get(callId);
    if (!call) {
      return ack?.({ success: false, message: '유효하지 않은 통화입니다.' });
    }

    activeDirectCalls.delete(callId);

    const otherId = (call.callerId === endedBy) ? call.receiverId : call.callerId;
    emitToUser(io, usersInfo, otherId, 'direct-call-ended', {
      callId,
      endedBy,
      endedByName: (call.callerId === endedBy) ? call.callerName : call.receiverName,
    });

    console.log(`🔴 [Direct Call] 종료: by ${endedBy} | callId=${callId}`);
    ack?.({ success: true });
  });

  // ─────────────────────────────────────
  // 5) 통화 취소 (발신자가 수신 전에 취소)
  // ─────────────────────────────────────
  socket.on('cancel-direct-call', (data, ack) => {
    const { callId } = data;
    const callerId = session.userId;

    const call = activeDirectCalls.get(callId);
    if (!call || call.callerId !== callerId) {
      return ack?.({ success: false, message: '유효하지 않은 통화입니다.' });
    }

    activeDirectCalls.delete(callId);

    emitToUser(io, usersInfo, call.receiverId, 'direct-call-cancelled', {
      callId,
      callerId,
      callerName: call.callerName,
    });

    console.log(`🚫 [Direct Call] 취소: ${callerId} | callId=${callId}`);
    ack?.({ success: true });
  });

  // ─────────────────────────────────────
  // 6) WebRTC 시그널링 (메인 소켓 경유)
  // ─────────────────────────────────────
  socket.on('direct-webrtc-offer', (data) => {
    const { callId, to, offer } = data;
    const from = session.userId;
    emitToUser(io, usersInfo, to, 'direct-webrtc-offer', { callId, from, offer });
  });

  socket.on('direct-webrtc-answer', (data) => {
    const { callId, to, answer } = data;
    const from = session.userId;
    emitToUser(io, usersInfo, to, 'direct-webrtc-answer', { callId, from, answer });
  });

  socket.on('direct-webrtc-ice-candidate', (data) => {
    const { callId, to, candidate } = data;
    const from = session.userId;
    emitToUser(io, usersInfo, to, 'direct-webrtc-ice-candidate', { callId, from, candidate });
  });

  // ─────────────────────────────────────
  // 7) 연결 해제 시 정리
  // ─────────────────────────────────────
  socket.on('disconnect', () => {
    const userId = session.userId;
    for (const [callId, call] of activeDirectCalls.entries()) {
      if (call.callerId === userId || call.receiverId === userId) {
        activeDirectCalls.delete(callId);

        const otherId = (call.callerId === userId) ? call.receiverId : call.callerId;
        emitToUser(io, usersInfo, otherId, 'direct-call-ended', {
          callId,
          endedBy: userId,
          endedByName: (call.callerId === userId) ? call.callerName : call.receiverName,
          reason: 'disconnected',
        });

        console.log(`🔌 [Direct Call] 연결 해제로 통화 종료: ${userId} | callId=${callId}`);
      }
    }
  });
}

module.exports = { setupDirectCallHandler };
