// 黑客松平台路由
const { Router } = require('express');
const express = require('express');
const path = require('path');
const { userMgr } = require('./hackathon/user-mgr');
const { HACKATHON_CONFIG } = require('./config/service-config');
const { CHARACTER_SPRITES } = require('./data/characters');

const router = Router();

router.get('/hackathon/participants', (_, res) => {
  const players = HACKATHON_CONFIG.AGENT_PLAYERS.map((participant) => ({
    role: participant.role,
    name: participant.name,
    agentId: participant.agentId,
    sprite: participant.sprite || null,
    enabled: participant.enabled !== false,
  }));
  res.json({
    count: players.length,
    players,
  });
});

router.get('/characters', (_, res) => {
  res.json({
    characters: CHARACTER_SPRITES,
  });
});

router.use('/skills', express.static(path.join(__dirname, '..', '..', 'skills')));

function adminAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.query.key;
  const entry = HACKATHON_CONFIG.API_KEYS[apiKey];
  if (entry && entry.role === 'admin') {
    return next();
  }

  const dynamicUser = userMgr.getUserByApiKey(apiKey);
  if (dynamicUser && dynamicUser.role === 'admin') {
    return next();
  }

  res.status(401).json({ error: '需要管理员权限' });
}

router.get('/users', adminAuth, (req, res) => {
  try {
    const users = userMgr.listUsers({ activeOnly: false });
    res.json({
      users: users.map((u) => ({
        ...u,
        apiKey: u.apiKey ? `${u.apiKey.slice(0, 8)}...${u.apiKey.slice(-6)}` : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/stats', adminAuth, (req, res) => {
  try {
    res.json(userMgr.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', adminAuth, express.json(), (req, res) => {
  try {
    const { name, role } = req.body;
    if (!name) {
      return res.status(400).json({ error: '用户名不能为空' });
    }

    const user = userMgr.createUser({ name, role });
    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        apiKey: user.apiKey,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/users/:id', adminAuth, (req, res) => {
  try {
    const success = userMgr.deactivateUser(req.params.id);
    if (!success) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ success: true, message: '用户已禁用' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:id/activate', adminAuth, (req, res) => {
  try {
    const success = userMgr.activateUser(req.params.id);
    if (!success) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ success: true, message: '用户已启用' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:id/regenerate-key', adminAuth, (req, res) => {
  try {
    const newKey = userMgr.regenerateApiKey(req.params.id);
    if (!newKey) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ success: true, apiKey: newKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
