const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { protect } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// GET /api/users/profile
router.get('/profile', protect, async (req, res) => {
  res.json({ success: true, data: req.user.toSafeObject() });
});

// PUT /api/users/profile
router.put('/profile', protect, [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('phone').optional(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const allowed = ['firstName', 'lastName', 'phone', 'avatar'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: user.toSafeObject() });
  } catch (err) { next(err); }
});

// POST /api/users/addresses
router.post('/addresses', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (req.body.isDefault) {
      user.addresses.forEach(a => { a.isDefault = false; });
    }
    user.addresses.push(req.body);
    await user.save();
    res.status(201).json({ success: true, data: user.addresses });
  } catch (err) { next(err); }
});

// PUT /api/users/addresses/:id
router.put('/addresses/:id', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found.' });
    if (req.body.isDefault) {
      user.addresses.forEach(a => { a.isDefault = false; });
    }
    Object.assign(addr, req.body);
    await user.save();
    res.json({ success: true, data: user.addresses });
  } catch (err) { next(err); }
});

// DELETE /api/users/addresses/:id
router.delete('/addresses/:id', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.addresses.id(req.params.id)?.deleteOne();
    await user.save();
    res.json({ success: true, data: user.addresses });
  } catch (err) { next(err); }
});

module.exports = router;
