const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('wishlist', 'name slug price compareAt images reviewSummary badge');
    res.json({ success: true, data: user.wishlist });
  } catch (err) { next(err); }
});

router.post('/:productId', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const pid  = req.params.productId;
    const idx  = user.wishlist.indexOf(pid);

    if (idx === -1) {
      user.wishlist.push(pid);
      await user.save();
      return res.json({ success: true, action: 'added',   message: 'Added to wishlist.' });
    } else {
      user.wishlist.splice(idx, 1);
      await user.save();
      return res.json({ success: true, action: 'removed', message: 'Removed from wishlist.' });
    }
  } catch (err) { next(err); }
});

module.exports = router;
