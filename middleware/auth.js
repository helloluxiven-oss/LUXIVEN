const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── Verify JWT ──────────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    let token;

    // 1. Bearer token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // 2. Cookie fallback
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'luxiven-secret');
    const user    = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// ── Optional auth (attach user if token present, don't block) ───
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'luxiven-secret');
      req.user = await User.findById(decoded.id).select('-password');
    }
  } catch (_) { /* no token or invalid — that's fine */ }
  next();
};

// ── Admin only ──────────────────────────────────────────────────
exports.adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
};

// ── Generate JWT ─────────────────────────────────────────────────
exports.signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET || 'luxiven-secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
