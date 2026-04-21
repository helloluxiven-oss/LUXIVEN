// ═══════════════════════════════════════════════
//  reviews.js
// ═══════════════════════════════════════════════
const express  = require('express');
const router   = express.Router();
const Review   = require('../models/Review');
const Order    = require('../models/Order');
const { protect, adminOnly } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

router.get('/product/:productId', async (req, res, next) => {
  try {
    const reviews = await Review.find({ product: req.params.productId, isApproved: true })
      .sort('-createdAt')
      .populate('user', 'firstName lastName avatar')
      .limit(20);
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
});

router.post('/', protect, [
  body('product').notEmpty(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('body').optional().isLength({ max: 2000 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    // Check verified purchase
    const order = await Order.findOne({
      user: req.user._id,
      'items.product': req.body.product,
      paymentStatus: 'paid',
    });

    const review = await Review.create({
      ...req.body,
      user:     req.user._id,
      verified: !!order,
      order:    order?._id,
    });

    await review.populate('user', 'firstName lastName avatar');
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'You have already reviewed this product.' });
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Review deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
