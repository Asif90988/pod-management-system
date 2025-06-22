const pool = require('./db');

async function checkCCBData() {
  try {
    const result = await pool.query('SELECT * FROM ccb_items ORDER BY created_at DESC');
    console.log('📊 CCB Items in database:');
    console.table(result.rows);
    
  } catch (error) {
    console.error('❌ Error querying CCB items:', error);
  }
}

checkCCBData();