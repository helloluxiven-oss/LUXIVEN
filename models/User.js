const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  label:    { type: String, default: 'Home' },
  line1:    { type: String, required: true },
  line2:    { type: String },
  city:     { type: String, required: true },
  state:    { type: String, required: true },
  zip:      { type: String, required: true },
  country:  { type: String, required: true, default: 'US' },
  isDefault:{ type: Boolean, default: false },
}, { _id: true });

const userSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true, minlength: 8, select: false },
  role:       { type: String, enum: ['customer', 'admin'], default: 'customer' },
  avatar:     { type: String },
  phone:      { type: String },
  addresses:  [addressSchema],
  wishlist:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  stripeCustomerId: { type: String },
  isVerified:       { type: Boolean, default: false },
  verifyToken:      { type: String, select: false },
  resetPasswordToken:   { type: String, select: false },
  resetPasswordExpires: { type: Date,   select: false },
  lastLogin:  { type: Date },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

// ── Virtual full name ───────────────────────────────────────────
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ── Hash password before save ───────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Compare password ────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Strip sensitive fields from JSON output ─────────────────────
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.verifyToken;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
