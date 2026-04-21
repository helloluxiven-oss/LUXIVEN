const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name:     { type: String, required: true },   // e.g. "Ivory", "Large"
  sku:      { type: String, required: true },
  price:    { type: Number, required: true },
  compareAt:{ type: Number },
  stock:    { type: Number, default: 0 },
  image:    { type: String },
}, { _id: true });

const reviewSummarySchema = new mongoose.Schema({
  average: { type: Number, default: 0 },
  count:   { type: Number, default: 0 },
}, { _id: false });

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, required: true },
  shortDesc:   { type: String },
  category:    { type: String, required: true, enum: ['living-room','bedroom','office','decor','lighting','outdoor'] },
  subcategory: { type: String },
  tags:        [String],
  images:      [{ type: String }],   // array of URLs
  thumbnailIdx:{ type: Number, default: 0 },

  price:       { type: Number, required: true },
  compareAt:   { type: Number },              // original / crossed-out price
  cost:        { type: Number, select: false },// your cost (admin only)

  variants:    [variantSchema],
  hasVariants: { type: Boolean, default: false },

  stock:       { type: Number, default: 100 },
  lowStockAt:  { type: Number, default: 5 },
  sku:         { type: String },

  materials:   [String],
  dimensions:  {
    width:  Number,
    height: Number,
    depth:  Number,
    unit:   { type: String, default: 'cm' },
  },
  weight:      { type: Number },  // kg
  features:    [String],          // bullet points

  badge:       { type: String },  // e.g. "New Arrival", "Best Seller"
  isFeatured:  { type: Boolean, default: false },
  isActive:    { type: Boolean, default: true },
  isDeleted:   { type: Boolean, default: false },

  supplier:    { type: String },
  supplierSku: { type: String },

  reviewSummary: reviewSummarySchema,
  viewCount:   { type: Number, default: 0 },
  soldCount:   { type: Number, default: 0 },
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────────────
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

// ── Virtual: discount percent ────────────────────────────────────
productSchema.virtual('discountPercent').get(function () {
  if (!this.compareAt || this.compareAt <= this.price) return 0;
  return Math.round(((this.compareAt - this.price) / this.compareAt) * 100);
});

// ── Virtual: inStock ────────────────────────────────────────────
productSchema.virtual('inStock').get(function () {
  return this.stock > 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
