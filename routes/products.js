const express  = require('express');
const router   = express.Router();
const { body, query, validationResult } = require('express-validator');
const Product  = require('../models/Product');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');

// ── GET /api/products ────────────────────────────────────────────
// Query params: category, minPrice, maxPrice, sort, page, limit, search, featured, badge
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      category, minPrice, maxPrice, sort = '-createdAt',
      page = 1, limit = 12,
      search, featured, badge, tag,
    } = req.query;

    const filter = { isActive: true, isDeleted: false };

    if (category) filter.category = category;
    if (featured === 'true') filter.isFeatured = true;
    if (badge)    filter.badge = badge;
    if (tag)      filter.tags  = tag;

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (search) {
      filter.$text = { $search: search };
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .select('-cost -supplierSku');

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        page:  Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/products/featured ───────────────────────────────────
router.get('/featured', async (req, res, next) => {
  try {
    const products = await Product.find({ isFeatured: true, isActive: true, isDeleted: false })
      .sort('-soldCount')
      .limit(8)
      .select('-cost -supplierSku');
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

// ── GET /api/products/categories ────────────────────────────────
router.get('/categories', async (req, res, next) => {
  try {
    const cats = await Product.aggregate([
      { $match: { isActive: true, isDeleted: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, data: cats });
  } catch (err) { next(err); }
});

// ── GET /api/products/:slug ──────────────────────────────────────
router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const product = await Product.findOneAndUpdate(
      { slug: req.params.slug, isActive: true, isDeleted: false },
      { $inc: { viewCount: 1 } },
      { new: true }
    ).select('-cost');

    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    // Related products
    const related = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isActive: true, isDeleted: false,
    }).limit(4).select('name slug price compareAt images reviewSummary badge');

    res.json({ success: true, data: product, related });
  } catch (err) { next(err); }
});

// ── POST /api/products (admin) ───────────────────────────────────
router.post('/', protect, adminOnly, [
  body('name').trim().notEmpty(),
  body('slug').trim().notEmpty().matches(/^[a-z0-9-]+$/),
  body('description').notEmpty(),
  body('category').isIn(['living-room','bedroom','office','decor','lighting','outdoor']),
  body('price').isFloat({ min: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const product = await Product.create(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Slug already exists.' });
    next(err);
  }
});

// ── PUT /api/products/:id (admin) ────────────────────────────────
router.put('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

// ── DELETE /api/products/:id (admin — soft delete) ───────────────
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false });
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
