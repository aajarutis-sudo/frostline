const Database = require('better-sqlite3');
const path = require('path');
const dataDir = path.join(__dirname, 'data');
if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'expeditions.db'));

db.prepare(`CREATE TABLE IF NOT EXISTS expeditions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
)`).run();

module.exports = {
  get(id){
    const row = db.prepare('SELECT data FROM expeditions WHERE id = ?').get(id);
    return row ? JSON.parse(row.data) : null;
  },
  save(exp){
    const exists = db.prepare('SELECT 1 FROM expeditions WHERE id = ?').get(exp.id);
    const data = JSON.stringify(exp);
    if(exists) db.prepare('UPDATE expeditions SET data = ? WHERE id = ?').run(data, exp.id);
    else db.prepare('INSERT INTO expeditions (id, data) VALUES (?, ?)').run(exp.id, data);
  },
  all(){
    return db.prepare('SELECT data FROM expeditions').all().map(r => JSON.parse(r.data));
  },
  remove(id){
    db.prepare('DELETE FROM expeditions WHERE id = ?').run(id);
  }
};
