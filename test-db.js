const pool = require('./db');

async function testDatabase() {
  try {
    const result = await pool.query('SELECT * FROM users');
    console.log('📊 Users in database:');
    console.table(result.rows);
    
  } catch (error) {
    console.error('❌ Error querying users:', error);
  }
}

testDatabase();