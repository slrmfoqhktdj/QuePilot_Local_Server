// usercontrols.js
const db = require('../sqliteDatabase');
const crypto = require('crypto');


// ═══════════════════════════════════════════════
//  getUsers
// ═══════════════════════════════════════════════
async function getUsers() {
  const stmt = db.prepare('SELECT id, login_id, name FROM users');
  return stmt.all();
}


// ═══════════════════════════════════════════════
//  getUsersById
// ═══════════════════════════════════════════════
async function getUsersById(id) {
  const stmt = db.prepare('SELECT id, login_id, name FROM users WHERE id = ?');
  const row = stmt.get(id);
  return row || {};
}


// ═══════════════════════════════════════════════
//  getUsersByLoginId
// ═══════════════════════════════════════════════
async function getUsersByLoginId(login_id) {
  const stmt = db.prepare('SELECT id, login_id, name FROM users WHERE login_id = ?');
  const row = stmt.get(login_id);
  return row || {};
}


// ═══════════════════════════════════════════════
//  createUser
// ═══════════════════════════════════════════════
async function createUser(login_id, name, password) {
  const id = crypto.randomUUID();
  const stmt = db.prepare(
    'INSERT INTO users (id, login_id, name, password) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, login_id, name, password);
  return getUsersByLoginId(login_id);
}


// ═══════════════════════════════════════════════
//  updateUserById
// ═══════════════════════════════════════════════
async function updateUserById(userId, login_id, name) {
  const stmt = db.prepare('UPDATE users SET login_id = ?, name = ? WHERE id = ?');
  const result = stmt.run(login_id, name, userId);

  if (result.changes > 0) {
    return getUsersByLoginId(login_id);
  }
  return null;
}


// ═══════════════════════════════════════════════
//  updateUserPasswordById
// ═══════════════════════════════════════════════
async function updateUserPasswordById(userId, newPassword) {
  const stmt = db.prepare('UPDATE users SET password = ? WHERE id = ?');
  const result = stmt.run(newPassword, userId);
  return result.changes > 0;
}


// ═══════════════════════════════════════════════
//  deleteUserById
// ═══════════════════════════════════════════════
async function deleteUserById(id) {
  // user_auth 에서 해당 유저 권한도 함께 삭제
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM user_auth WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });

  txn();

  return { id };
}


// ═══════════════════════════════════════════════
//  loginUser
// ═══════════════════════════════════════════════
async function loginUser(login_id, password) {
  const stmt = db.prepare(
    'SELECT id, login_id, name FROM users WHERE login_id = ? AND password = ?'
  );
  const row = stmt.get(login_id, password);
  return row || null;
}


// ═══════════════════════════════════════════════
//  getProjectRoomAuthList
// ═══════════════════════════════════════════════
async function getProjectRoomAuthList() {
  const stmt = db.prepare(`
    SELECT
      p.id   AS project_id,
      p.name AS project_name,
      r.id   AS room_id,
      r.name AS room_name
    FROM projects p
    INNER JOIN rooms r ON r.project_id = p.id
  `);

  const rows = stmt.all();

  if (rows.length === 0) return [];

  const projectsMap = new Map();

  for (const row of rows) {
    const projectId = row.project_id;

    if (!projectsMap.has(projectId)) {
      projectsMap.set(projectId, {
        id: projectId,
        name: row.project_name,
        rooms: [],
      });
    }

    const project = projectsMap.get(projectId);

    if (row.room_id && !project.rooms.find(r => r.id === row.room_id)) {
      project.rooms.push({
        id: row.room_id,
        name: row.room_name,
      });
    }
  }

  return Array.from(projectsMap.values());
}


// ═══════════════════════════════════════════════
//  getBoolUserRoomAuthByIds
// ═══════════════════════════════════════════════
async function getBoolUserRoomAuthByIds(roomId, userId) {
  const stmt = db.prepare(
    'SELECT id FROM user_auth WHERE room_id = ? AND user_id = ?'
  );
  const row = stmt.get(roomId, userId);
  return !!row;
}


// ═══════════════════════════════════════════════
//  getUserAuthList
// ═══════════════════════════════════════════════
async function getUserAuthList(userId) {
  const stmt = db.prepare(`
    SELECT
      id,
      room_id,
      created_at
    FROM user_auth
    WHERE user_id = ?
  `);

  const rows = stmt.all(userId);
  return rows.length === 0 ? [] : rows;
}


