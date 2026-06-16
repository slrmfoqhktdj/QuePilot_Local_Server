// 공통 스키마 정의

// 사용자 정보 모델
const userSchema = {
    userId: '',
    userName: '',
    mainSocketId: '', 
    projectSocketId: '',  
    type: '',
    projectId: '',
    roomId: '',
    status: '',
    ip: '',
    connectedAt: null,
    lastActivity: null
};

// 채팅 메시지 모델
const messageSchema = {
    fromUserId: '',
    fromUsername: '',
    message: '',
    timestamp: null,
}

// 방 입장/퇴장 알림 모델
const roomUserJoinLeaveSchema = {
    userId: '',
    userName: '',
    totalMembers: 0,
    timestamp: null
}

// 통화방 참여자 모델
const callParticipantSchema = {
    userId: '',
    userName: '',
    isMuted: false,
}

module.exports = {
  userSchema,
  messageSchema,
  roomUserJoinLeaveSchema,
  callParticipantSchema,
};