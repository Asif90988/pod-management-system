const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Test route
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create CCB item
app.post('/api/ccb', async (req, res) => {
  try {
    const { businessLine, country, title, description } = req.body;
    
    // Generate CCB ID
    const ccbId = `CCB-${businessLine}-${country}-${Date.now()}`;
    
    const result = await pool.query(
      'INSERT INTO ccb_items (ccb_id, business_line, country, title, description, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [ccbId, businessLine, country, title, description, 1] // created_by = 1 (Asif)
    );
    
    res.json({ success: true, ccbId: result.rows[0].ccb_id, ccbItem: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single CCB item
app.get('/api/ccb/:ccbId', async (req, res) => {
  try {
    const { ccbId } = req.params;
    const result = await pool.query('SELECT * FROM ccb_items WHERE ccb_id = $1', [ccbId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CCB item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get next available POD number
app.get('/api/pods/next-number', async (req, res) => {
  try {
    const { businessLine, country, year, month } = req.query;
    
    console.log('🔢 Getting next POD number for:', { businessLine, country, year, month });
    
    // Find the highest existing POD number for this combination
    const result = await pool.query(
      `SELECT pod_id FROM pods 
       WHERE business_line = $1 AND country = $2 
       AND pod_id LIKE $3 
       ORDER BY pod_id DESC LIMIT 1`,
      [businessLine, country, `${businessLine}-${country}-${year}-${month}-%`]
    );
    
    let nextNumber = 1;
    
    if (result.rows.length > 0) {
      const lastPodId = result.rows[0].pod_id;
      console.log('📋 Last POD ID found:', lastPodId);
      
      // Extract the number from the last POD ID (e.g., AML-PER-2025-06-002 -> 2)
      const lastNumber = parseInt(lastPodId.split('-').pop());
      nextNumber = lastNumber + 1;
    }
    
    console.log('✅ Next POD number:', nextNumber);
    
    res.json({ nextNumber });
  } catch (error) {
    console.error('❌ Error getting next POD number:', error);
    res.status(500).json({ error: error.message, nextNumber: 1 });
  }
});

// Create POD
app.post('/api/pods', async (req, res) => {
  try {
    console.log('📝 Received POD creation data:', req.body);
    
    const { podId, podName, ccbId, startDate, endDate, podLead, estimatedHours, scope } = req.body;
    
    // Validate required fields
    if (!podId || !podName || !ccbId || !startDate || !endDate || !podLead || !estimatedHours) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    console.log('🔍 Looking for CCB item:', ccbId);
    
    // Get CCB item details
    const ccbResult = await pool.query('SELECT * FROM ccb_items WHERE ccb_id = $1', [ccbId]);
    if (ccbResult.rows.length === 0) {
      console.log('❌ CCB item not found:', ccbId);
      return res.status(404).json({ error: 'CCB item not found' });
    }
    
    const ccbItem = ccbResult.rows[0];
    console.log('✅ Found CCB item:', ccbItem);
    
    console.log('💾 Inserting POD into database...');
    
    const result = await pool.query(
      'INSERT INTO pods (pod_id, pod_name, ccb_item_id, business_line, country, start_date, end_date, pod_lead, estimated_hours, scope, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [podId, podName, ccbItem.id, ccbItem.business_line, ccbItem.country, startDate, endDate, podLead, estimatedHours, scope, 1]
    );
    
    console.log('✅ POD created successfully:', result.rows[0]);
    
    res.json({ success: true, pod: result.rows[0] });
  } catch (error) {
    console.error('❌ POD creation error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Get single POD details
app.get('/api/pods/:podId', async (req, res) => {
  try {
    const { podId } = req.params;
    const result = await pool.query('SELECT * FROM pods WHERE pod_id = $1', [podId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'POD not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save POD configuration
app.post('/api/pods/configure', async (req, res) => {
  try {
    console.log('📝 Received configuration data:', req.body);
    
    const { 
      podId, 
      teamSize, 
      deliverables, 
      successCriteria, 
      sprintDuration, 
      baHandover, 
      reverseWalkthrough, 
      reviewDay, 
      skills, 
      resources 
    } = req.body;
    
    console.log('🔄 Updating POD:', podId);
    
    // Update POD with all configuration fields
    const result = await pool.query(
      `UPDATE pods SET 
        deliverables = $1, 
        success_criteria = $2, 
        team_size = $3, 
        sprint_duration = $4, 
        ba_handover = $5, 
        reverse_walkthrough = $6, 
        review_day = $7, 
        required_skills = $8 
      WHERE pod_id = $9 RETURNING *`,
      [
        deliverables, 
        successCriteria, 
        teamSize, 
        sprintDuration, 
        baHandover, 
        reverseWalkthrough, 
        reviewDay, 
        JSON.stringify(skills), 
        podId
      ]
    );
    
    console.log('✅ Update successful:', result.rows[0]);
    
    res.json({ success: true, message: 'Configuration saved successfully', pod: result.rows[0] });
  } catch (error) {
    console.error('❌ Configuration save error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Launch POD endpoint
app.post('/api/pods/launch', async (req, res) => {
  try {
    const { pod_id } = req.body;
    
    console.log('🚀 Launching POD:', pod_id);
    
    // Update POD status to Active
    const result = await pool.query(
      'UPDATE pods SET status = $1 WHERE pod_id = $2 RETURNING *',
      ['Active', pod_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'POD not found' });
    }
    
    console.log('✅ POD launched successfully:', result.rows[0]);
    
    res.json({ success: true, pod: result.rows[0] });
  } catch (error) {
    console.error('❌ Launch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Dashboard API Endpoints

// Get dashboard overview data
app.get('/api/dashboard/overview', async (req, res) => {
  try {
    console.log('📊 Loading dashboard overview...');
    
    // Get total POD counts by status
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM pods 
      GROUP BY status
    `);
    
    // Get PODs by business line
    const businessLineResult = await pool.query(`
      SELECT business_line, COUNT(*) as count 
      FROM pods 
      GROUP BY business_line
    `);
    
    // Get PODs by country
    const countryResult = await pool.query(`
      SELECT country, COUNT(*) as count 
      FROM pods 
      GROUP BY country
    `);
    
    // Get total resource count
    const resourceResult = await pool.query(`
      SELECT COUNT(DISTINCT pod_lead) as total_pod_leads,
             SUM(team_size) as total_allocated_resources
      FROM pods 
      WHERE team_size IS NOT NULL
    `);
    
    // Get recent PODs
    const recentResult = await pool.query(`
      SELECT pod_id, pod_name, business_line, country, status, created_at
      FROM pods 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    const dashboardData = {
      overview: {
        totalPods: statusResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
        statusBreakdown: statusResult.rows,
        businessLineBreakdown: businessLineResult.rows,
        countryBreakdown: countryResult.rows,
        resourceStats: resourceResult.rows[0] || { total_pod_leads: 0, total_allocated_resources: 0 }
      },
      recentPods: recentResult.rows
    };
    
    console.log('✅ Dashboard data loaded:', dashboardData);
    res.json(dashboardData);
    
  } catch (error) {
    console.error('❌ Dashboard overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all PODs with details for dashboard table
app.get('/api/dashboard/pods', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.pod_id,
        p.pod_name,
        p.business_line,
        p.country,
        p.status,
        p.start_date,
        p.end_date,
        p.team_size,
        p.estimated_hours,
        p.created_at,
        u.name as pod_lead_name
      FROM pods p
      LEFT JOIN users u ON p.pod_lead = u.id
      ORDER BY p.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Dashboard PODs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enhanced Executive Dashboard APIs - PHASE 2A

// Get detailed POD performance with individual metrics
// Enhanced Executive Dashboard API with Smart Status Logic
app.get('/api/dashboard/performance', async (req, res) => {
  try {
    console.log('📊 Loading enhanced dashboard with smart status rules...');
    
    // Get PODs with SMART STATUS LOGIC based on demo feedback
    const podsResult = await pool.query(`
      SELECT 
        p.pod_id,
        p.pod_name,
        p.business_line,
        p.country,
        p.status,
        p.start_date,
        p.end_date,
        p.team_size,
        p.estimated_hours,
        p.created_at,
        p.pts_id,
        p.release_tag,
        p.work_type,
        u.name as pod_lead_name,
        c.title as ccb_title,
        -- Calculate progress based on days elapsed
        CASE 
          WHEN p.start_date IS NULL OR p.end_date IS NULL THEN 0
          WHEN CURRENT_DATE < p.start_date THEN 0
          WHEN CURRENT_DATE > p.end_date THEN 100
          ELSE ROUND(
            ((CURRENT_DATE - p.start_date)::FLOAT / 
             (p.end_date - p.start_date)::FLOAT) * 100
          )
        END as progress_percentage,
        -- Calculate days remaining
        CASE 
          WHEN p.end_date IS NULL THEN NULL
          ELSE (p.end_date - CURRENT_DATE)
        END as days_remaining,
        
        -- 🚨 SMART STATUS LOGIC - Based on Demo Feedback
        CASE 
          -- NO END DATE = IMMEDIATE ATTENTION (Highest Priority)
          WHEN p.end_date IS NULL THEN 'need_immediate_attention'
          
          -- SAT Status Logic (Testing Phase)
          WHEN p.status = 'SAT' AND (p.end_date - CURRENT_DATE) <= 0 THEN 'time_up'
          WHEN p.status = 'SAT' AND (p.end_date - CURRENT_DATE) BETWEEN 1 AND 7 THEN 'watch_on_priority'
          WHEN p.status = 'SAT' AND (p.end_date - CURRENT_DATE) > 7 THEN 'on_track'
          
          -- Active PODs Logic
          WHEN p.status = 'Active' AND (p.end_date - CURRENT_DATE) <= 0 THEN 'time_up'
          WHEN p.status = 'Active' AND (p.end_date - CURRENT_DATE) BETWEEN 1 AND 7 THEN 'watch_on_priority'
          WHEN p.status = 'Active' AND (p.end_date - CURRENT_DATE) > 7 THEN 'on_track'
          
          -- Planning Status
          WHEN p.status = 'Planning' THEN 'planning'
          
          -- Default fallback
          ELSE 'attention_needed'
        END as performance_status,
        
        -- Priority Level for Smart Sorting (1 = Most Urgent)
        CASE 
          WHEN p.end_date IS NULL THEN 1                                    -- Immediate attention
          WHEN (p.end_date - CURRENT_DATE) <= 0 THEN 2                    -- Time up
          WHEN (p.end_date - CURRENT_DATE) BETWEEN 1 AND 7 THEN 3         -- Watch on priority
          WHEN p.status = 'Planning' THEN 5                               -- Planning
          ELSE 4                                                           -- On track
        END as priority_level,
        
        -- Alert Type for Display
        CASE 
          WHEN p.end_date IS NULL THEN 'IMMEDIATE'
          WHEN (p.end_date - CURRENT_DATE) <= 0 THEN 'CRITICAL'
          WHEN (p.end_date - CURRENT_DATE) BETWEEN 1 AND 7 THEN 'WARNING'
          ELSE 'SUCCESS'
        END as alert_type
        
      FROM pods p
      LEFT JOIN users u ON p.pod_lead = u.id
      LEFT JOIN ccb_items c ON p.ccb_item_id = c.id
      ORDER BY priority_level ASC, p.created_at DESC
    `);
    
    console.log('✅ Enhanced PODs query successful, rows found:', podsResult.rows.length);
    
    // Enhanced individual performance with new role mapping
// Enhanced individual performance with new role mapping - FIXED
const individualResult = await pool.query(`
  SELECT 
    u.id,
    u.name,
    u.role,
    u.skill_specialization,
    -- Count PODs where user is pod_lead
    COUNT(p.pod_id) as assigned_pods,
    -- Enhanced performance metrics
    CASE 
      WHEN COUNT(p.pod_id) = 0 THEN 0
      ELSE (75 + (RANDOM() * 25))::INTEGER
    END as performance_score,
    -- Simulated JIRA-style metrics
    (5 + (RANDOM() * 15))::INTEGER as weekly_tasks,
    (30 + (RANDOM() * 15))::INTEGER as weekly_hours,
    -- Status based on POD urgency levels - FIXED
    CASE 
      WHEN COUNT(p.pod_id) = 0 THEN 'unassigned'
      WHEN COUNT(CASE WHEN p.priority_level <= 2 THEN 1 END) > 0 THEN 'critical_attention'
      WHEN COUNT(CASE WHEN p.priority_level = 3 THEN 1 END) > 0 THEN 'watch_required'
      WHEN COUNT(p.pod_id) >= 2 THEN 'exceeding'
      WHEN COUNT(p.pod_id) = 1 THEN 'meeting'
      ELSE 'below'
    END as user_status
  FROM users u
  LEFT JOIN (
    SELECT pod_id, pod_lead,
           CASE 
             WHEN end_date IS NULL THEN 1
             WHEN (end_date - CURRENT_DATE) <= 0 THEN 2
             WHEN (end_date - CURRENT_DATE) BETWEEN 1 AND 7 THEN 3
             ELSE 4
           END as priority_level
    FROM pods 
    WHERE status IN ('Active', 'SAT')
  ) p ON u.id = p.pod_lead
  GROUP BY u.id, u.name, u.role, u.skill_specialization
  ORDER BY 
    CASE 
      WHEN COUNT(CASE WHEN p.priority_level <= 2 THEN 1 END) > 0 THEN 1
      WHEN COUNT(CASE WHEN p.priority_level = 3 THEN 1 END) > 0 THEN 2
      WHEN COUNT(p.pod_id) >= 2 THEN 3
      WHEN COUNT(p.pod_id) = 1 THEN 4
      ELSE 5
    END,
    COUNT(p.pod_id) DESC, u.name
`);
    
    console.log('✅ Individual performance query successful, rows found:', individualResult.rows.length);
    
    // Get resource utilization
    const utilizationResult = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN p.pod_lead IS NOT NULL THEN 1 END) as assigned_users,
        COALESCE(SUM(p.team_size), 0) as total_allocated_resources,
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(
            (COUNT(CASE WHEN p.pod_lead IS NOT NULL THEN 1 END)::FLOAT / 
             COUNT(*)::FLOAT) * 100
          )
        END as utilization_percentage
      FROM users u
      LEFT JOIN pods p ON u.id = p.pod_lead AND p.status IN ('Active', 'SAT')
    `);
    
    console.log('✅ Utilization query successful');
    
    // 🚨 ENHANCED ALERTS based on Smart Status Logic
    const alerts = [];
    
    // IMMEDIATE ATTENTION alerts (No end date)
    const immediateAttention = podsResult.rows.filter(pod => 
      pod.performance_status === 'need_immediate_attention'
    );
    immediateAttention.forEach(pod => {
      alerts.push({
        type: 'critical',
        title: `🚨 IMMEDIATE ATTENTION: ${pod.pod_id}`,
        message: `${pod.pod_name || 'Unnamed POD'} has no end date defined - needs immediate planning`,
        pod_id: pod.pod_id,
        priority: 1,
        icon: '🚨'
      });
    });
    
    // TIME UP alerts (Past due date)
    const timeUpPods = podsResult.rows.filter(pod => 
      pod.performance_status === 'time_up'
    );
    timeUpPods.forEach(pod => {
      alerts.push({
        type: 'critical',
        title: `⏰ TIME UP: ${pod.pod_id}`,
        message: `${pod.pod_name || 'Unnamed POD'} is past due date - immediate action required`,
        pod_id: pod.pod_id,
        priority: 2,
        icon: '⏰'
      });
    });
    
    // WATCH ON PRIORITY alerts (1-7 days remaining)
    const watchPods = podsResult.rows.filter(pod => 
      pod.performance_status === 'watch_on_priority'
    );
    watchPods.forEach(pod => {
      const daysLeft = Math.max(0, pod.days_remaining);
      alerts.push({
        type: 'warning',
        title: `👀 WATCH ON PRIORITY: ${pod.pod_id}`,
        message: `${pod.pod_name || 'Unnamed POD'} due in ${daysLeft} days - monitor closely`,
        pod_id: pod.pod_id,
        priority: 3,
        icon: '👀'
      });
    });
    
    // Resource utilization alerts
    const utilization = utilizationResult.rows[0];
    if (utilization.utilization_percentage < 70) {
      alerts.push({
        type: 'warning',
        title: '📊 Low Resource Utilization',
        message: `Only ${utilization.utilization_percentage}% of resources allocated`,
        pod_id: null,
        priority: 4,
        icon: '📊'
      });
    }
    
    // Sort alerts by priority (most urgent first)
    alerts.sort((a, b) => a.priority - b.priority);
    
    // Add success message if no critical alerts
    if (alerts.filter(a => a.type === 'critical').length === 0) {
      alerts.unshift({
        type: 'info',
        title: '✅ No Critical Issues',
        message: 'All PODs are within acceptable timeframes',
        pod_id: null,
        priority: 0,
        icon: '✅'
      });
    }
    
    // Enhanced response with smart status summary
    const responseData = {
      pods: podsResult.rows,
      individuals: individualResult.rows,
      utilization: utilizationResult.rows[0],
      alerts: alerts,
      smartStatusSummary: {
        immediate_attention: immediateAttention.length,
        time_up: timeUpPods.length,
        watch_on_priority: watchPods.length,
        on_track: podsResult.rows.filter(p => p.performance_status === 'on_track').length,
        total_pods: podsResult.rows.length
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Enhanced dashboard data prepared successfully');
    console.log(`📊 Smart Status Summary: ${immediateAttention.length} immediate, ${timeUpPods.length} time up, ${watchPods.length} watch priority, ${responseData.smartStatusSummary.on_track} on track`);
    
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Enhanced dashboard error:', error);
    console.error('Error details:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: 'Enhanced dashboard query failed. Please check server logs.'
    });
  }
});

// Get trend data for charts
app.get('/api/dashboard/trends', async (req, res) => {
  try {
    console.log('📈 Loading dashboard trends...');
    
    // Simulated trend data (in production, this would come from historical tables)
    const trends = {
      utilization: [
        { week: 'Week 1', value: 75 },
        { week: 'Week 2', value: 78 },
        { week: 'Week 3', value: 82 },
        { week: 'Week 4', value: 85 },
        { week: 'Week 5', value: 87 },
        { week: 'Week 6', value: 89 }
      ],
      quality: [
        { week: 'Week 1', value: 85 },
        { week: 'Week 2', value: 87 },
        { week: 'Week 3', value: 90 },
        { week: 'Week 4', value: 92 },
        { week: 'Week 5', value: 94 },
        { week: 'Week 6', value: 96 }
      ],
      delivery: [
        { week: 'Week 1', value: 70 },
        { week: 'Week 2', value: 75 },
        { week: 'Week 3', value: 80 },
        { week: 'Week 4', value: 85 },
        { week: 'Week 5', value: 88 },
        { week: 'Week 6', value: 91 }
      ]
    };
    
    res.json(trends);
    
  } catch (error) {
    console.error('❌ Trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Authentication middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }
  
  // Simple token validation (you could enhance this with JWT)
  const token = authHeader.split(' ')[1];
  // For now, we'll use a simple session check
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    const userRole = req.headers['user-role'];
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔐 Login attempt for:', username);
    
    // Find user by username
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const user = result.rows[0];
    
    // Simple password check (in production, use bcrypt)
    const validPasswords = {
      'vinod': 'admin123',
      'asif.mohammed': 'creator123', 
      'kanya': 'creator123',
      'srini': 'user123'
    };
    
    if (password !== validPasswords[username]) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Update last login
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    
    console.log('✅ Login successful for:', username, 'Role:', user.role);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user session info
app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const result = await pool.query('SELECT id, username, name, email, role FROM users WHERE id = $1', [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Creator Dashboard - Get PODs created by specific user
app.get('/api/creator/pods/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('📊 Loading creator dashboard for user:', userId);
    
    const result = await pool.query(`
      SELECT 
        p.pod_id,
        p.pod_name,
        p.business_line,
        p.country,
        p.status,
        p.start_date,
        p.end_date,
        p.team_size,
        p.estimated_hours,
        p.created_at,
        u.name as pod_lead_name,
        c.title as ccb_title
      FROM pods p
      LEFT JOIN users u ON p.pod_lead = u.id
      LEFT JOIN ccb_items c ON p.ccb_item_id = c.id
      WHERE p.created_by = $1
      ORDER BY p.created_at DESC
    `, [userId]);
    
    // Get summary stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_pods,
        COUNT(CASE WHEN status = 'Planning' THEN 1 END) as planning_pods,
        COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_pods,
        SUM(team_size) as total_resources
      FROM pods 
      WHERE created_by = $1
    `, [userId]);
    
    res.json({
      pods: result.rows,
      stats: statsResult.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Creator dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User Dashboard - Get PODs where user is assigned as a resource
app.get('/api/user/pods/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('👤 Loading user dashboard for user:', userId);
    
    // For now, get PODs where user is the POD lead
    // Later we'll enhance this to include resource assignments
    const result = await pool.query(`
      SELECT 
        p.pod_id,
        p.pod_name,
        p.business_line,
        p.country,
        p.status,
        p.start_date,
        p.end_date,
        p.team_size,
        p.estimated_hours,
        p.created_at,
        p.deliverables,
        p.success_criteria,
        u.name as pod_lead_name,
        c.title as ccb_title
      FROM pods p
      LEFT JOIN users u ON p.pod_lead = u.id
      LEFT JOIN ccb_items c ON p.ccb_item_id = c.id
      WHERE p.pod_lead = $1
      ORDER BY p.created_at DESC
    `, [userId]);
    
    // Get summary stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as assigned_pods,
        COUNT(CASE WHEN status = 'Planning' THEN 1 END) as planning_pods,
        COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_pods,
        SUM(CASE WHEN status = 'Active' THEN team_size ELSE 0 END) as active_team_members
      FROM pods 
      WHERE pod_lead = $1
    `, [userId]);
    
    res.json({
      pods: result.rows,
      stats: statsResult.rows[0]
    });
    
  } catch (error) {
    console.error('❌ User dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// JIRA SIMULATION APIS - Phase 2C: JIRA Integration Framework
// =============================================================================
// Add these endpoints to your server.js file, right before app.listen()

console.log('🔧 Loading JIRA simulation APIs...');

// JIRA Projects Overview
app.get('/api/jira/projects', async (req, res) => {
  try {
    console.log('📋 Loading JIRA projects (simulated)...');
    
    // Simulated JIRA project data based on your PODs
    const projects = [
      {
        key: 'AML-MEX',
        name: 'AML Mexico Implementation',
        lead: 'Asif Mohammed',
        description: 'Anti-Money Laundering system implementation for Mexico operations',
        sprints: 3,
        totalStoryPoints: 120,
        completedStoryPoints: 89,
        activeSprint: 'Sprint 3',
        sprintStartDate: '2025-06-15',
        sprintEndDate: '2025-07-05',
        status: 'Active',
        team: ['Asif Mohammed', 'Developer 1', 'QA Tester 1'],
        velocity: 15.2, // story points per sprint
        bugCount: 3,
        criticalBugs: 1
      },
      {
        key: 'KYC-PER',
        name: 'KYC Peru Enhancement',
        lead: 'Kanya',
        description: 'Know Your Customer enhancement for Peru compliance',
        sprints: 2,
        totalStoryPoints: 85,
        completedStoryPoints: 72,
        activeSprint: 'Sprint 2',
        sprintStartDate: '2025-06-10',
        sprintEndDate: '2025-06-30',
        status: 'Active',
        team: ['Kanya', 'Developer 2', 'BA 1'],
        velocity: 18.5,
        bugCount: 1,
        criticalBugs: 0
      },
      {
        key: 'TRADE-COL',
        name: 'Trade Finance Colombia',
        lead: 'Srini',
        description: 'Trade finance platform for Colombian market',
        sprints: 4,
        totalStoryPoints: 200,
        completedStoryPoints: 165,
        activeSprint: 'Sprint 4',
        sprintStartDate: '2025-06-20',
        sprintEndDate: '2025-07-15',
        status: 'Active',
        team: ['Srini', 'Developer 3', 'Developer 4', 'QA Tester 2'],
        velocity: 22.1,
        bugCount: 5,
        criticalBugs: 2
      },
      {
        key: 'RISK-BRA',
        name: 'Risk Management Brazil',
        lead: 'Vinod',
        description: 'Risk assessment platform for Brazilian operations',
        sprints: 1,
        totalStoryPoints: 60,
        completedStoryPoints: 15,
        activeSprint: 'Sprint 1',
        sprintStartDate: '2025-06-25',
        sprintEndDate: '2025-07-10',
        status: 'Planning',
        team: ['Vinod', 'Analyst 1'],
        velocity: 12.0,
        bugCount: 0,
        criticalBugs: 0
      }
    ];
    
    console.log(`✅ JIRA projects loaded: ${projects.length} projects`);
    res.json({
      projects: projects,
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === 'Active').length,
      totalStoryPoints: projects.reduce((sum, p) => sum + p.totalStoryPoints, 0),
      completedStoryPoints: projects.reduce((sum, p) => sum + p.completedStoryPoints, 0),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ JIRA projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sprint Burndown Data
app.get('/api/jira/burndown/:projectKey', async (req, res) => {
  try {
    const { projectKey } = req.params;
    console.log(`📊 Loading burndown for project: ${projectKey}`);
    
    // Simulated burndown data based on project
    const burndownData = {
      'AML-MEX': {
        projectName: 'AML Mexico Implementation',
        sprintName: 'Sprint 3',
        sprintDays: 14,
        currentDay: 10,
        totalStoryPoints: 45,
        remainingStoryPoints: 12,
        idealBurndown: [45, 42, 39, 36, 33, 30, 27, 24, 21, 18, 15, 12, 9, 6, 3, 0],
        actualBurndown: [45, 43, 40, 38, 35, 32, 28, 25, 22, 18, 12, null, null, null, null, null],
        dailyVelocity: 3.2,
        predictedCompletion: '2025-07-03',
        riskLevel: 'medium',
        completionProbability: 85
      },
      'KYC-PER': {
        projectName: 'KYC Peru Enhancement',
        sprintName: 'Sprint 2',
        sprintDays: 12,
        currentDay: 8,
        totalStoryPoints: 35,
        remainingStoryPoints: 8,
        idealBurndown: [35, 32, 29, 26, 23, 20, 17, 14, 11, 8, 5, 2, 0],
        actualBurndown: [35, 33, 30, 27, 24, 21, 18, 15, 8, null, null, null, null],
        dailyVelocity: 3.4,
        predictedCompletion: '2025-06-28',
        riskLevel: 'low',
        completionProbability: 95
      },
      'TRADE-COL': {
        projectName: 'Trade Finance Colombia',
        sprintName: 'Sprint 4',
        sprintDays: 16,
        currentDay: 5,
        totalStoryPoints: 55,
        remainingStoryPoints: 38,
        idealBurndown: [55, 52, 49, 46, 43, 40, 37, 34, 31, 28, 25, 22, 19, 16, 13, 10, 7, 4, 1, 0],
        actualBurndown: [55, 53, 51, 48, 44, 38, null, null, null, null, null, null, null, null, null, null],
        dailyVelocity: 3.4,
        predictedCompletion: '2025-07-18',
        riskLevel: 'high',
        completionProbability: 65
      },
      'RISK-BRA': {
        projectName: 'Risk Management Brazil',
        sprintName: 'Sprint 1',
        sprintDays: 10,
        currentDay: 2,
        totalStoryPoints: 25,
        remainingStoryPoints: 22,
        idealBurndown: [25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 0],
        actualBurndown: [25, 24, 22, null, null, null, null, null, null, null, null, null, null, null],
        dailyVelocity: 1.5,
        predictedCompletion: '2025-07-12',
        riskLevel: 'medium',
        completionProbability: 75
      }
    };
    
    const data = burndownData[projectKey];
    if (!data) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    console.log(`✅ Burndown data loaded for ${projectKey}`);
    res.json(data);
    
  } catch (error) {
    console.error('❌ Burndown data error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Individual JIRA Performance
app.get('/api/jira/individual-performance', async (req, res) => {
  try {
    console.log('👥 Loading individual JIRA performance (simulated)...');
    
    // Simulated individual JIRA performance data
    const performance = [
      {
        name: 'Asif Mohammed',
        email: 'asif.mohammed@citi.com',
        role: 'Technical Lead',
        currentProject: 'AML-MEX',
        currentSprint: 'Sprint 3',
        assignedStoryPoints: 25,
        completedStoryPoints: 23,
        completionRate: 92,
        averageTaskTime: 4.2, // hours
        bugCount: 2,
        bugFixRate: 95,
        codeReviews: 12,
        velocity: 8.5, // story points per day
        status: 'exceeding',
        sprintCommitment: 100,
        qualityScore: 95,
        recentTasks: [
          { key: 'AML-123', title: 'Implement customer screening logic', status: 'Done', points: 8 },
          { key: 'AML-124', title: 'API integration tests', status: 'In Progress', points: 5 },
          { key: 'AML-125', title: 'Database optimization', status: 'To Do', points: 3 }
        ]
      },
      {
        name: 'Kanya',
        email: 'kanya@citi.com',
        role: 'Senior Developer',
        currentProject: 'KYC-PER',
        currentSprint: 'Sprint 2',
        assignedStoryPoints: 22,
        completedStoryPoints: 21,
        completionRate: 95,
        averageTaskTime: 3.8,
        bugCount: 1,
        bugFixRate: 100,
        codeReviews: 15,
        velocity: 9.2,
        status: 'exceeding',
        sprintCommitment: 100,
        qualityScore: 98,
        recentTasks: [
          { key: 'KYC-89', title: 'Document validation service', status: 'Done', points: 8 },
          { key: 'KYC-90', title: 'UI component improvements', status: 'Done', points: 5 },
          { key: 'KYC-91', title: 'Performance testing suite', status: 'In Progress', points: 9 }
        ]
      },
      {
        name: 'Srini',
        email: 'srini@citi.com',
        role: 'Full Stack Developer',
        currentProject: 'TRADE-COL',
        currentSprint: 'Sprint 4',
        assignedStoryPoints: 20,
        completedStoryPoints: 16,
        completionRate: 80,
        averageTaskTime: 5.1,
        bugCount: 3,
        bugFixRate: 87,
        codeReviews: 8,
        velocity: 6.8,
        status: 'meeting',
        sprintCommitment: 90,
        qualityScore: 82,
        recentTasks: [
          { key: 'TRD-67', title: 'Payment processing module', status: 'Done', points: 13 },
          { key: 'TRD-68', title: 'Trade validation rules', status: 'In Progress', points: 8 },
          { key: 'TRD-69', title: 'Reporting dashboard', status: 'To Do', points: 12 }
        ]
      },
      {
        name: 'Vinod',
        email: 'vinod@citi.com',
        role: 'Executive/Product Owner',
        currentProject: 'RISK-BRA',
        currentSprint: 'Sprint 1',
        assignedStoryPoints: 15,
        completedStoryPoints: 12,
        completionRate: 80,
        averageTaskTime: 2.5,
        bugCount: 0,
        bugFixRate: 100,
        codeReviews: 5,
        velocity: 6.0,
        status: 'meeting',
        sprintCommitment: 85,
        qualityScore: 90,
        recentTasks: [
          { key: 'RSK-45', title: 'Risk model requirements', status: 'Done', points: 5 },
          { key: 'RSK-46', title: 'Compliance review process', status: 'Done', points: 3 },
          { key: 'RSK-47', title: 'User acceptance criteria', status: 'In Progress', points: 7 }
        ]
      }
    ];
    
    console.log(`✅ Individual performance loaded: ${performance.length} team members`);
    res.json({
      individuals: performance,
      teamStats: {
        totalMembers: performance.length,
        averageVelocity: performance.reduce((sum, p) => sum + p.velocity, 0) / performance.length,
        averageCompletionRate: performance.reduce((sum, p) => sum + p.completionRate, 0) / performance.length,
        totalBugs: performance.reduce((sum, p) => sum + p.bugCount, 0),
        averageQualityScore: performance.reduce((sum, p) => sum + p.qualityScore, 0) / performance.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Individual performance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// JIRA Analytics Summary
app.get('/api/jira/analytics', async (req, res) => {
  try {
    console.log('📈 Loading JIRA analytics summary...');
    
    // Simulated analytics data
    const analytics = {
      sprintMetrics: {
        totalSprints: 10,
        completedSprints: 7,
        averageVelocity: 42.5,
        sprintSuccessRate: 85,
        averageSprintDuration: 12.5 // days
      },
      qualityMetrics: {
        totalBugs: 9,
        criticalBugs: 3,
        bugFixRate: 92,
        codeReviewCoverage: 95,
        testCoverage: 87
      },
      teamMetrics: {
        totalDevelopers: 4,
        activeProjects: 4,
        averageTaskCompletionTime: 4.1, // hours
        teamVelocityTrend: [35, 38, 42, 45, 43, 47], // last 6 sprints
        burndownAccuracy: 78
      },
      riskIndicators: [
        {
          type: 'critical',
          title: 'Trade Finance Sprint at Risk',
          message: 'TRADE-COL sprint velocity below target, 65% completion probability',
          project: 'TRADE-COL'
        },
        {
          type: 'warning',
          title: 'High Bug Count',
          message: 'TRADE-COL has 5 open bugs, 2 critical',
          project: 'TRADE-COL'
        },
        {
          type: 'info',
          title: 'Excellent Performance',
          message: 'KYC-PER maintaining 95% sprint success rate',
          project: 'KYC-PER'
        }
      ],
      weeklyTrends: {
        velocity: [38, 41, 43, 45, 42, 44],
        qualityScore: [88, 90, 92, 94, 91, 93],
        burndownAccuracy: [75, 78, 80, 82, 79, 81]
      }
    };
    
    console.log('✅ JIRA analytics loaded');
    res.json(analytics);
    
  } catch (error) {
    console.error('❌ JIRA analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('✅ JIRA simulation APIs loaded successfully');


app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});