// ═══════════════════════════════════════════════
//  updateUserAuth (권한 추가/삭제)
// ═══════════════════════════════════════════════
async function updateUserAuth(updateRoomIds, deleteRoomIds, userId) {
  const txn = db.transaction(() => {
    // 1. 삭제 처리
    if (deleteRoomIds && deleteRoomIds.length > 0) {
      const deleteStmt = db.prepare(
        'DELETE FROM user_auth WHERE user_id = ? AND room_id = ?'
      );
      for (const roomId of deleteRoomIds) {
        deleteStmt.run(userId, roomId);
      }
      console.log(`✓ 삭제 완료: ${deleteRoomIds.length}개`);
    }

    // 2. 추가 처리 (INSERT OR IGNORE = MySQL의 INSERT IGNORE)
    if (updateRoomIds && updateRoomIds.length > 0) {
      const insertStmt = db.prepare(
        'INSERT OR IGNORE INTO user_auth (id, room_id, user_id) VALUES (?, ?, ?)'
      );
      for (const roomId of updateRoomIds) {
        const id = crypto.randomUUID();
        insertStmt.run(id, roomId, userId);
      }
      console.log(`✓ 추가 완료: ${updateRoomIds.length}개`);
    }
  });

  txn();

  console.log('✓ 트랜잭션 커밋 완료');
  return true;
}


module.exports = {
  getUsers,
  getUsersById,
  getUsersByLoginId,
  loginUser,
  createUser,
  updateUserById,
  updateUserPasswordById,
  deleteUserById,
  getProjectRoomAuthList,
  getBoolUserRoomAuthByIds,
  getUserAuthList,
  updateUserAuth,
};



// const db = require('../connection');


// async function getUsers() {
//     const query = 'SELECT BIN_TO_UUID(id) AS id, login_id, name FROM users';
//     try {
//         const [results, _ ] = await db.query(query);
//         return results;
//     } catch (err) {
//         console.error('Error fetching users:', err);
//         throw err;
//     }
// }

// async function getUsersById(id) {
//     const query = `
//     SELECT 
//     BIN_TO_UUID(id) AS id,
//     login_id,
//     name,
//     FROM users
//     WHERE id = UUID_TO_BIN(?)`;
//     try {
//         const [results, _ ] = await db.query(query, [id]);

//         if (results.length === 0) {
//             return {};
//         }

//         return results[0];
//     } catch (err) {
//         console.error('Error fetching users:', err);
//         throw err;
//     }
// }

// async function getUsersByLoginId(login_id) {
//     const query = `
//     SELECT 
//     BIN_TO_UUID(id) AS id,
//     login_id,
//     name,
//     FROM users
//     WHERE login_id = ?`;
//     try {
//         const [results, _ ] = await db.query(query, [login_id]);

//         if (results.length === 0) {
//             return {};
//         }

//         return results[0];
//     } catch (err) {
//         console.error('Error fetching users:', err);
//         throw err;
//     }
// }


// async function createUser(login_id, name, password) {
//     const query = 'INSERT INTO users (login_id, name, password ) VALUES (?, ?, ?)';
//     try {
//         await db.query(query, [login_id, name, password]);
//         return await getUsersByLoginId(login_id);
//     } catch (err) {
//         console.error('Error creating user:', err);
//         throw err;
//     }
// }

// async function updateUserById(userId, login_id, name) {
//     try{
//         const query = 'UPDATE users SET login_id = ?, name = ? WHERE id = UUID_TO_BIN(?)';        
//         const [results, _ ] = await db.query(query, [login_id, name, userId]);

//         if(results.affectedRows > 0) {
//             return await getUsersByLoginId(login_id);
//         }

//         return null;
        
//     }catch(err){
//         console.error('유저 수정 실패:', err);
//         throw err;
//     }
    
// }

// async function updateUserPasswordById(userId, newPassword) {
//     try{
//         const query = 'UPDATE users SET password = ? WHERE id = UUID_TO_BIN(?)';        
//         const [results, _ ] = await db.query(query, [newPassword, userId]);

//         if(results.affectedRows > 0) {
//             return true;
//         }

//         return false;
        
//     }catch(err){
//         console.error('유저 비밀번호 수정 실패:', err);
//         throw err;
//     }
    
// }

// async function deleteUserById(id) {
//     const query = 'DELETE FROM users WHERE id = UUID_TO_BIN(?)';
//     try {
//         await db.query(query, [id]);
//         return { id };
//     } catch (err) {
//         console.error('Error deleting user:', err);
//         throw err;
//     }
// }

// async function loginUser(login_id, password) {
//     const query = 'SELECT  BIN_TO_UUID(id) AS id, login_id, name FROM users WHERE login_id = ? AND password = ?';
//     try{
//         const [results,_] = await db.query(query, [login_id, password]);

//         if(results.length > 0) {
//             return results[0];
//         }

//         return null;

//     } catch (err) {
//         console.error('Error leaving user:', err);
//         throw err;  
//     }
// }



