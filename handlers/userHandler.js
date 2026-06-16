const user_dbcontrol = require('../db/controls/usercontrols');
const message_dbcontrol = require('../db/controls/messagescontrols');
const JsonBuilder = require('../utils/jsonBuilder');
const { emitToUser } = require('../utils/socketHelpers');


module.exports = function userHandler(io, socket, usersInfo, myAdminId) {

  socket.on('user-list', async (data, callback) => {
    await user_dbcontrol.getUsers().then(usersList => {

      //db 내용과 usersInfo를 조합하여 is_active 필드 추가
      const enrichedUsersList = usersList.map(user => {
        // const live = usersInfo.get(user.id);
        console.log(`사용자 ${user.id} , is active : ${usersInfo.has(user.id) ? 1 : 0}`);
        return {
          ...user,
          is_active: usersInfo.has(user.id) ? 1 : 0,
        };
      });

      console.log(`사용자 목록 조회 성공`);
      callback({ success: true, users: enrichedUsersList });
    }).catch(err => {
      console.log(`사용자 목록 조회 실패:`, err);
      callback({ success: false, users: [] });
    });
  });

  socket.on('project-member-list', async (data, callback) => {
    await user_dbcontrol.getUsersByProjectId(data.projectId).then(usersList => {
      console.log(`프로젝트 ${data.projectId} 사용자 목록 조회 성공`);
      callback({ success: true, users: usersList });
    }).catch(err => {
      console.log(`프로젝트 ${data.projectId} 사용자 목록 조회 실패:`, err);
      callback({ success: false, users: [] });
    });
  });

  socket.on('user-create', async (data, callback) => {
    await user_dbcontrol.createUser(data.login_id, data.name, data.password).then(result => {
      console.log(`사용자 추가 성공`);
      callback({ success: true, user: result });
    }).catch(err => {
      console.log(`사용자 추가 실패:`, err);
      callback({ success: false, user: null });
    });
  });

  socket.on('user-update', async (data, callback) => {
    await user_dbcontrol.updateUserById(data.userId, data.login_id, data.name).then(result => {
      console.log(`사용자 업데이트 성공`);
      callback({ success: true, user: result });
    }).catch(err => {
      console.log(`사용자 업데이트 실패:`, err);
      callback({ success: false, user: null });
    });
  });

  socket.on('user-password-update', async (data, callback) => {

    const newPassword = crypto.randomUUID();

    await user_dbcontrol.updateUserPasswordById(data.userId, newPassword).then(result => {

      if (result) {
        console.log(`사용자 비밀번호 업데이트 성공`);
        callback({ success: true, password: newPassword });
      } else {
        console.log(`사용자 비밀번호 업데이트 실패: 변경된 행이 없습니다.`);
        callback({ success: false, password: null });
      }
    }).catch(err => {
      console.log(`사용자 비밀번호 업데이트 실패:`, err);
      callback({ success: false, password: null });
    });
  });

  socket.on('user-remove', async (data, callback) => {
    await user_dbcontrol.deleteUserById(data.userId).then(result => {
      console.log(`사용자 삭제 성공`);
      callback({ success: true });
    }).catch(err => {
      console.log(`사용자 삭제 실패:`, err);
      callback({ success: false });
    });
  });

  // socket.on('user-role', async (data, callback) => {
  //   await user_dbcontrol.roleProjectMember(data.userId, data.newRole).then(result => {
  //     console.log(`프로젝트 ${data.projectId} 사용자 역할 변경 성공:`, result);
  //     callback({ success: true });
  //   }).catch(err => {
  //     console.log(`프로젝트 ${data.projectId} 사용자 역할 변경 실패:`, err);
  //     callback({ success: false });
  //   });
  // });

  socket.on('user-auth-roomlist', async (data, callback) => {
    await user_dbcontrol.getProjectRoomAuthList().then(result => {
      console.log(`사용자 권한 프로젝트 룸 조회 성공`);
      callback({ success: true, roomList: result });
    }).catch(err => {
      console.log(`사용자 권한 프로젝트 룸 조회 실패:`, err);
      callback({ success: false });
    });
  });

  socket.on('user-auth-list', async (data, callback) => {
    await user_dbcontrol.getUserAuthList(data.userId).then(result => {
      console.log(`사용자 권한 조회 성공`);
      callback({ success: true, roomList: result });
    }).catch(err => {
      console.log(`사용자 권한 조회 실패`, err);
      callback({ success: false });
    });
  });

  socket.on('user-auth-update', async (data, callback) => {
    await user_dbcontrol.updateUserAuth(data.updateRoomIds, data.deleteRoomIds, data.userId).then(result => {
      console.log(`사용자 권한 업데이트 성공:`, result);


      // 해당 사용자의 모든 소켓에 알림 전송
      if (usersInfo.has(data.userId)) {
        const userSocketId = usersInfo.get(data.userId).projectSocketId;

        if (userSocketId) {
          io.to(userSocketId).emit('permissions-updated', {
            // message: '권한이 업데이트되었습니다',
            // updatedAuth: updatedAuth,
            // projectRoomList: projectRoomList,
            // changes: {
            //   addedRooms: data.updateRoomIds || [],
            //   removedRooms: data.deleteRoomIds || []
            // },
            updateRoomIds: data.updateRoomIds || [],
            deleteRoomIds: data.deleteRoomIds || [],
            timestamp: new Date().toISOString()
          });
        }

        console.log(`✓ ${userSocketId} 소켓에 권한 업데이트 알림 전송`);
      } else {
        console.log(`⚠ 사용자 ${data.userId}의 활성 소켓 없음 (오프라인)`);
      }



      callback({ success: true });
    }).catch(err => {
      console.log(`사용자 권한 업데이트 실패:`, err);
      callback({ success: false });
    });
  });


  socket.on('send-personal-message', async (data, callback) => {

    try {
      // const message = {
      //   socketId: data.socketId,
      //   fromUsername: data.fromUsername,
      //   message: data.message,
      //   timestamp: new Date()
      // };

      const session = socket.handshake.session;
      const toUserId = data.userId == 'admin' ? myAdminId : data.userId; // admin에게는 toUserId를 null로 설정

      // DB에 개인 메시지 저장
      await message_dbcontrol.insertPersonalMessages(session.userId, toUserId, data.message);


      const message = JsonBuilder.createMessage({
        fromUserId: session.userId,
        fromUsername: data.fromUsername,
        message: data.message,
        timestamp: new Date(),
      });

      const recipientSocketId = usersInfo.get(toUserId);
      if (recipientSocketId) {

        const sent = emitToUser(io, usersInfo, toUserId, 'receive-personal-message', message);

        if (sent) {
          console.log(`사용자 ${toUserId}에게 개인 메시지 전송 성공`);
          callback({ success: true, messageData: message });
        } else {
          console.log(`사용자 ${toUserId}에게 개인 메시지 전송 실패`);
          callback({ success: false, messageData: null });
        }
        
      } else {
        console.log(`⚠ 사용자 ${toUserId}의 활성 소켓 없음 (오프라인)`);
        callback({ success: false, messageData: message });
      }
    } catch (err) {
      console.log(`개인 메시지 전송 중 오류:`, err);
      callback({ success: false, messageData: null });
    }

  });


  socket.on('get-messages-personal', async (data, callback) => {
    console.log(`개인 채팅 사용자 ${data.userId} 메시지 요청`);

    await message_dbcontrol.getPersionalMessages(data.userId).then(messages => {

      const personalMessages = messages.map(msg => ({
        fromUserId: msg.from_user_id,
        fromUsername: null,
        message: msg.message,
        timestamp: msg.timestamp,
      }));


      console.log(`개인 채팅 사용자 ${data.userId} 메시지 조회 성공`);
      callback({ success: true, messages: personalMessages });
    }).catch(err => {
      console.log(`개인 채팅 사용자 ${data.userId} 메시지 조회 실패:`, err);
      callback({ success: false, messages: null });
    });
  });


};