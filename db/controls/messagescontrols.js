const db = require('../sqliteDatabase');
const crypto = require('crypto');

// ═══════════════════════════════════════════
// 조회
// ═══════════════════════════════════════════

async function getPersionalMessages(userId) {
  return db.prepare(`
    SELECT
      id,
      from_user_id,
      to_user_id,
      message,
      created_at AS timestamp
    FROM message_personal
    WHERE to_user_id = ? OR from_user_id = ?
    ORDER BY created_at ASC
    LIMIT 50
  `).all(userId, userId);
}

async function getRoomMessagesByRoomId(roomId) {
  return db.prepare(`
    SELECT
      m.id,
      m.from_user_id,
      u.name AS from_user_name,
      m.message,
      m.created_at AS timestamp
    FROM message_room m
    LEFT JOIN users u ON m.from_user_id = u.id
    WHERE m.room_id = ?
    ORDER BY m.created_at ASC
    LIMIT 50
  `).all(roomId);
}

// ═══════════════════════════════════════════
// 삽입
// ═══════════════════════════════════════════

async function insertPersonalMessages(fromUserId, toUserId, message) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO message_personal (id, from_user_id, to_user_id, message)
    VALUES (?, ?, ?, ?)
  `).run(id, fromUserId, toUserId, message);
}

async function insertRoomMessages(roomId, fromUserId, message) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO message_room (id, room_id, from_user_id, message)
    VALUES (?, ?, ?, ?)
  `).run(id, roomId, fromUserId, message);
}

// ═══════════════════════════════════════════
// 정리 (스케줄러용)
// ═══════════════════════════════════════════

async function deleteScheduleRoomMessages() {
  // 1단계: 90일 초과 삭제
  const oldResult = db.prepare(`
    DELETE FROM message_room
    WHERE created_at < datetime('now', '-90 days')
  `).run();

  if (oldResult.changes > 0) {
    console.log(`🗑️ [방 메시지] 90일 초과 ${oldResult.changes}개 삭제`);
  }

  // 2단계: 방별 최근 1000개 초과분 삭제
  const rooms = db.prepare(
    'SELECT DISTINCT room_id FROM message_room'
  ).all();

  const deleteExcess = db.prepare(`
    DELETE FROM message_room
    WHERE room_id = ?
      AND id NOT IN (
        SELECT id FROM message_room
        WHERE room_id = ?
        ORDER BY created_at DESC
        LIMIT 1000
      )
  `);

  let totalDeleted = 0;
  for (const room of rooms) {
    const result = deleteExcess.run(room.room_id, room.room_id);
    totalDeleted += result.changes;
  }

  if (totalDeleted > 0) {
    console.log(`🗑️ [방 메시지] 초과분 ${totalDeleted}개 삭제`);
  }
}

async function deleteSchedulePersonalMessages() {
  // 1단계: 90일 초과 삭제
  const oldResult = db.prepare(`
    DELETE FROM message_personal
    WHERE created_at < datetime('now', '-90 days')
  `).run();

  if (oldResult.changes > 0) {
    console.log(`🗑️ [개인 메시지] 90일 초과 ${oldResult.changes}개 삭제`);
  }

  // 2단계: 대화 쌍별 최근 500개 초과분 삭제
  const pairs = db.prepare(`
    SELECT DISTINCT
      MIN(from_user_id, to_user_id) AS user_a,
      MAX(from_user_id, to_user_id) AS user_b
    FROM message_personal
  `).all();

  const deleteExcess = db.prepare(`
    DELETE FROM message_personal
    WHERE id NOT IN (
      SELECT id FROM message_personal
      WHERE MIN(from_user_id, to_user_id) = ?
        AND MAX(from_user_id, to_user_id) = ?
      ORDER BY created_at DESC
      LIMIT 500
    )
    AND MIN(from_user_id, to_user_id) = ?
    AND MAX(from_user_id, to_user_id) = ?
  `);

  let totalDeleted = 0;
  for (const pair of pairs) {
    const result = deleteExcess.run(pair.user_a, pair.user_b, pair.user_a, pair.user_b);
    totalDeleted += result.changes;
  }

  if (totalDeleted > 0) {
    console.log(`🗑️ [개인 메시지] 초과분 ${totalDeleted}개 삭제`);
  }
}

module.exports = {
  getPersionalMessages,
  getRoomMessagesByRoomId,
  insertPersonalMessages,
  insertRoomMessages,
  deleteScheduleRoomMessages,
  deleteSchedulePersonalMessages,
};


// const db = require('../connection');


// async function getPersionalMessages(userId) {
//     const query = `
//     SELECT 
//     BIN_TO_UUID(id) AS id, 
//     BIN_TO_UUID(from_user_id) AS from_user_id, 
//     BIN_TO_UUID(to_user_id) AS to_user_id, 
//     message, 
//     created_at as timestamp 
//     FROM message_personal
//     WHERE to_user_id = UUID_TO_BIN(?) OR from_user_id = UUID_TO_BIN(?)
//     ORDER BY created_at ASC
//     LIMIT 50`;
    
