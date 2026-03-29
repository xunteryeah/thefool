// 黑客松平台路由 — 精简为 Skill 文件服务
const { Router } = require('express');
const express = require('express');
const path = require('path');

const router = Router();

// ── /skills/* 静态文件路由，指向项目根目录的 skills/ 目录 ─────────────────────────
router.use('/skills', express.static(path.join(__dirname, '..', '..', 'skills')));

module.exports = router;
