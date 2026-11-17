[개요] 2026.02~2026.08 /  큐시트 로컬 서버 (Windows 설치형, Node.js)
행사·방송 현장 큐시트를 같은 내부망 사용자가 함께 편집·재생·소통하는 시스템의 현장 서버.
       

[사용기술]
 - Node.js, Express 5, Socket.IO 4(네임스페이스), express-session +
   better-sqlite3 세션 스토어, better-sqlite3(SQLite), node-cron, dgram(UDP),
   WebRTC 시그널링, node-systray(트레이), bytenode(JS 바이트코드 컴파일),
   Inno Setup(설치 파일: server/desktop/quepilot-installer.iss)

[주요기능]
 - 프로젝트(큐시트) > 방(Room) > 트랙(Track) > 큐(Cue) 계층 편집, 실시간 반영
   (cue-added/updated/deleted, track-*, timeline-updated)
 - 서버 기준 재생 제어: 재생/일시정지/정지/구간 이동(seek)/배속, 타임라인 자동 종료
 - 방별 채팅, 개인 메시지, 전체 공지, 메시지 자동 정리
 - 음성 통화: 방(그룹) 통화 + 1:1 직접 통화, 음소거, 수신 거절/취소
 - 사용자·권한 관리: 방별 접근 권한(user_auth), 관리자/일반 구분, 비밀번호 변경
 - UDP 디스커버리: 클라이언트가 같은 네트워크에서 서버를 자동 탐색
 - 구독 라이선스 인증 후에만 기능 활성화

[핵심 시스템 구조와 구현 방식]
 - 진입점 main-server.js: 라이선스 라우트(항상 동작) → 인증 성공 시 메인 서버 활성화
   (requireLicense 미들웨어로 로그인 API 보호). 세션은 SQLite에 30일 유지하고,
   Socket.IO 핸드셰이크에서 쿠키 세션을 재사용(socketSessionMiddleware).
 - 프로젝트별 Socket.IO 네임스페이스(/{projectId})로 이벤트를 격리, handlers/ 아래
   기능별(project/room/user/timeline/call/directCall/messageCleanup)로 이벤트 등록.
 - 재생 동기화: 서버가 TimelineState로 재생 상태를 단일 진실원으로 보유.
   play 시 startedAt = now - currentTime/speed 로 기준 시각을 잡고, 서버 시각(serverTime)을
   함께 브로드캐스트. 재생 중 5초 간격 heartbeat(timeline-heartbeat)로 보정.
   (클라이언트는 약 16~33ms 주기 타이머로 로컬 보간)
 - 통화: 서버는 시그널링(offer/answer/ICE 전달)과 참여자/음소거 상태만 관리하고, 음성은
   WebRTC P2P(클라이언트 STUN 사용).
 - 저장: SQLite(users, projects, rooms, tracks, cues, user_auth, message_personal,
   message_room, 외래키 CASCADE + 인덱스).
 - 설치·보호: 트레이 아이콘, 설치 시 %APPDATA% 아래에 데이터/관리자 고유 ID 저장,
   bytenode로 소스 보호.
 - 라이선스: licenseManager가 중앙(라이선스) 서버에 로그인해 플랜/최대 인원/만료일을
   받고 주기적으로 갱신(유예 일수 grace_days 지원).

[데이터 흐름]
 관리자(Flutter Desktop)/클라이언트(Flutter App) --Socket.IO--> Local Server
   편집 이벤트 → SQLite 반영 → 같은 네임스페이스에 브로드캐스트 → 모든 단말 화면 동기화
   재생 명령 → TimelineState 갱신 → project-play/pause/stop + heartbeat 브로드캐스트
   통화 → 시그널링 중계 → 단말 간 WebRTC 오디오
 Local Server <--HTTPS--> License Server (로그인/토큰 갱신)
