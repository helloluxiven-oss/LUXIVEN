const express = require('express');
const router  = express.Router();
const Cart    = require('../models/Cart');
const Product = require('../models/Product');
const { protect, optionalAuth } = require('../middleware/auth');

// Helper: get or create cart
async function getCart(req) {
  const query = req.user ? { user: req.user._id } : { sessionId: req.sessionID };
  let cart = await Cart.findOne(query).populate('items.product', 'name images price stock slug');
  if (!cart) {
    cart = await Cart.create({ ...query, items: [] });
  }
  return cart;
}

// ── GET /api/cart ─────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const cart = await getCart(req);
    res.json({ success: true, data: cart });
  } catch (err) { next(err); }
});

// ── POST /api/cart/add ────────────────────────────────────────────
router.post('/add', optionalAuth, async (req, res, next) => {
  try {
    const { productId, quantity = 1, variant, variantId } = req.body;

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock.' });
    }

    const cart   = await getCart(req);
    const exists = cart.items.find(i =>
      i.product.toString() === productId &&
      i.variant === (variant || null)
    );

    if (exists) {
      exists.quantity = Math.min(exists.quantity + quantity, product.stock);
    } else {
      cart.items.push({ product: productId, quantity, variant, variantId, price: product.price });
    }

    // Merge with user account if just logged in
    if (req.user && !cart.user) {
      cart.user      = req.user._id;
      cart.sessionId = undefined;
    }

    await cart.save();
    await cart.populate('items.product', 'name images price stock slug');
    res.json({ success: true, data: cart, message: 'Added to cart.' });
  } catch (err) { next(err); }
});

// ── PUT /api/cart/update ─────────────────────────────────────────
router.put('/update', optionalAuth, async (req, res, next) => {
  try {
    const { itemId, quantity } = req.body;
    const cart = await getCart(req);
    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    if (quantity <= 0) {
      item.deleteOne();
    } else {
      item.quantity = quantity;
    }

    await cart.save();
    await cart.populate('items.product', 'name images price stock slug');
    res.json({ success: true, data: cart });
  } catch (err) { next(err); }
});

// ── DELETE /api/cart/remove/:itemId ──────────────────────────────
router.delete('/remove/:itemId', optionalAuth, async (req, res, next) => {
  try {
    const cart = await getCart(req);
    cart.items.id(req.params.itemId)?.deleteOne();
    await cart.save();
    res.json({ success: true, data: cart, message: 'Item removed.' });
  } catch (err) { next(err); }
});

// ── DELETE /api/cart/clear ────────────────────────────────────────
router.delete('/clear', optionalAuth, async (req, res, next) => {
  try {
    const cart = await getCart(req);
    cart.items  = [];
    cart.couponCode = undefined;
    cart.discount   = 0;
    await cart.save();
    res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) { next(err); }
});

// ── POST /api/cart/coupon ─────────────────────────────────────────
router.post('/coupon', optionalAuth, async (req, res, next) => {
  try {
    // Simple coupon logic — extend with a Coupon model as needed
    const COUPONS = {
      'LUXIVEN10': 10,
      'WELCOME20': 20,
      'VIP30':     30,
    };
    const { code } = req.body;
    const discount = COUPONS[code?.toUpperCase()];
    if (!discount) return res.status(400).json({ success: false, message: 'Invalid coupon code.' });

    const cart     = await getCart(req);
    cart.couponCode = code.toUpperCase();
    cart.discount   = discount;
    await cart.save();
    res.json({ success: true, message: `${discount}% discount applied!`, discount });
  } catch (err) { next(err); }
});

module.exports = router;
