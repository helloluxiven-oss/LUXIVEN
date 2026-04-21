const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const orderItemSchema = new mongoose.Schema({
  product:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:       { type: String, required: true },
  image:      { type: String },
  price:      { type: Number, required: true },
  quantity:   { type: Number, required: true, min: 1 },
  variant:    { type: String },             // e.g. "Ivory / Large"
  variantId:  { type: mongoose.Schema.Types.ObjectId },
}, { _id: true });

const addressSnapshot = new mongoose.Schema({
  firstName: String,
  lastName:  String,
  line1:     String,
  line2:     String,
  city:      String,
  state:     String,
  zip:       String,
  country:   String,
  phone:     String,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    default: () => 'LUX-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase(),
  },

  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  guestEmail: { type: String },   // for guest checkout

  items:      [orderItemSchema],

  shippingAddress: addressSnapshot,
  billingAddress:  addressSnapshot,

  // Pricing
  subtotal:   { type: Number, required: true },
  shipping:   { type: Number, default: 0 },
  tax:        { type: Number, default: 0 },
  discount:   { type: Number, default: 0 },
  total:      { type: Number, required: true },
  couponCode: { type: String },

  // Payment
  paymentMethod:   { type: String, enum: ['stripe','cod','bank_transfer'], default: 'stripe' },
  paymentStatus:   { type: String, enum: ['pending','paid','failed','refunded','partially_refunded'], default: 'pending' },
  stripePaymentIntentId: { type: String },
  stripeChargeId:        { type: String },
  paidAt:      { type: Date },
  refundedAmount: { type: Number, default: 0 },

  // Fulfillment
  status: {
    type: String,
    enum: ['pending','confirmed','processing','shipped','delivered','cancelled','refund_requested','refunded'],
    default: 'pending',
  },
  trackingNumber:  { type: String },
  trackingCarrier: { type: String },
  trackingUrl:     { type: String },
  shippedAt:       { type: Date },
  deliveredAt:     { type: Date },
  cancelledAt:     { type: Date },
  cancelReason:    { type: String },

  notes:       { type: String },   // customer note
  adminNotes:  { type: String },

  timeline: [{
    status:  String,
    note:    String,
    at:      { type: Date, default: Date.now },
  }],
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);
