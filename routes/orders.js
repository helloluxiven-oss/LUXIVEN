const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Cart    = require('../models/Cart');
const Product = require('../models/Product');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');
const { sendEmail } = require('../config/email');

// ── POST /api/orders ─ Place order ───────────────────────────────
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { shippingAddress, billingAddress, paymentMethod = 'stripe',
            paymentIntentId, notes, guestEmail } = req.body;

    // Resolve cart
    const cartQuery = req.user ? { user: req.user._id } : { sessionId: req.sessionID };
    const cart = await Cart.findOne(cartQuery).populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }

    // Build order items + verify stock
    const items = [];
    let subtotal = 0;
    for (const item of cart.items) {
      const prod = item.product;
      if (!prod || !prod.isActive) {
        return res.status(400).json({ success: false, message: `${prod?.name || 'A product'} is no longer available.` });
      }
      if (prod.stock < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${prod.name}.` });
      }
      items.push({
        product:  prod._id,
        name:     prod.name,
        image:    prod.images?.[0],
        price:    item.price,
        quantity: item.quantity,
        variant:  item.variant,
        variantId: item.variantId,
      });
      subtotal += item.price * item.quantity;
    }

    const discountAmt = cart.discount > 0 ? Math.round((subtotal * cart.discount) / 100) : 0;
    const shipping    = subtotal >= 200 ? 0 : 15;
    const tax         = Math.round((subtotal - discountAmt) * 0.08 * 100) / 100;  // 8% tax
    const total       = subtotal - discountAmt + shipping + tax;

    const order = await Order.create({
      user:            req.user?._id,
      guestEmail:      guestEmail || req.user?.email,
      items,
      shippingAddress,
      billingAddress:  billingAddress || shippingAddress,
      subtotal,
      shipping,
      tax,
      discount:        discountAmt,
      couponCode:      cart.couponCode,
      total,
      paymentMethod,
      paymentStatus:   paymentMethod === 'cod' ? 'pending' : 'paid',
      stripePaymentIntentId: paymentIntentId,
      paidAt:          paymentMethod !== 'cod' ? new Date() : undefined,
      status:          'confirmed',
      notes,
      timeline:        [{ status: 'confirmed', note: 'Order placed and confirmed.' }],
    });

    // Decrement stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity, soldCount: item.quantity },
      });
    }

    // Clear cart
    cart.items      = [];
    cart.couponCode = undefined;
    cart.discount   = 0;
    await cart.save();

    // Send confirmation email
    const emailTo = req.user?.email || guestEmail;
    if (emailTo) {
      await sendEmail({
        to: emailTo,
        subject: `Luxiven — Order Confirmed #${order.orderNumber}`,
        template: 'orderConfirmation',
        data: { order },
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
});

// ── GET /api/orders/my ─ User's orders ───────────────────────────
router.get('/my', protect, async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort('-createdAt')
      .select('-adminNotes');
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});

// ── GET /api/orders/track/:orderNumber ─ Guest tracking ──────────
router.get('/track/:orderNumber', async (req, res, next) => {
  try {
    const { email } = req.query;
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    // Verify ownership (email match or logged-in user)
    const ownerEmail = order.guestEmail || '';
    if (email && ownerEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Email does not match order.' });
    }

    res.json({
      success: true,
      data: {
        orderNumber:     order.orderNumber,
        status:          order.status,
        paymentStatus:   order.paymentStatus,
        trackingNumber:  order.trackingNumber,
        trackingCarrier: order.trackingCarrier,
        trackingUrl:     order.trackingUrl,
        items:           order.items,
        total:           order.total,
        shippingAddress: order.shippingAddress,
        timeline:        order.timeline,
        createdAt:       order.createdAt,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/orders/:id ───────────────────────────────────────────
router.get('/:id', protect, async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// ── POST /api/orders/:id/cancel ───────────────────────────────────
router.post('/:id/cancel', protect, async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (!['pending','confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage.' });
    }

    order.status      = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = req.body.reason || 'Customer request';
    order.timeline.push({ status: 'cancelled', note: 'Cancelled by customer.' });
    await order.save();

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity, soldCount: -item.quantity } });
    }

    res.json({ success: true, message: 'Order cancelled.', data: order });
  } catch (err) { next(err); }
});

module.exports = router;
