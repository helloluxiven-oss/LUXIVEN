const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity:  { type: Number, required: true, min: 1, default: 1 },
  variant:   { type: String },
  variantId: { type: mongoose.Schema.Types.ObjectId },
  price:     { type: Number, required: true },   // price at time of add
}, { _id: true });

const cartSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
  sessionId: { type: String },              // for guest carts
  items:     [cartItemSchema],
  couponCode:{ type: String },
  discount:  { type: Number, default: 0 },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, // 30 days
}, { timestamps: true });

cartSchema.index({ user: 1 });
cartSchema.index({ sessionId: 1 });
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual: subtotal
cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
});

// Virtual: itemCount
cartSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, i) => sum + i.quantity, 0);
});

cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);
