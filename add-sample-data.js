const pool = require('./db');

async function addSampleData() {
  try {
    // Add team members
    await pool.query(`
      INSERT INTO users (email, name, role) VALUES
      ('asif.mohammed@citi.com', 'Asif Mohammed', 'admin'),
      ('vinod@citi.com', 'Vinod', 'executive'),
      ('kanya@citi.com', 'Kanya', 'pm'),
      ('srini@citi.com', 'Srini', 'developer')
      ON CONFLICT (email) DO NOTHING
    `);
    
    console.log('✅ Sample users added!');
    
  } catch (error) {
    console.error('❌ Error adding users:', error);
  }
}

addSampleData();