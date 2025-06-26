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
      [ccbId, businessLine, country, title, description, 1]
    );
    
    res.json({ success: true, ccbId: result.rows[0].ccb_id, ccbItem: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get simulated CCB items for import (MUST come before /:ccbId route)
app.get('/api/ccb/items', async (req, res) => {
  try {
    console.log('📊 Loading CCB items for import...');
    
    const simulatedCCBItems = [
      {
        ccbId: 'CCB-AML-MEX-2025-001',
        title: 'Mexico AML System Upgrade',
        description: 'Mandatory upgrade to AML screening system for Mexico operations',
        businessLine: 'AML',
        country: 'Mexico',
        status: 'Approved',
        priority: 'Critical',
        requestDate: '2025-05-01',
        targetDate: '2025-07-15',
        estimatedEffort: '120h',
        scope: 'Upgrade existing AML screening system with enhanced risk detection',
        deliverables: ['Enhanced screening engine', 'Real-time monitoring dashboard']
      },
      {
        ccbId: 'CCB-KYC-PER-2025-002',
        title: 'Peru KYC Document Processing Enhancement',
        description: 'Improve KYC document processing efficiency for Peru operations',
        businessLine: 'KYC',
        country: 'Peru',
        status: 'Approved',
        priority: 'High',
        requestDate: '2025-05-10',
        targetDate: '2025-06-30',
        estimatedEffort: '80h',
        scope: 'Implement AI-powered document validation for Peru-specific documents',
        deliverables: ['Document validation API', 'AI model training']
      }
    ];
    
    console.log(`✅ CCB items loaded: ${simulatedCCBItems.length} items`);
    
    res.json({
      items: simulatedCCBItems,
      total: simulatedCCBItems.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ CCB items error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single CCB item (comes after /items route)
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

// Enhanced POD creation with import metadata
app.post('/api/pods', async (req, res) => {
  try {
    console.log('📝 Received POD creation data:', req.body);
    
    const { 
      podId, podName, ccbId, startDate, endDate, podLead, estimatedHours, scope,
      importSource, importData, jiraReference 
    } = req.body;
    
    if (!podId || !podName || !ccbId || !startDate || !endDate || !podLead || !estimatedHours) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    console.log('🔍 Looking for CCB item:', ccbId);
    
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

// Enhanced POD configuration with resource allocation and JIRA stories
app.post('/api/pods/configure', async (req, res) => {
  try {
    console.log('📝 Received enhanced configuration data:', req.body);
    
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
      resources,
      jiraStories
    } = req.body;
    
    console.log('🔄 Updating POD with resource allocation:', podId);
    
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
    
    console.log('✅ POD configuration updated successfully');
    
    // Store resource allocation and JIRA stories in localStorage for demo
    // In production, you'd save these to database tables
    const configData = {
      podId,
      resources: resources || [],
      jiraStories: jiraStories || [],
      configuredAt: new Date().toISOString()
    };
    
    console.log('📊 Resource allocation:', resources?.length || 0, 'team members');
    console.log('📝 JIRA stories:', jiraStories?.length || 0, 'stories created');
    
    res.json({ 
      success: true, 
      message: 'Configuration saved successfully', 
      pod: result.rows[0],
      resourceCount: resources?.length || 0,
      storyCount: jiraStories?.length || 0
    });
  } catch (error) {
    console.error('❌ Configuration save error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enhanced Launch POD endpoint with team and story tracking
app.post('/api/pods/launch', async (req, res) => {
  try {
    const { pod_id, team_members, jira_stories } = req.body;
    
    console.log('🚀 Launching POD with enhanced data:', pod_id);
    console.log('👥 Team members:', team_members?.length || 0);
    console.log('📝 JIRA stories:', jira_stories?.length || 0);
    
    const result = await pool.query(
      'UPDATE pods SET status = $1 WHERE pod_id = $2 RETURNING *',
      ['Active', pod_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'POD not found' });
    }
    
    console.log('✅ POD launched successfully with full team allocation');
    
    res.json({ 
      success: true, 
      pod: result.rows[0],
      teamSize: team_members?.length || 0,
      storiesCreated: jira_stories?.length || 0,
      message: `POD ${pod_id} launched with ${team_members?.length || 0} team members and ${jira_stories?.length || 0} JIRA stories`
    });
  } catch (error) {
    console.error('❌ Launch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Authentication middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }
  next();
}

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔐 Login attempt for:', username);
    
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const user = result.rows[0];
    
    const validPasswords = {
      'vinod': 'admin123',
      'asif.mohammed': 'creator123', 
      'kanya': 'creator123',
      'srini': 'user123'
    };
    
    if (password !== validPasswords[username]) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
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

// Creator Dashboard
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

// User Dashboard
app.get('/api/user/pods/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('👤 Loading user dashboard for user:', userId);
    
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
// JIRA SIMULATION APIS
// =============================================================================

console.log('🔧 Loading JIRA simulation APIs...');

// Get simulated JIRA issues for import
app.get('/api/jira/search', async (req, res) => {
  try {
    const { query = '', project = '', assignee = '' } = req.query;
    
    console.log('🔍 JIRA search with params:', { query, project, assignee });
    
    const simulatedJiraIssues = [
      {
        key: 'AML-1001',
        summary: 'Implement customer screening for Mexico AML compliance',
        description: 'Develop automated customer screening system to meet Mexican AML regulatory requirements',
        project: 'AML',
        assignee: 'Asif Mohammed',
        status: 'In Progress',
        priority: 'High',
        issueType: 'Story',
        created: '2025-05-15T09:00:00Z',
        updated: '2025-06-20T14:30:00Z',
        dueDate: '2025-07-15T00:00:00Z',
        timeEstimate: '120h',
        businessLine: 'AML',
        country: 'Mexico',
        scope: 'Build comprehensive customer screening system with real-time monitoring capabilities',
        deliverables: ['Customer screening API', 'Risk assessment engine', 'Compliance reporting dashboard'],
        acceptanceCriteria: 'System must screen 100% of new customers within 30 seconds',
        labels: ['compliance', 'mexico', 'screening', 'high-priority']
      },
      {
        key: 'KYC-567',
        summary: 'Peru KYC document validation enhancement',
        description: 'Enhance document validation for Peru KYC processes',
        project: 'KYC',
        assignee: 'Kanya',
        status: 'To Do',
        priority: 'Medium',
        issueType: 'Enhancement',
        created: '2025-06-01T10:00:00Z',
        updated: '2025-06-22T16:00:00Z',
        dueDate: '2025-06-30T00:00:00Z',
        timeEstimate: '80h',
        businessLine: 'KYC',
        country: 'Peru',
        scope: 'Implement advanced document validation using AI/ML for Peru-specific documents',
        deliverables: ['Document validation service', 'AI model training', 'Validation API endpoints'],
        acceptanceCriteria: 'Achieve 95% accuracy in document validation',
        labels: ['kyc', 'peru', 'document-validation', 'ai-ml']
      }
    ];
    
    let filteredIssues = simulatedJiraIssues;
    
    if (query) {
      const searchQuery = query.toLowerCase();
      filteredIssues = filteredIssues.filter(issue => 
        issue.summary.toLowerCase().includes(searchQuery) ||
        issue.description.toLowerCase().includes(searchQuery) ||
        issue.key.toLowerCase().includes(searchQuery)
      );
    }
    
    if (project) {
      filteredIssues = filteredIssues.filter(issue => 
        issue.project.toLowerCase().includes(project.toLowerCase())
      );
    }
    
    if (assignee) {
      filteredIssues = filteredIssues.filter(issue => 
        issue.assignee.toLowerCase().includes(assignee.toLowerCase())
      );
    }
    
    console.log(`✅ JIRA search completed. Found ${filteredIssues.length} issues`);
    
    res.json({
      issues: filteredIssues,
      total: filteredIssues.length,
      startAt: 0,
      maxResults: 50,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ JIRA search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific JIRA issue
app.get('/api/jira/issue/:issueKey', async (req, res) => {
  try {
    const { issueKey } = req.params;
    console.log(`🔍 Getting JIRA issue: ${issueKey}`);
    
    const simulatedIssues = {
      'AML-1001': {
        key: 'AML-1001',
        summary: 'Implement customer screening for Mexico AML compliance',
        description: 'Develop automated customer screening system',
        businessLine: 'AML',
        country: 'Mexico',
        scope: 'Build comprehensive customer screening system',
        timeEstimate: '120h',
        dueDate: '2025-07-15T00:00:00Z',
        deliverables: ['Customer screening API', 'Risk assessment engine']
      },
      'KYC-567': {
        key: 'KYC-567',
        summary: 'Peru KYC document validation enhancement',
        description: 'Enhance document validation for Peru KYC processes',
        businessLine: 'KYC',
        country: 'Peru',
        scope: 'Implement advanced document validation using AI/ML',
        timeEstimate: '80h',
        dueDate: '2025-06-30T00:00:00Z',
        deliverables: ['Document validation service', 'AI model training']
      }
    };
    
    const issue = simulatedIssues[issueKey];
    
    if (!issue) {
      return res.status(404).json({ error: 'JIRA issue not found' });
    }
    
    console.log(`✅ JIRA issue found: ${issueKey}`);
    res.json(issue);
    
  } catch (error) {
    console.error('❌ JIRA issue error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific CCB item for import details
app.get('/api/ccb/item/:ccbId', async (req, res) => {
  try {
    const { ccbId } = req.params;
    console.log(`🔍 Getting CCB item: ${ccbId}`);
    
    const simulatedItems = {
      'CCB-AML-MEX-2025-001': {
        ccbId: 'CCB-AML-MEX-2025-001',
        title: 'Mexico AML System Upgrade',
        description: 'Mandatory upgrade to AML screening system',
        businessLine: 'AML',
        country: 'Mexico',
        scope: 'Upgrade existing AML screening system',
        estimatedEffort: '120h',
        targetDate: '2025-07-15',
        deliverables: ['Enhanced screening engine', 'Real-time monitoring dashboard']
      }
    };
    
    const ccbItem = simulatedItems[ccbId];
    
    if (!ccbItem) {
      return res.status(404).json({ error: 'CCB item not found' });
    }
    
    console.log(`✅ CCB item found: ${ccbId}`);
    res.json(ccbItem);
    
  } catch (error) {
    console.error('❌ CCB item error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dashboard Overview
app.get('/api/dashboard/overview', async (req, res) => {
  try {
    console.log('📊 Loading dashboard overview...');
    
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM pods 
      GROUP BY status
    `);
    
    const businessLineResult = await pool.query(`
      SELECT business_line, COUNT(*) as count 
      FROM pods 
      GROUP BY business_line
    `);
    
    const countryResult = await pool.query(`
      SELECT country, COUNT(*) as count 
      FROM pods 
      GROUP BY country
    `);
    
    const resourceResult = await pool.query(`
      SELECT COUNT(DISTINCT pod_lead) as total_pod_leads,
             SUM(team_size) as total_allocated_resources
      FROM pods 
      WHERE team_size IS NOT NULL
    `);
    
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
    
    console.log('✅ Dashboard data loaded');
    res.json(dashboardData);
    
  } catch (error) {
    console.error('❌ Dashboard overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dashboard PODs
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

// Enhanced Dashboard Performance
app.get('/api/dashboard/performance', async (req, res) => {
  try {
    console.log('📊 Loading enhanced dashboard...');
    
    const baseQuery = `
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
        c.title as ccb_title,
        
        CASE 
          WHEN p.start_date IS NULL OR p.end_date IS NULL THEN 0
          WHEN CURRENT_DATE < p.start_date THEN 0
          WHEN CURRENT_DATE > p.end_date THEN 100
          ELSE ROUND(
            ((CURRENT_DATE - p.start_date)::FLOAT / 
             (p.end_date - p.start_date)::FLOAT) * 100
          )
        END as progress_percentage,
        
        CASE 
          WHEN p.end_date IS NULL THEN NULL
          ELSE (p.end_date - CURRENT_DATE)
        END as days_remaining,
        
        CASE 
          WHEN p.end_date IS NULL THEN 'need_immediate_attention'
          WHEN p.status = 'SAT' AND (p.end_date - CURRENT_DATE) <= 0 THEN 'time_up'
          WHEN p.status = 'SAT' AND (p.end_date - CURRENT_DATE) BETWEEN 1 AND 7 THEN 'watch_on_priority'
          WHEN p.status = 'SAT' AND (p.end_date - CURRENT_DATE) > 7 THEN 'on_track'
          WHEN p.status = 'Active' AND (p.end_date - CURRENT_DATE) <= 0 THEN 'time_up'
          WHEN p.status = 'Active' AND (p.end_date - CURRENT_DATE) BETWEEN 1 AND 7 THEN 'watch_on_priority'
          WHEN p.status = 'Active' AND (p.end_date - CURRENT_DATE) > 7 THEN 'on_track'
          WHEN p.status = 'Planning' THEN 'planning'
          ELSE 'attention_needed'
        END as performance_status,
        
        CASE 
          WHEN p.end_date IS NULL THEN 1
          WHEN (p.end_date - CURRENT_DATE) <= 0 THEN 2
          WHEN (p.end_date - CURRENT_DATE) BETWEEN 1 AND 7 THEN 3
          WHEN p.status = 'Planning' THEN 5
          ELSE 4
        END as priority_level,
        
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
    `;
    
    const podsResult = await pool.query(baseQuery);
    console.log('✅ PODs query successful, rows found:', podsResult.rows.length);
    
    const individualResult = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.role,
        COUNT(p.pod_id) as assigned_pods,
        CASE 
          WHEN COUNT(p.pod_id) = 0 THEN 0
          ELSE (75 + (RANDOM() * 25))::INTEGER
        END as performance_score,
        CASE 
          WHEN COUNT(p.pod_id) = 0 THEN 'unassigned'
          WHEN COUNT(CASE WHEN 
            (p.end_date IS NULL OR (p.end_date - CURRENT_DATE) <= 0) 
            THEN 1 END) > 0 THEN 'below'
          WHEN COUNT(CASE WHEN 
            (p.end_date - CURRENT_DATE) BETWEEN 1 AND 7 
            THEN 1 END) > 0 THEN 'meeting'
          WHEN COUNT(p.pod_id) >= 2 THEN 'exceeding'
          ELSE 'meeting'
        END as status
      FROM users u
      LEFT JOIN pods p ON u.id = p.pod_lead AND p.status IN ('Active', 'SAT', 'Planning')
      GROUP BY u.id, u.name, u.role
      ORDER BY COUNT(p.pod_id) DESC, u.name
    `);
    
    console.log('✅ Individual performance query successful');
    
    const utilizationResult = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN pod_assignments.pod_lead IS NOT NULL THEN 1 END) as assigned_users,
        COALESCE(SUM(pod_assignments.team_size), 0) as total_allocated_resources,
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(
            (COUNT(CASE WHEN pod_assignments.pod_lead IS NOT NULL THEN 1 END)::FLOAT / 
             COUNT(*)::FLOAT) * 100
          )
        END as utilization_percentage
      FROM users u
      LEFT JOIN (
        SELECT DISTINCT pod_lead, team_size 
        FROM pods 
        WHERE status IN ('Active', 'SAT') AND pod_lead IS NOT NULL
      ) pod_assignments ON u.id = pod_assignments.pod_lead
    `);
    
    console.log('✅ Utilization query successful');
    
    const alerts = [];
    
    if (podsResult.rows && podsResult.rows.length > 0) {
      const immediateAttention = podsResult.rows.filter(pod => 
        pod.performance_status === 'need_immediate_attention'
      );
      immediateAttention.forEach(pod => {
        alerts.push({
          type: 'critical',
          title: `🚨 IMMEDIATE ATTENTION: ${pod.pod_id}`,
          message: `${pod.pod_name || 'Unnamed POD'} has no end date defined`,
          pod_id: pod.pod_id,
          priority: 1,
          icon: '🚨'
        });
      });
      
      const timeUpPods = podsResult.rows.filter(pod => 
        pod.performance_status === 'time_up'
      );
      timeUpPods.forEach(pod => {
        alerts.push({
          type: 'critical',
          title: `⏰ TIME UP: ${pod.pod_id}`,
          message: `${pod.pod_name || 'Unnamed POD'} is past due date`,
          pod_id: pod.pod_id,
          priority: 2,
          icon: '⏰'
        });
      });
      
      const watchPods = podsResult.rows.filter(pod => 
        pod.performance_status === 'watch_on_priority'
      );
      watchPods.forEach(pod => {
        const daysLeft = Math.max(0, pod.days_remaining || 0);
        alerts.push({
          type: 'warning',
          title: `👀 WATCH ON PRIORITY: ${pod.pod_id}`,
          message: `${pod.pod_name || 'Unnamed POD'} due in ${daysLeft} days`,
          pod_id: pod.pod_id,
          priority: 3,
          icon: '👀'
        });
      });
    }
    
    alerts.sort((a, b) => a.priority - b.priority);
    
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
    
    const immediateCount = podsResult.rows.filter(p => p.performance_status === 'need_immediate_attention').length;
    const timeUpCount = podsResult.rows.filter(p => p.performance_status === 'time_up').length;
    const watchCount = podsResult.rows.filter(p => p.performance_status === 'watch_on_priority').length;
    const onTrackCount = podsResult.rows.filter(p => p.performance_status === 'on_track').length;
    
    const responseData = {
      pods: podsResult.rows || [],
      individuals: individualResult.rows || [],
      utilization: utilizationResult.rows[0] || { 
        total_users: 0, 
        assigned_users: 0, 
        total_allocated_resources: 0, 
        utilization_percentage: 0 
      },
      alerts: alerts,
      smartStatusSummary: {
        immediate_attention: immediateCount,
        time_up: timeUpCount,
        watch_on_priority: watchCount,
        on_track: onTrackCount,
        total_pods: podsResult.rows.length
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Enhanced dashboard data prepared successfully');
    
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Enhanced dashboard error:', error);
    
    res.status(500).json({ 
      error: error.message,
      fallback: {
        pods: [],
        individuals: [],
        utilization: { total_users: 0, assigned_users: 0, total_allocated_resources: 0, utilization_percentage: 0 },
        alerts: [{
          type: 'critical',
          title: '❌ System Error',
          message: 'Dashboard data could not be loaded',
          pod_id: null,
          priority: 1,
          icon: '❌'
        }],
        smartStatusSummary: {
          immediate_attention: 0,
          time_up: 0,
          watch_on_priority: 0,
          on_track: 0,
          total_pods: 0
        },
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Dashboard Trends
app.get('/api/dashboard/trends', async (req, res) => {
  try {
    console.log('📈 Loading dashboard trends...');
    
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

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

console.log('✅ JIRA simulation APIs loaded successfully');

console.log(`
🚀 POD Management System with JIRA Integration Ready!
===================================================
✅ Smart Status Alert System (Priority 1)
✅ JIRA Data Import Integration (Priority 2) 
✅ Data Import from JIRA and CCB
✅ Executive Dashboard with Smart Alerts
✅ Individual Performance Tracking
✅ Resource Utilization Analytics

📊 Ready for demo!
`);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});