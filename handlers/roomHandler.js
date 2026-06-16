const rooms_dbcontrol = require('../db/controls/roomscontrols');
const timeline_dbcontrol = require('../db/controls/timelinecontrols');
const user_dbcontrol = require('../db/controls/usercontrols');
const message_dbcontrol = require('../db/controls/messagescontrols');
const JsonBuilder = require('../utils/jsonBuilder');

const {initCallEvents, getCallStats} = require('./callHandler');


// const rooms = new Map();
// const maxMessages = 30; // 각 방당 최대 메시지 수

async function createRoom(id , name, projectId, rooms) {
  rooms.set(id, {
    id: id,
    name: name,
    projectId: projectId,
    members: [],
  });
  return await rooms_dbcontrol.createRoom(id , name, projectId);
}

async function deleteRoom(roomId, rooms) {

  const room = rooms.get(roomId);
  if (room) {
    await rooms_dbcontrol.deleteRoomById(roomId);
    console.log(`방 ${roomId}이 삭제되었습니다.`);
  }

  return rooms.delete(roomId);
}


async function updateRoom(roomId, newName, rooms) {

  const room = rooms.get(roomId);
  if (room) {
    rooms.set(roomId, {
      id: roomId,
      name: newName,
      projectId: room.projectId,
      members: room.members,
    });
    await rooms_dbcontrol.updateRoom(roomId, newName);

    console.log(`방 ${roomId}의 이름이 ${newName}(으)로 변경되었습니다.`);
  }
}


