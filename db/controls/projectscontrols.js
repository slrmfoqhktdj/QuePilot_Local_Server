const db = require('../sqliteDatabase');

async function getProjects() {
  return db.prepare(`
    SELECT id, name, duration, created_at FROM projects
    ORDER BY created_at DESC
  `).all();
}

async function createProject(id, name, duration) {
  db.prepare(`
    INSERT INTO projects (id, name, duration) VALUES (?, ?, ?)
  `).run(id, name, duration);

  return db.prepare(`
    SELECT id, name, duration, created_at FROM projects WHERE id = ?
  `).get(id);
}

async function deleteProject(id) {
  // CASCADE로 rooms → tracks → cues 자동 삭제
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return { id };
}

async function updateProject(id, name, duration) {
  db.prepare(`
    UPDATE projects SET name = ?, duration = ? WHERE id = ?
  `).run(name, duration, id);
  return { id, name, duration };
}

module.exports = {
  getProjects,
  createProject,
  deleteProject,
  updateProject,
};


// const db = require('../connection');

// async function getProjects() {
//     try{
//         const query = 'SELECT BIN_TO_UUID(id) AS id, name, duration , fps, created_at FROM projects';
//         const [results, _ ] = await db.query(query);

//         return results;
//     }catch(err){
//         console.error('프로젝트 목록 조회 실패:', err);
//         throw err;
//     }

// }
    

// async function createProject(id,name, duration , fps) {
//     try{
//         const query = 'INSERT INTO projects (id,name, duration , fps) VALUES (UUID_TO_BIN(?),?,?,?)';
//         await db.query(query, [id,name, duration , fps]);


//         const query2 = 'SELECT BIN_TO_UUID(id) AS id, name, duration , fps, created_at FROM projects WHERE id = UUID_TO_BIN(?)';
//         const [results, _ ] = await db.query(query2, [id]);

//         return results[0];
//     }catch(err){
//         console.error('프로젝트 생성 실패:', err);
//         throw err;
//     }
// }

// async function deleteProject(id) {
//     try{
//         const query = 'DELETE p,r,t,c FROM projects p LEFT JOIN rooms r ON p.id = r.project_id LEFT JOIN tracks t ON r.id = t.room_id OR p.id = t.room_id LEFT JOIN cues c ON t.id = c.track_id WHERE p.id = UUID_TO_BIN(?)'; 
//         await db.query(query, [id]);
//     }catch(err){
//         console.error('프로젝트 삭제 실패:', err);
//         throw err;
//     }
//     return { id };
// }

       

// async function updateProject(id, name, duration, fps) {
//     try{
//         const query = 'UPDATE projects SET name = ?, duration = ?, fps = ? WHERE id = UUID_TO_BIN(?)';        
//         await db.query(query, [name, duration, fps, id]);
//         return { id, name, duration, fps };
//     }catch(err){
//         console.error('프로젝트 수정 실패:', err);
//         throw err;
//     }
    
// }

// module.exports = {
//     getProjects,
//     createProject,
//     deleteProject,
//     updateProject,
// };