//     try {
//         const [results, _ ] = await db.query(query, [userId, userId]);
//         return results;
//     } catch (err) {
//         console.error('Error fetching users:', err);
//         throw err;
//     }
// }

// async function getRoomMessagesByRoomId(roomId) {
//     const query = `
//     SELECT 
//     BIN_TO_UUID(m.id) AS id, 
//     BIN_TO_UUID(m.from_user_id) AS from_user_id, 
//     u.name AS from_user_name,
//     m.message, 
//     m.created_at as timestamp 
//     FROM message_room m
//     LEFT JOIN users u ON m.from_user_id = u.id
//     WHERE room_id = UUID_TO_BIN(?)
//     ORDER BY m.created_at ASC
//     LIMIT 50`;

//     try {
//         const [results, _ ] = await db.query(query, [roomId]);
//         return results;
//     } catch (err) {
//         console.error('Error fetching users:', err);
//         throw err;
//     }
// }


// async function insertPersonalMessages(fromUserId, toUserId, message) {
//     const query = 'INSERT INTO message_personal (from_user_id, to_user_id, message) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?)';
//     try {
//         await db.query(query, [fromUserId, toUserId, message]);
//     } catch (err) {
//         console.error('Error creating user:', err);
//         throw err;
//     }
// }

// async function insertRoomMessages(roomId, fromUserId, message) {
//     const query = 'INSERT INTO message_room (room_id, from_user_id, message) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?)';
//     try {
//         await db.query(query, [roomId, fromUserId, message]);
//     } catch (err) {
//         console.error('Error creating user:', err);
//         throw err;
//     }
// }

// async function deleteScheduleRoomMessages() {

//     // 1단계: 90일 이상 된 메시지 일괄 삭제
//     const query1 = `
//             DELETE FROM message_room
//             WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
//             LIMIT 50000
//         `;

//     try {
//         await db.query(query1);
//     } catch (err) {
//         console.error('[Cleanup1] Error:', err);
//         throw err;
//     }

//     // 2단계: 각 방별 최근 1000개 초과분 삭제
//     const query2 = `SELECT DISTINCT room_id FROM message_room`;
//     const query3 = `
//                 DELETE FROM message_room
//                 WHERE room_id = ?
//                   AND id NOT IN (
//                       SELECT id FROM (
//                           SELECT id FROM message_room
//                           WHERE room_id = ?
//                           ORDER BY created_at DESC
//                           LIMIT 1000
//                       ) AS keep
//                   )
//             `;

//     try {
//         const [rooms, _] = await db.query(query2);
//         for (const room of rooms) {
//             await db.query(query3, [room.room_id, room.room_id]);
//         }
//     } catch (err) {
//         console.error('[Cleanup2] Error:', err);
//     }

// } 

// async function deleteSchedulePersonalMessages() {
//     // 1단계: 90일 이상 된 메시지 일괄 삭제
//     const query1 = `
//             DELETE FROM message_personal
//             WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
//             LIMIT 50000;
//         `;

//     try {
//         await db.query(query1);
//     } catch (err) {
//         console.error('[Cleanup1] Error:', err);
//         throw err;
//     }

//     // 2단계: 각 방별 최근 1000개 초과분 삭제
//     const query2 = `SELECT DISTINCT
//                     LEAST(from_user_id, to_user_id)    AS user_a,
//                     GREATEST(from_user_id, to_user_id) AS user_b
//                 FROM message_personal;`;
//     const query3 = `
//                 DELETE FROM message_personal
//                 WHERE id NOT IN (
//                     SELECT id FROM (
//                         SELECT id FROM message_personal
//                         WHERE (LEAST(from_user_id, to_user_id) = ?
//                         AND GREATEST(from_user_id, to_user_id) = ?)
//                         ORDER BY created_at DESC
//                         LIMIT 500
//                     ) AS keep
//                 )
//                 AND (LEAST(from_user_id, to_user_id) = ?
//                 AND GREATEST(from_user_id, to_user_id) = ?)
//             `;

//     try {
//         const [pairs, _] = await db.query(query2);
//         for (const pair of pairs) {
//             await db.query(query3, [pair.user_a, pair.user_b, pair.user_a, pair.user_b]);
//         }
//     } catch (err) {
//         console.error('[Cleanup2] Error:', err);
//     }
// } 

// module.exports = {
//     getPersionalMessages,
//     getRoomMessagesByRoomId,
//     insertPersonalMessages,
//     insertRoomMessages,
//     deleteScheduleRoomMessages,
//     deleteSchedulePersonalMessages
// };