// async function getProjectRoomAuthList() {
//     const query = `
//     SELECT 
//     BIN_TO_UUID(p.id) as project_id,
//     p.name as project_name,
//     BIN_TO_UUID(r.id) as room_id,
//     r.name as room_name
//     FROM projects p
//     INNER JOIN rooms r ON r.project_id = p.id
//     `;
//     try {
//         const [results, _ ] = await db.query(query);

//         if (results.length === 0) {
//             return [];
//         }

//         const ProjectsMap = new Map();

//         results.forEach(row => {
//             const projectId = row.project_id;

//             // console.log(`result :  ${row.timeline_id} , ${row.timeline_name} , ${row.room_id} , ${row.track_id} , ${row.cue_id} , ${row.label}`);

//             if (!ProjectsMap.has(projectId)) {
//                 ProjectsMap.set(projectId, {
//                 id: projectId,
//                 name: row.project_name,
//                 rooms: [],
//                 });
//             }


//             const project = ProjectsMap.get(projectId);

//             // 방 추가 (중복 제거)
//             if (row.room_id && !project.rooms.find(r => r.id === row.room_id)) {
//                 // console.log('Adding room:', row.room_id, row.room_name);
//                 project.rooms.push({
//                     id: row.room_id,
//                     name: row.room_name
//                 });
//             }
//         });




//         return Array.from(ProjectsMap.values());
//     } catch (err) {
//         console.error('Error fetching users:', err);
//         throw err;
//     }
// }

// async function getBoolUserRoomAuthByIds(roomId, userId) {
//     const query = `
//     SELECT 
//     id
//     FROM user_auth
//     WHERE room_id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?)`;
//     try {
//         const [results, _ ] = await db.query(query, [roomId,userId]);

//         if (results.length === 0) {
//             return false;
//         }else{
//             return true;
//         }

//     } catch (err) {
//         console.error('Error fetching users:', err);
//         throw err;
//     }
// }

// async function getUserAuthList(userId) {
//     const query = `
//     SELECT 
//     BIN_TO_UUID(id) as id,
//     BIN_TO_UUID(room_id) as room_id,
//     created_at
//     FROM user_auth
//     WHERE user_id = UUID_TO_BIN(?)
//     `;
//     try {
//         const [results, _ ] = await db.query(query, [userId]);

//         if (results.length === 0) {
//             return [];
//         }

//         return results;
//     } catch (err) {
//         console.error('Error fetching users:', err);
//         throw err;
//     }
// }

// async function updateUserAuth(updateRoomIds, deleteRoomIds, userId) {


//     await db.query('START TRANSACTION');
    
//     try {
//         // 1. 삭제 처리 (안전한 방식)
//         if (deleteRoomIds && deleteRoomIds.length > 0) {
//             // Prepared statement placeholder만 사용 (문자열 조합 없음)
//             const deletePlaceholders = deleteRoomIds.map(() => 'UUID_TO_BIN(?)').join(', ');
//             const deleteQuery = `
//                 DELETE FROM user_auth 
//                 WHERE user_id = UUID_TO_BIN(?) 
//                 AND room_id IN (${deletePlaceholders})
//             `;
//             // 모든 값은 파라미터 배열로 전달
//             const deleteParams = [userId, ...deleteRoomIds];
//             await db.query(deleteQuery, deleteParams);
//             console.log(`✓ 삭제 완료: ${deleteRoomIds.length}개`);
//         }


//          // 2. 추가 처리 (안전한 방식)
//         if (updateRoomIds && updateRoomIds.length > 0) {
//             // Prepared statement placeholder만 사용
//             const insertPlaceholders = updateRoomIds.map(() => '(UUID_TO_BIN(?), UUID_TO_BIN(?))').join(', ');
//             const insertQuery = `
//                 INSERT IGNORE INTO user_auth (room_id, user_id) 
//                 VALUES ${insertPlaceholders}
//             `;
//             // 모든 값은 파라미터 배열로 전달
//             const insertParams = updateRoomIds.flatMap(roomId => [roomId, userId]);
//             await db.query(insertQuery, insertParams);
//             console.log(`✓ 추가 완료: ${updateRoomIds.length}개`);
//         }

//         await db.query('COMMIT');
//         console.log('✓ 트랜잭션 커밋 완료');

//         return true;

//     } catch (err) {

//         await db.query('ROLLBACK');

//         console.error('Error creating user:', err);
//         throw err;
//     }
// }





// module.exports = {
//     getUsers,
//     getUsersById,
//     getUsersByLoginId,
//     loginUser,
//     createUser,
//     updateUserById,
//     updateUserPasswordById,
//     deleteUserById,
//     getProjectRoomAuthList,
//     getBoolUserRoomAuthByIds,
//     getUserAuthList,
//     updateUserAuth,
// };