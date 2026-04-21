const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Product = require('../models/Product');
const User    = require('../models/User');
const Review  = require('../models/Review');
const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ── GET /api/admin/dashboard ─ Stats overview ────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const now       = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLast  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLast    = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalOrders, monthOrders, lastMonthOrders,
      totalRevenue, monthRevenue,
      totalUsers, monthUsers,
      totalProducts, lowStock,
      pendingOrders, recentOrders,
      topProducts,
      salesByDay,
    ] = await Promise.all([
      Order.countDocuments({ paymentStatus: 'paid' }),
      Order.countDocuments({ paymentStatus: 'paid', createdAt: { $gte: startMonth } }),
      Order.countDocuments({ paymentStatus: 'paid', createdAt: { $gte: startLast, $lte: endLast } }),

      Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Order.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: startMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),

      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'customer', createdAt: { $gte: startMonth } }),

      Product.countDocuments({ isActive: true, isDeleted: false }),
      Product.countDocuments({ isActive: true, isDeleted: false, $expr: { $lte: ['$stock', '$lowStockAt'] } }),

      Order.countDocuments({ status: 'pending' }),
      Order.find({ paymentStatus: 'paid' }).sort('-createdAt').limit(8)
        .populate('user', 'firstName lastName email').select('orderNumber total status createdAt items'),

      Product.find({ isActive: true, isDeleted: false }).sort('-soldCount').limit(5)
        .select('name slug images price soldCount reviewSummary'),

      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const rev        = totalRevenue[0]?.total || 0;
    const monthRev   = monthRevenue[0]?.total || 0;
    const ordGrowth  = lastMonthOrders > 0 ? (((monthOrders - lastMonthOrders) / lastMonthOrders) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        stats: {
          totalOrders, monthOrders, ordGrowth,
          totalRevenue: rev, monthRevenue: monthRev,
          totalUsers, monthUsers,
          totalProducts, lowStock,
          pendingOrders,
        },
        recentOrders,
        topProducts,
        salesByDay,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/orders ─ All orders with filters ──────────────
router.get('/orders', async (req, res, next) => {
  try {
    const { status, paymentStatus, page = 1, limit = 20, search, from, to } = req.query;
    const filter = {};
    if (status)        filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    if (search) filter.orderNumber = { $regex: search, $options: 'i' };

    const total  = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('user', 'firstName lastName email');

    res.json({ success: true, data: orders, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/orders/:id ─ Update order status/tracking ─────
router.put('/orders/:id', async (req, res, next) => {
  try {
    const { status, trackingNumber, trackingCarrier, trackingUrl, adminNotes } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    if (status && status !== order.status) {
      order.status = status;
      order.timeline.push({ status, note: `Status updated to ${status} by admin.` });
      if (status === 'shipped') order.shippedAt   = new Date();
      if (status === 'delivered') order.deliveredAt = new Date();
    }
    if (trackingNumber) order.trackingNumber  = trackingNumber;
    if (trackingCarrier) order.trackingCarrier = trackingCarrier;
    if (trackingUrl)    order.trackingUrl     = trackingUrl;
    if (adminNotes)     order.adminNotes      = adminNotes;

    await order.save();
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// ── GET /api/admin/users ─ All users ─────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName:  { $regex: search, $options: 'i' } },
      ];
    }
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-password');
    res.json({ success: true, data: users, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/users/:id ─ Toggle active / change role ───────
router.put('/users/:id', async (req, res, next) => {
  try {
    const { isActive, role } = req.body;
    const update = {};
    if (isActive !== undefined) update.isActive = isActive;
    if (role)                   update.role     = role;
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ── GET /api/admin/reviews ─ Moderate reviews ────────────────────
router.get('/reviews', async (req, res, next) => {
  try {
    const reviews = await Review.find()
      .sort('-createdAt')
      .populate('user', 'firstName lastName email')
      .populate('product', 'name slug');
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
});

router.put('/reviews/:id', async (req, res, next) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { isApproved: req.body.isApproved }, { new: true });
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
});

// ── GET /api/admin/analytics/revenue ─────────────────────────────
router.get('/analytics/revenue', async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$total' },
        orders:  { $sum: 1 },
        items:   { $sum: { $size: '$items' } },
      }},
      { $sort: { _id: 1 } },
    ]);

    const byCategory = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: since } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      { $group: { _id: '$prod.category', revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }, count: { $sum: '$items.quantity' } } },
      { $sort: { revenue: -1 } },
    ]);

    res.json({ success: true, data: { daily: data, byCategory } });
  } catch (err) { next(err); }
});

module.exports = router;
