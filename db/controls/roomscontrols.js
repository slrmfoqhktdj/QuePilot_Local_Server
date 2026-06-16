const db = require('../sqliteDatabase');

async function getRooms() {
  return db.prepare(`
    SELECT id, name, project_id, created_at FROM rooms
  `).all();
}

async function getRoomsByProjectId(projectId) {
  return db.prepare(`
    SELECT id, name, project_id, created_at FROM rooms
    WHERE project_id = ?
    ORDER BY created_at ASC
  `).all(projectId);
}

async function createRoom(id, name, projectId) {
  db.prepare(`
    INSERT INTO rooms (id, name, project_id) VALUES (?, ?, ?)
  `).run(id, name, projectId);

  const room = db.prepare(`
    SELECT id AS roomId, name AS roomName, created_at AS createdAt
    FROM rooms WHERE id = ?
  `).get(id);

  return room;
}

async function deleteRoomById(id) {
  // CASCADE로 tracks → cues 자동 삭제
  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  return { id };
}

async function deleteRoomByProjectId(projectId) {
  // CASCADE로 tracks → cues 자동 삭제
  db.prepare('DELETE FROM rooms WHERE project_id = ?').run(projectId);
}

async function updateRoom(id, newName) {
  db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(newName, id);
}

module.exports = {
  getRooms,
  getRoomsByProjectId,
  createRoom,
  deleteRoomById,
  deleteRoomByProjectId,
  updateRoom,
};


// const db = require('../connection');

// async function getRooms() {
//     const query = 'SELECT BIN_TO_UUID(id) AS id, name, BIN_TO_UUID(project_id) AS project_id, created_at FROM rooms';
//     try {
//         const [results, _ ] = await db.query(query);
//         return results;
//     } catch (err) {
//         console.error('Error fetching rooms:', err);
//         throw err;
//     }
// }
   
// async function getRoomsByProjectId(project_id) {
//     const query = 'SELECT BIN_TO_UUID(id) AS id, name, BIN_TO_UUID(project_id) AS project_id, created_at FROM rooms WHERE project_id = UUID_TO_BIN(?)';
//     try {
//         const [results, _ ] = await db.query(query, [project_id]);
//         return results;
//     } catch (err) {
//         console.error('Error fetching rooms:', err);
//         throw err;
//     }
// }

// async function createRoom(id, name, project_id) {
//     const query = 'INSERT INTO rooms (id, name, project_id) VALUES (UUID_TO_BIN(?), ?, UUID_TO_BIN(?))';
//     const query2 = 'SELECT BIN_TO_UUID(id) AS roomId, name as roomName, created_at as createdAt FROM rooms WHERE id = UUID_TO_BIN(?)';
//     try {
//         await db.query(query, [id, name, project_id]);
//         const [room] = await db.query(query2, [id]);
//         return room[0];
//     } catch (err) {
//         console.error('Error creating room:', err);
//         throw err;
//     }
// }

// // DELETE p,r,t,c FROM projects p LEFT JOIN rooms r ON p.id = r.project_id LEFT JOIN tracks t ON r.id = t.room_id OR p.id = t.room_id LEFT JOIN cues c ON t.id = c.track_id WHERE id = UUID_TO_BIN(?)

// async function deleteRoomById(id) {
//     const query = 'DELETE r,t,c FROM rooms r LEFT JOIN tracks t ON r.id = t.room_id LEFT JOIN cues c ON t.id = c.track_id WHERE r.id = UUID_TO_BIN(?)';
//     try {
//         await db.query(query, [id]);
//         return { id };
//     } catch (err) {
//         console.error('Error deleting room:', err);
//         throw err;
//     }
// }

// async function deleteRoomByProjectId(project_id) {
//     const query = 'DELETE r,t,c FROM rooms r LEFT JOIN tracks t ON r.id = t.room_id LEFT JOIN cues c ON t.id = c.track_id WHERE r.project_id = UUID_TO_BIN(?)';
//     try {
//         await db.query(query, [project_id]);
//     } catch (err) {
//         console.error('Error deleting room:', err);
//         throw err;
//     }
// }

// async function updateRoom(id, newName) {
//     const query = 'UPDATE rooms SET name = ? WHERE id = UUID_TO_BIN(?)';
//     try {
//         await db.query(query, [newName, id]);
//     } catch (err) {
//         console.error('Error updating room:', err);
//         throw err;
//     }
// }


// module.exports = {
//     getRooms,
//     getRoomsByProjectId,
//     createRoom,
//     deleteRoomById,
//     deleteRoomByProjectId,
//     updateRoom,
// };
