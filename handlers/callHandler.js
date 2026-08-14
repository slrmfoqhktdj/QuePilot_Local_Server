const crypto = require('crypto');
const JsonBuilder = require('../utils/jsonBuilder');

// 방별 통화 상태 관리
const roomCalls = new Map(); // roomId => { callId, participants: Map<socketId, {userName, isMuted}> }

async function initCallEvents(socket, namespace, usersInfo, projectId) {
  const session = socket.handshake.session;

  console.log(`📞 [통화] 핸들러 초기화 - Socket: ${session.userId}, Project: ${projectId}`);

  // 🔧 진행 중인 통화 조회
  socket.on('get-active-call', async (data, callback) => {
    const { roomId } = data;
    const call = roomCalls.get(roomId);

    if (call && call.participants.size > 0) {
      const participants = Array.from(call.participants.entries()).map(
        ([userId, info]) => (JsonBuilder.createCallParticipant({
          userId,
          userName: info.userName,
          isMuted: info.isMuted,
        }))
      );

      console.log(`📞 [통화 조회] Room: ${roomId}, 참여자: ${call.participants.size}명`);
      
      callback({
        success: true,
        hasActiveCall: true,
        callId: call.callId,
        participants,
        totalParticipants: call.participants.size,
      });
    } else {
      callback({
        success: true,
        hasActiveCall: false,
      });
    }
  });

  // 🔧 통화 참여
  socket.on('join-room-call', async (data, callback) => {
    const session = socket.handshake.session;

    const clientInfo = usersInfo.get(session.userId);
    if (!clientInfo) {
      return callback({ success: false, message: '클라이언트 정보를 찾을 수 없습니다' });
    }

    const { roomId, isMuted } = data;

    // 통화방이 없으면 생성
    if (!roomCalls.has(roomId)) {
      const callId = crypto.randomUUID();
      roomCalls.set(roomId, {
        callId,
        participants: new Map(),
        createdAt: new Date(),
      });
      console.log(`📞 [통화 생성] Room: ${roomId}, CallId: ${callId}`);
    }

    const call = roomCalls.get(roomId);

    // 이미 참여 중이면 중복 방지
    if (call.participants.has(session.userId)) {
      return callback({ success: false, message: '이미 통화에 참여 중입니다' });
    }

    // 참여자 추가
    call.participants.set(session.userId, JsonBuilder.createCallParticipant({
      userId: session.userId,
      userName: clientInfo.userName,
      isMuted: isMuted,
    }));

    console.log(
      `📞 [통화 참여] User: ${clientInfo.userName}, Room: ${roomId}, 총 참여자: ${call.participants.size}명`
    );

    // 기존 참여자 목록 (WebRTC 연결용)
    const existingParticipants = Array.from(call.participants.entries())
      .filter(([id]) => id !== session.userId)
      .map(([userId, info]) => (JsonBuilder.createCallParticipant({
        userId,
        userName: info.userName,
        isMuted: info.isMuted,
      })));

    // 방의 모든 멤버에게 참여자 업데이트 브로드캐스트
    const allParticipants = Array.from(call.participants.entries()).map(
      ([userId, info]) => (JsonBuilder.createCallParticipant({
        userId,
        // socketId: info.socketId,
        userName: info.userName,
        isMuted: info.isMuted,
      }))
    );

    namespace.to(roomId).emit('call-participants-updated', {
      participants: allParticipants,
      totalParticipants: call.participants.size,
    });

    // 개별 알림
    socket.to(roomId).emit('user-joined-call', {
      userId: session.userId,
      // socketId: socket.id,
      username: clientInfo.userName,
    });

    callback({
      success: true,
      callId: call.callId,
      participants: allParticipants,
      totalParticipants: call.participants.size,
      existingParticipants, // WebRTC 연결 대상
    });
  });

  // 🔧 통화 나가기
  socket.on('leave-room-call', async (data, callback) => {
    const session = socket.handshake.session;
    const clientInfo = usersInfo.get(session.userId);
    const { roomId } = data;
    const call = roomCalls.get(roomId);

    if (!call || !call.participants.has(session.userId)) {
      return callback({ success: false, message: '통화에 참여하지 않았습니다' });
    }

    // 참여자 제거
    call.participants.delete(session.userId);

    console.log(
      `📞 [통화 나감] User: ${clientInfo?.userName}, Room: ${roomId}, 남은 참여자: ${call.participants.size}명`
    );

    // 방의 모든 멤버에게 업데이트
    const allParticipants = Array.from(call.participants.entries()).map(
      ([userId, info]) => (JsonBuilder.createCallParticipant({
        userId,
        // socketId: info.socketId,
        userName: info.userName,
        isMuted: info.isMuted,
      }))
    );

    namespace.to(roomId).emit('call-participants-updated', {
      participants: allParticipants,
      totalParticipants: call.participants.size,
    });

    socket.to(roomId).emit('user-left-call', {
      userId: session.userId,
      username: clientInfo?.userName || 'Unknown',
    });

    // 참여자가 모두 나가면 통화 종료
    if (call.participants.size === 0) {
      console.log(`📞 [통화 종료] Room: ${roomId}`);
      roomCalls.delete(roomId);
    }

    callback({ success: true });
  });

  // 🔧 음소거 상태 업데이트
  socket.on('toggle-mute', (data) => {
    const session = socket.handshake.session;
    const { roomId, isMuted } = data;
    const call = roomCalls.get(roomId);

    if (call && call.participants.has(session.userId)) {
      call.participants.get(session.userId).isMuted = isMuted;

      // 방의 다른 멤버들에게 브로드캐스트
      socket.to(roomId).emit('peer-mute-changed', {
        userId: session.userId,
        // socketId: socket.id,
        isMuted,
      });

      console.log(`🔇 [음소거] User: ${session.userId}, Room: ${roomId}, Muted: ${isMuted}`);
    }
  });

  // 🔧 WebRTC Signaling: Offer
  socket.on('webrtc-offer', (data) => {
    const session = socket.handshake.session;
    
    const { to, offer } = data;
    // console.log(`🔗 [WebRTC Offer] ${session.userId} → ${to}`);

    const clientInfo = usersInfo.get(session.userId);
    if (!clientInfo) return;

    const targetInfo = usersInfo.get(to);
    const targetSocketId = targetInfo?.projectSocketId;
    const targetSocket = targetSocketId ? namespace.sockets.get(targetSocketId) : null;

    if (targetSocket && targetSocket.connected) {
      namespace.to(targetSocketId).emit('webrtc-offer', {
        from: session.userId,
        fromUsername: clientInfo.userName,
        offer: offer,
      });
      // console.log(`✅ Offer 전달 완료: ${session.userId} → ${to} (socket: ${targetSocketId})`);
    } else {
      console.log(`❌ 대상 소켓 없음 또는 연결 끊김: userId=${to}, socketId=${targetSocketId}`);
      
      // ✅ 발신자에게 실패 알림
      // socket.emit('webrtc-error', {
      //   type: 'offer-failed',
      //   target: to,
      //   message: '대상 사용자가 연결되어 있지 않습니다',
      // });
    }
  });

  // 🔧 WebRTC Signaling: Answer
  socket.on('webrtc-answer', (data) => {
    const session = socket.handshake.session;
    
    const { to, answer } = data;
    // console.log(`🔗 [WebRTC Answer] ${session.userId} → ${to}`);

    const targetInfo = usersInfo.get(to);
    const targetSocketId = targetInfo?.projectSocketId;
    const targetSocket = targetSocketId ? namespace.sockets.get(targetSocketId) : null;

    if (targetSocket && targetSocket.connected) {
      namespace.to(targetSocketId).emit('webrtc-answer', {
        from: session.userId,
        answer: answer,
      });
      // console.log(`✅ Answer 전달 완료: ${session.userId} → ${to} (socket: ${targetSocketId})`);
    } else {
      console.log(`❌ 대상 소켓 없음: userId=${to}, socketId=${targetSocketId}`);

      // ✅ 발신자에게 실패 알림
      // socket.emit('webrtc-error', {
      //   type: 'answer-failed',
      //   target: to,
      //   message: '대상 사용자가 연결되어 있지 않습니다',
      // });
    }
  });

  // 🔧 WebRTC Signaling: ICE Candidate
  socket.on('webrtc-ice-candidate', (data) => {
    const session = socket.handshake.session;

    const { to, candidate } = data;
    // console.log(`🧊 [WebRTC ICE] ${session.userId} → ${to}`);

    const targetInfo = usersInfo.get(to);
    const targetSocketId = targetInfo?.projectSocketId;
    const targetSocket = targetSocketId ? namespace.sockets.get(targetSocketId) : null;

    if (targetSocket && targetSocket.connected) {
      namespace.to(targetSocketId).emit('webrtc-ice-candidate', {
        from: session.userId,
        candidate: candidate,
      });
      // console.log(`✅ ICE 전달 완료: ${session.userId} → ${to} (socket: ${targetSocketId})`);
    } else {
      console.log(`❌ 대상 소켓 없음: userId=${to}, socketId=${targetSocketId}`);
    }
  });

  // 🔧 연결 해제 시 통화에서 자동 제거
  socket.on('disconnect', () => {
    const session = socket.handshake.session;
    
    roomCalls.forEach((call, roomId) => {
      if (call.participants.has(session.userId)) {
        const clientInfo = usersInfo.get(session.userId);
        call.participants.delete(session.userId);

        const allParticipants = Array.from(call.participants.entries()).map(
          ([userId, info]) => (JsonBuilder.createCallParticipant({
            userId,
            userName: info.userName,
            isMuted: info.isMuted,
          }))
        );

        namespace.to(roomId).emit('call-participants-updated', {
          participants: allParticipants,
          totalParticipants: call.participants.size,
        });

        socket.to(roomId).emit('user-left-call', {
          userId: session.userId,
          // socketId: socket.id,
          username: clientInfo?.userName || 'Unknown',
        });

        console.log(`📞 [연결 해제로 통화 나감] User: ${clientInfo?.userName}, Room: ${roomId}`);

        if (call.participants.size === 0) {
          roomCalls.delete(roomId);
          console.log(`📞 [통화 종료] Room: ${roomId}`);
        }
      }
    });
  });







  // 🔧 1:1 개인통화 이벤트 처리  -------------------------------------------------






  // // 🔧 개인 통화 요청
  // socket.on('request-direct-call', (data, callback) => {
  //   const { targetUserId, callerName } = data;
  //   console.log(`📞 [DirectCall] 통화 요청: ${socket.id} → ${targetUserId}`);

  //   // ✅ 대상 사용자의 소켓 찾기
  //   const targetClient = Array.from(clients.values()).find(
  //     (client) => client.userId === targetUserId
  //   );

  //   if (!targetClient) {
  //     console.log(`❌ 대상 사용자 오프라인: ${targetUserId}`);
  //     callback({
  //       success: false,
  //       message: '대상 사용자가 접속 중이 아닙니다.',
  //     });
  //     return;
  //   }

  //   const targetSocketId = targetClient.socketId;
  //   const targetSocket = namespace.sockets.get(targetSocketId);

  //   if (!targetSocket || !targetSocket.connected) {
  //     console.log(`❌ 대상 소켓 연결 안 됨: ${targetSocketId}`);
  //     callback({
  //       success: false,
  //       message: '대상 사용자와 연결할 수 없습니다.',
  //     });
  //     return;
  //   }

  //   // ✅ 대상 사용자에게 통화 요청 전송
  //   targetSocket.emit('incoming-direct-call', {
  //     callerId: socket.id,
  //     callerUserId: clients.get(socket.id)?.userId,
  //     callerName: callerName,
  //   });

  //   console.log(`✅ 통화 요청 전송: ${socket.id} → ${targetSocketId}`);
  //   callback({
  //     success: true,
  //     message: '통화 요청을 전송했습니다.',
  //     targetSocketId: targetSocketId,
  //   });
  // });

  // // 🔧 통화 수락
  // socket.on('accept-direct-call', (data, callback) => {
  //   const { callerId } = data;
  //   console.log(`📞 [DirectCall] 통화 수락: ${socket.id} ← ${callerId}`);

  //   const callerSocket = namespace.sockets.get(callerId);

  //   if (!callerSocket || !callerSocket.connected) {
  //     console.log(`❌ 발신자 소켓 없음: ${callerId}`);
  //     callback({ success: false, message: '발신자와 연결할 수 없습니다.' });
  //     return;
  //   }

  //   // ✅ 발신자에게 수락 알림
  //   callerSocket.emit('direct-call-accepted', {
  //     receiverId: socket.id,
  //     receiverUserId: clients.get(socket.id)?.userId,
  //     receiverName: clients.get(socket.id)?.userName,
  //   });

  //   console.log(`✅ 통화 수락 알림: ${socket.id} → ${callerId}`);
  //   callback({ success: true, message: '통화가 연결되었습니다.' });
  // });

  // // 🔧 통화 거절
  // socket.on('reject-direct-call', (data, callback) => {
  //   const { callerId } = data;
  //   console.log(`📞 [DirectCall] 통화 거절: ${socket.id} ← ${callerId}`);

  //   const callerSocket = namespace.sockets.get(callerId);

  //   if (callerSocket && callerSocket.connected) {
  //     callerSocket.emit('direct-call-rejected', {
  //       receiverId: socket.id,
  //       receiverName: clients.get(socket.id)?.userName,
  //     });
  //     console.log(`✅ 통화 거절 알림: ${socket.id} → ${callerId}`);
  //   }

  //   callback({ success: true, message: '통화를 거절했습니다.' });
  // });

  // // 🔧 통화 종료
  // socket.on('end-direct-call', (data) => {
  //   const { targetId } = data;
  //   console.log(`📞 [DirectCall] 통화 종료: ${socket.id} ↔ ${targetId}`);

  //   const targetSocket = namespace.sockets.get(targetId);

  //   if (targetSocket && targetSocket.connected) {
  //     targetSocket.emit('direct-call-ended', {
  //       endedBy: socket.id,
  //       endedByName: clients.get(socket.id)?.userName,
  //     });
  //     console.log(`✅ 통화 종료 알림: ${socket.id} → ${targetId}`);
  //   }
  // });

  // // 🔧 연결 해제 시 통화 중이면 상대방에게 알림
  // socket.on('disconnect', () => {
  //   console.log(`📞 [DirectCall] 소켓 연결 해제: ${socket.id}`);
    
  //   // 통화 중이던 모든 상대방에게 종료 알림
  //   // (실제 구현 시 통화 상태 추적 필요)
  // });







}

// 통화 상태 조회
function getCallStats() {
  const stats = [];
  roomCalls.forEach((call, roomId) => {
    stats.push({
      roomId,
      callId: call.callId,
      participants: call.participants.size,
      createdAt: call.createdAt,
    });
  });
  return stats;
}

module.exports = { initCallEvents, getCallStats };