async function initRoomEvents(socket, namespace, usersInfo, projectId , roomslist, rooms) {

  console.log(`[프로젝트 ${projectId}] 방 이벤트 초기화 initRoomEvents 실행 ${rooms}`);


  roomslist.forEach(room => {
    if(!rooms.has(room.id)){
      rooms.set(room.id, {
        id: room.id,
        name: room.name,
        projectId: room.projectId,
        members: [],
        // messages: []
      });
    }
  
  });


  // 방에 입장
  socket.on('join-room', async (data, callback) => {
    const session = socket.handshake.session;

    const roomId = data.roomId;
    const room = rooms.get(roomId);

    if (!room) {
      callback({ success: false, message: '방이 존재하지 않습니다.' });
      return;
    }

    socket.join(roomId);
    room.members.push(session.userId);

    console.log(room.members);

    // clients.set(socket.id, {
    //   roomId: roomId,
    //   userName: data.userName,
    //   socketId: socket.id,
    //   projectId: projectId
    // });

    const existingUser = usersInfo.get(session.userId);
    if (existingUser) {
      console.log(`기존 사용자 정보 업데이트: ${existingUser.userName}`);
      usersInfo.set(session.userId, {
        ...existingUser,
        roomId: roomId,
        projectId: projectId
      });
    }

    // 방의 모든 사용자에게 새로운 사용자 입장 알림
    namespace.to(roomId).emit('user-joined', JsonBuilder.createRoomUserJoinLeave({
      userId: session.userId,
      userName: data.userName,
      totalMembers: room.members.length,
      timestamp: new Date()
    }));

    // await _saveRoomMessage(roomId,  null, data.userName, `${data.userName}이 방 ${roomId}에 입장했습니다.`);

    console.log(`[프로젝트 ${projectId}] ${data.userName}이 방 ${roomId}에 입장 : ${session.userId}}`);
    callback({ 
      success: true, 
      message: '방에 입장했습니다.', 
      members: room.members.map(id => {
        const client = usersInfo.get(id);
        console.log(`멤버 ID: ${id}, 클라이언트 정보:`, client);
        return { userId: id, userName: client?.userName || 'Unknown' };
      }),
      // messages: room.messages
    });
  });

  socket.on('get-timeline', async (data, callback) => {
    console.log(`[프로젝트 ${projectId}] 타임라인 요청`);

    await timeline_dbcontrol.getTimelinesByUser(projectId,data.roomId).then(timeline => {
      console.log(`프로젝트 타임라인 조회 성공`);
      callback({ success: true, timeline: timeline });
    }).catch(err => {
      console.log(`프로젝트 타임라인 조회 실패:`, err);
      callback({ success: false, timeline: null });
    });
    
  }); 

  socket.on('get-messages-room', async (data, callback) => {
    console.log(`[프로젝트 ${projectId}] 방 ${data.roomId} 메시지 요청`);

    await message_dbcontrol.getRoomMessagesByRoomId(data.roomId).then(messages => {
      const roomMessages = messages.map(msg => ({
        fromUserId: msg.from_user_id,
        fromUsername: msg.from_user_name || 'unknown',
        message: msg.message,
        timestamp: msg.timestamp,
      }));


      console.log(`방 ${data.roomId} 메시지 조회 성공`);
      callback({ success: true, messages: roomMessages });
    }).catch(err => {
      console.log(`방 ${data.roomId} 메시지 조회 실패:`, err);
      callback({ success: false, messages: null });
    });
  });


  // // WebRTC 오퍼 전송
  // socket.on('webrtc-offer', (data) => {
  //   const session = socket.handshake.session;
    
  //   const clientInfo = usersInfo.get(session.userId);
  //   if (!clientInfo) return;

  //   namespace.to(clientInfo.roomId).emit('webrtc-offer', {
  //     from: session.userId,
  //     fromUsername: clientInfo.userName,
  //     offer: data.offer
  //   });
  // });

  // // WebRTC 답변 전송
  // socket.on('webrtc-answer', (data) => {
  //   const session = socket.handshake.session;

  //   namespace.to(data.to).emit('webrtc-answer', {
  //     from: session.userId,
  //     answer: data.answer
  //   });
  // });

  // // ICE 후보 전송
  // socket.on('ice-candidate', (data) => {
  //   const session = socket.handshake.session;

  //   namespace.to(data.to).emit('ice-candidate', {
  //     from: session.userId,
  //     candidate: data.candidate
  //   });
  // });


  // 채팅 메시지 전송
  socket.on('send-message', async (data) => {
    const session = socket.handshake.session;

    const clientInfo = usersInfo.get(session.userId);
    if (!clientInfo) return;

    const roomId = clientInfo.roomId;

    // const message = {
    //   socketId: socket.id,
    //   fromUsername: clientInfo.userName,
    //   message: data.message,
    //   timestamp: new Date()
    // };

    const message = JsonBuilder.createMessage({
      // toUserId: null,
      // toUsername: null,
      fromUserId: session.userId,
      fromUsername: clientInfo.userName,
      message: data.message,
      timestamp: new Date(),
    });

    // await _saveRoomMessage(roomId, socket.id, clientInfo.userName, data.message);

    namespace.to(roomId).emit('receive-message', message);

    // DB에 채팅 메시지 저장
    message_dbcontrol.insertRoomMessages(roomId, session.userId, data.message);

    console.log(`[프로젝트 ${projectId}] 메시지: ${data.message}`);
  });

  // 방 정보 및 권한 조회
  socket.on('get-room-info', async (data, callback) => {
    const room = rooms.get(data.roomId);
    if (!room) {
      callback({ success: false });
      return;
    }

    const memberDetails = room.members.map(memberId => {
      const client = usersInfo.get(memberId);
      return {
        userId: memberId,
        // socketId: client ? client.socketId : 'Unknown',
        userName: client ? client.userName : 'Unknown'
      };
    });


    callback({ 
      success: true, 
      myAuth : await user_dbcontrol.getBoolUserRoomAuthByIds(data.roomId, data.userId),
      room: {
        id: room.id,
        name: room.name,
        members: memberDetails,
        totalMembers: room.members.length
      }
    });
  });

  // 방 나가기
  socket.on('leave-room', async (data) => {
    const session = socket.handshake.session;

    const clientInfo = usersInfo.get(session.userId);
    if (!clientInfo) return;

    const roomId = clientInfo.roomId;
    if(!roomId) return;

    const room = rooms.get(roomId);

    if (room) {
      const index = room.members.indexOf(session.userId);
      if (index > -1) {
        room.members.splice(index, 1);
      }

      // await _saveRoomMessage(roomId, null , clientInfo.userName, `${clientInfo.userName}이 방을 나가셨습니다.`);

      // 방의 다른 사용자에게 사용자 퇴장 알림
      namespace.to(roomId).emit('user-left', JsonBuilder.createRoomUserJoinLeave({
        userId: session.userId,
        userName: clientInfo.userName,
        totalMembers: room.members.length,
        timestamp: new Date()
      }));

      // 방이 비었으면 삭제
      // if (room.members.length === 0) {
      //   rooms.delete(roomId);
      //   console.log(`[프로젝트 ${projectId}] 방 삭제됨: ${roomId}`);
      // }
    }

    usersInfo.set(session.userId, {
      ...clientInfo,
      roomId: null,
    });

    socket.leave(roomId);
    console.log(`[프로젝트 ${projectId}] ${clientInfo.userName}이 방 ${roomId}을 나감`);


  });

  // 연결 해제
  socket.on('disconnect', () => {
    const session = socket.handshake.session;

    const clientInfo = usersInfo.get(session.userId);
    if (!clientInfo) return;

    const roomId = clientInfo.roomId;
    if(!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      const index = room.members.indexOf(session.userId);
      if (index > -1) {
        room.members.splice(index, 1);
      }

      // 방의 다른 사용자에게 사용자 퇴장 알림
      namespace.to(roomId).emit('user-left', JsonBuilder.createRoomUserJoinLeave({
        userId: session.userId,
        userName: clientInfo.userName,
        totalMembers: room.members.length,
        timestamp: new Date()
      }));

    }

    usersInfo.set(session.userId, {
      ...clientInfo,
      roomId: null,
    });

    socket.leave(roomId);
    console.log(`[프로젝트 ${projectId}] ${clientInfo.userName}이 방 ${roomId}을 나감`);

  });

   // 🔧 통화 이벤트 초기화
  await initCallEvents(socket, socket.nsp, usersInfo, projectId);
}

module.exports = { 
    initRoomEvents,
    createRoom,
    // selectRooms,
    deleteRoom,
    updateRoom,
};
