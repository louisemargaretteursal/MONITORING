const db = require('../database/db');

console.log('--- Starting Counter Field Normalization ---');

const u1 = db.prepare("UPDATE transactions SET counter = 'PACD Desk' WHERE counter = 'PACD'").run();
const u2 = db.prepare("UPDATE transactions SET counter = 'E-Center Station' WHERE counter = 'E-Center'").run();
const u3 = db.prepare("UPDATE transactions SET counter = 'PACD Desk' WHERE (counter = 'Branch Staff' OR counter IS NULL) AND member_id IN (SELECT id FROM members WHERE routed_to = 'pacd')").run();
const u4 = db.prepare("UPDATE transactions SET counter = 'E-Center Station' WHERE (counter = 'Branch Staff' OR counter IS NULL) AND member_id IN (SELECT id FROM members WHERE routed_to = 'ecenter')").run();
const u5 = db.prepare("UPDATE transactions SET counter = 'Counter 1' WHERE counter = 'Branch Staff' OR counter = 'Main Counter' OR counter IS NULL").run();

console.log('Updates applied.');

const distinct = db.prepare('SELECT counter, count(*) as cnt FROM transactions GROUP BY counter').all();
console.log('Current distinct counters in transactions:');
console.table(distinct);
