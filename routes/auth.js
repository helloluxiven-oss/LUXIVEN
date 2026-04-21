const express   = require('express');
const router    = express.Router();
const { body, validationResult } = require('express-validator');
const crypto    = require('crypto');
const User      = require('../models/User');
const { signToken, protect } = require('../middleware/auth');
const { sendEmail } = require('../config/email');

// ── Helper ──────────────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  next();
};

const respond = (res, user, statusCode = 200) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: user.toSafeObject(),
  });
};

// ── POST /api/auth/register ──────────────────────────────────────
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password min 8 characters'),
], validate, async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (await User.findOne({ email })) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      firstName, lastName, email, password,
      verifyToken,
    });

    // Send welcome / verification email
    await sendEmail({
      to: email,
      subject: 'Welcome to Luxiven — Verify Your Email',
      template: 'welcome',
      data: { name: firstName, verifyUrl: `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}` },
    }).catch(() => {}); // non-blocking

    respond(res, user, 201);
  } catch (err) { next(err); }
});

// ── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account suspended.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    respond(res, user);
  } catch (err) { next(err); }
});

// ── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
});

// ── POST /api/auth/forgot-password ──────────────────────────────
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], validate, async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    // Always return success (don't reveal whether email exists)
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.resetPasswordToken   = token;
    user.resetPasswordExpires = expires;
    await user.save({ validateBeforeSave: false });

    await sendEmail({
      to: user.email,
      subject: 'Luxiven — Reset Your Password',
      template: 'resetPassword',
      data: {
        name: user.firstName,
        resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${token}`,
      },
    }).catch(() => {});

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) { next(err); }
});

// ── POST /api/auth/reset-password ───────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
], validate, async (req, res, next) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.body.token,
      resetPasswordExpires: { $gt: Date.now() },
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });

    user.password             = req.body.password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    respond(res, user);
  } catch (err) { next(err); }
});

// ── GET /api/auth/verify-email ───────────────────────────────────
router.get('/verify-email', async (req, res, next) => {
  try {
    const user = await User.findOne({ verifyToken: req.query.token }).select('+verifyToken');
    if (!user) return res.status(400).json({ success: false, message: 'Invalid verify token.' });
    user.isVerified  = true;
    user.verifyToken = undefined;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Email verified successfully.' });
  } catch (err) { next(err); }
});

// ── POST /api/auth/change-password ──────────────────────────────
router.post('/change-password', protect, [
  body('current').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], validate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(req.body.current))) {
      return res.status(401).json({ success: false, message: 'Current password incorrect.' });
    }
    user.password = req.body.newPassword;
    await user.save();
    respond(res, user);
  } catch (err) { next(err); }
});

module.exports = router;
