const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  rating:   { type: Number, required: true, min: 1, max: 5 },
  title:    { type: String, trim: true, maxlength: 120 },
  body:     { type: String, trim: true, maxlength: 2000 },
  images:   [String],
  verified: { type: Boolean, default: false },  // verified purchase
  helpful:  { type: Number, default: 0 },
  isApproved: { type: Boolean, default: true },
}, { timestamps: true });

reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });  // one review per product per user

// After save/remove: recalculate product review summary
async function updateProductSummary(productId) {
  const Product = require('./Product');
  const result = await mongoose.model('Review').aggregate([
    { $match: { product: productId, isApproved: true } },
    { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const summary = result[0] || { average: 0, count: 0 };
  await Product.findByIdAndUpdate(productId, {
    'reviewSummary.average': Math.round(summary.average * 10) / 10,
    'reviewSummary.count': summary.count,
  });
}

reviewSchema.post('save', async function () { await updateProductSummary(this.product); });
reviewSchema.post('findOneAndDelete', async function (doc) { if (doc) await updateProductSummary(doc.product); });

module.exports = mongoose.model('Review', reviewSchema);
