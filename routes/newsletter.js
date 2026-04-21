const express    = require('express');
const router     = express.Router();
const crypto     = require('crypto');
const Newsletter = require('../models/Newsletter');
const { protect, adminOnly } = require('../middleware/auth');
const { sendEmail } = require('../config/email');
const { body, validationResult } = require('express-validator');

// POST /api/newsletter/subscribe
router.post('/subscribe', [
  body('email').isEmail().normalizeEmail(),
  body('firstName').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { email, firstName } = req.body;
    const existing = await Newsletter.findOne({ email });

    if (existing) {
      if (existing.isActive) return res.json({ success: true, message: 'Already subscribed!' });
      existing.isActive = true;
      existing.unsubAt  = undefined;
      await existing.save();
      return res.json({ success: true, message: 'Resubscribed successfully.' });
    }

    const unsubToken = crypto.randomBytes(24).toString('hex');
    await Newsletter.create({ email, firstName, unsubToken });

    await sendEmail({
      to: email,
      subject: 'Welcome to the Luxiven Inner Circle',
      template: 'newsletterWelcome',
      data: { firstName, unsubUrl: `${process.env.FRONTEND_URL}/unsubscribe?token=${unsubToken}` },
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'Subscribed successfully. Welcome to Luxiven.' });
  } catch (err) { next(err); }
});

// GET /api/newsletter/unsubscribe
router.get('/unsubscribe', async (req, res, next) => {
  try {
    const sub = await Newsletter.findOne({ unsubToken: req.query.token });
    if (!sub) return res.status(404).json({ success: false, message: 'Token not found.' });
    sub.isActive = false;
    sub.unsubAt  = new Date();
    await sub.save();
    res.json({ success: true, message: 'Unsubscribed successfully.' });
  } catch (err) { next(err); }
});

// GET /api/newsletter/subscribers (admin)
router.get('/subscribers', protect, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const total = await Newsletter.countDocuments({ isActive: true });
    const subs  = await Newsletter.find({ isActive: true })
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ success: true, data: subs, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

module.exports = router;
