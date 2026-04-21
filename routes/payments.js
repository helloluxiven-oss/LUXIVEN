const express = require('express');
const router  = express.Router();
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const Cart    = require('../models/Cart');
const Order   = require('../models/Order');
const { protect, optionalAuth } = require('../middleware/auth');

// ── POST /api/payments/create-intent ─────────────────────────────
// Creates a Stripe PaymentIntent for checkout
router.post('/create-intent', optionalAuth, async (req, res, next) => {
  try {
    const cartQuery = req.user ? { user: req.user._id } : { sessionId: req.sessionID };
    const cart      = await Cart.findOne(cartQuery).populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }

    let subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const discountAmt = cart.discount > 0 ? Math.round((subtotal * cart.discount) / 100) : 0;
    const shipping    = subtotal >= 200 ? 0 : 15;
    const tax         = Math.round((subtotal - discountAmt) * 0.08 * 100) / 100;
    const total       = subtotal - discountAmt + shipping + tax;

    const intent = await stripe.paymentIntents.create({
      amount:   Math.round(total * 100),       // Stripe uses cents
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId:    req.user?._id?.toString() || 'guest',
        sessionId: req.sessionID,
      },
    });

    res.json({
      success: true,
      clientSecret: intent.client_secret,
      amount: total,
    });
  } catch (err) { next(err); }
});

// ── POST /api/payments/webhook ────────────────────────────────────
// Stripe webhook — must use raw body
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig    = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error('Webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle events
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        await Order.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { paymentStatus: 'paid', paidAt: new Date(), $push: { timeline: { status: 'confirmed', note: 'Payment received.' } } }
        );
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await Order.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { paymentStatus: 'failed', $push: { timeline: { status: 'pending', note: 'Payment failed.' } } }
        );
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        await Order.findOneAndUpdate(
          { stripeChargeId: charge.id },
          { paymentStatus: 'refunded', $push: { timeline: { status: 'refunded', note: 'Refund processed.' } } }
        );
        break;
      }
      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    res.json({ received: true });
  }
);

// ── POST /api/payments/refund (admin) ────────────────────────────
router.post('/refund', protect, async (req, res, next) => {
  try {
    const { orderId, amount } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (!order.stripePaymentIntentId) {
      return res.status(400).json({ success: false, message: 'No Stripe payment found for this order.' });
    }

    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount: amount ? Math.round(amount * 100) : undefined,  // undefined = full refund
    });

    order.paymentStatus   = amount ? 'partially_refunded' : 'refunded';
    order.refundedAmount += amount || order.total;
    order.timeline.push({ status: 'refunded', note: `Refund of $${amount || order.total} issued.` });
    await order.save();

    res.json({ success: true, data: refund });
  } catch (err) { next(err); }
});

module.exports = router;
