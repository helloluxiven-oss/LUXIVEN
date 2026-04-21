const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  firstName:   { type: String, trim: true },
  isActive:    { type: Boolean, default: true },
  source:      { type: String, default: 'website' },
  unsubToken:  { type: String },
  unsubAt:     { type: Date },
}, { timestamps: true });

newsletterSchema.index({ email: 1 });

module.exports = mongoose.model('Newsletter', newsletterSchema);
