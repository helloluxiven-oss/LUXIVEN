const nodemailer = require('nodemailer');

// ── Transporter ─────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── HTML Email Templates ─────────────────────────────────────────
const baseLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Georgia', serif; background: #F7F3EE; color: #1A1208; }
  .wrap { max-width: 600px; margin: 0 auto; background: #fff; }
  .header { background: #0A0806; padding: 40px; text-align: center; }
  .logo { font-size: 32px; letter-spacing: 0.3em; color: #C9A96E; text-transform: uppercase; }
  .hero { background: #1C1209; padding: 48px 40px; text-align: center; }
  .hero-title { font-size: 28px; color: #F7F3EE; font-weight: normal; line-height: 1.3; }
  .body { padding: 48px 40px; }
  .body p { font-size: 15px; line-height: 1.9; color: #3A2E1E; margin-bottom: 20px; }
  .btn { display: inline-block; background: #C9A96E; color: #0A0806; padding: 14px 40px;
         text-decoration: none; font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase;
         margin: 24px 0; }
  .divider { height: 1px; background: rgba(201,169,110,0.2); margin: 32px 0; }
  .order-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .order-table th { background: #0A0806; color: #C9A96E; padding: 10px 14px;
                    font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; text-align: left; }
  .order-table td { padding: 12px 14px; border-bottom: 1px solid #EEE; font-size: 14px; }
  .total-row td { font-weight: bold; font-size: 16px; color: #C9A96E; border-bottom: none; }
  .footer { background: #0A0806; padding: 32px 40px; text-align: center; }
  .footer p { color: rgba(247,243,238,0.4); font-size: 11px; letter-spacing: 0.15em; line-height: 2; }
  .footer a { color: #C9A96E; text-decoration: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><div class="logo">Luxiven</div></div>
  ${content}
  <div class="footer">
    <p>© ${new Date().getFullYear()} Luxiven. All rights reserved.<br>
    Premium Living · Curated with Care<br>
    <a href="${process.env.FRONTEND_URL}/unsubscribe">Unsubscribe</a> · 
    <a href="${process.env.FRONTEND_URL}/privacy">Privacy Policy</a></p>
  </div>
</div>
</body>
</html>`;

const templates = {
  welcome: ({ name, verifyUrl }) => baseLayout(`
    <div class="hero"><h1 class="hero-title">Welcome to Luxiven,<br>${name}.</h1></div>
    <div class="body">
      <p>Thank you for joining the Luxiven family. You now have access to our curated collection of premium home furnishings — objects chosen with uncommon care for spaces that inspire.</p>
      <p>Please verify your email address to complete your account setup.</p>
      <div style="text-align:center"><a href="${verifyUrl}" class="btn">Verify Email</a></div>
      <div class="divider"></div>
      <p style="font-size:13px;color:#8C7B5E">If you didn't create this account, you can safely ignore this email.</p>
    </div>`),

  resetPassword: ({ name, resetUrl }) => baseLayout(`
    <div class="hero"><h1 class="hero-title">Password Reset Request</h1></div>
    <div class="body">
      <p>Hello ${name},</p>
      <p>We received a request to reset your Luxiven account password. Click the button below to create a new password. This link expires in 1 hour.</p>
      <div style="text-align:center"><a href="${resetUrl}" class="btn">Reset Password</a></div>
      <div class="divider"></div>
      <p style="font-size:13px;color:#8C7B5E">If you didn't request a password reset, please ignore this email — your account is secure.</p>
    </div>`),

  orderConfirmation: ({ order }) => {
    const itemRows = order.items.map(i => `
      <tr>
        <td>${i.name}${i.variant ? ` <small style="color:#8C7B5E">(${i.variant})</small>` : ''}</td>
        <td style="text-align:center">${i.quantity}</td>
        <td style="text-align:right">$${(i.price * i.quantity).toFixed(2)}</td>
      </tr>`).join('');

    return baseLayout(`
      <div class="hero"><h1 class="hero-title">Your order is confirmed.</h1></div>
      <div class="body">
        <p>Thank you for your purchase. We're preparing your order with great care.</p>
        <p><strong>Order Number:</strong> ${order.orderNumber}</p>
        <div class="divider"></div>
        <table class="order-table">
          <thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th></tr></thead>
          <tbody>
            ${itemRows}
            <tr><td colspan="2" style="text-align:right;color:#8C7B5E;font-size:13px">Subtotal</td><td style="text-align:right">$${order.subtotal.toFixed(2)}</td></tr>
            ${order.discount > 0 ? `<tr><td colspan="2" style="text-align:right;color:#8C7B5E;font-size:13px">Discount</td><td style="text-align:right;color:#C9A96E">-$${order.discount.toFixed(2)}</td></tr>` : ''}
            <tr><td colspan="2" style="text-align:right;color:#8C7B5E;font-size:13px">Shipping</td><td style="text-align:right">${order.shipping === 0 ? 'Free' : '$' + order.shipping.toFixed(2)}</td></tr>
            <tr><td colspan="2" style="text-align:right;color:#8C7B5E;font-size:13px">Tax</td><td style="text-align:right">$${order.tax.toFixed(2)}</td></tr>
            <tr class="total-row"><td colspan="2" style="text-align:right">Total</td><td style="text-align:right">$${order.total.toFixed(2)}</td></tr>
          </tbody>
        </table>
        <div class="divider"></div>
        <p><strong>Shipping to:</strong><br>
        ${order.shippingAddress.firstName} ${order.shippingAddress.lastName}<br>
        ${order.shippingAddress.line1}${order.shippingAddress.line2 ? ', ' + order.shippingAddress.line2 : ''}<br>
        ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zip}</p>
        <div style="text-align:center;margin-top:32px">
          <a href="${process.env.FRONTEND_URL}/orders/track/${order.orderNumber}" class="btn">Track Your Order</a>
        </div>
      </div>`);
  },

  newsletterWelcome: ({ firstName, unsubUrl }) => baseLayout(`
    <div class="hero"><h1 class="hero-title">You're in the inner circle${firstName ? ', ' + firstName : ''}.</h1></div>
    <div class="body">
      <p>Welcome to the Luxiven Inner Circle — where you'll receive early access to new collections, exclusive offers, and stories from the world of premium living.</p>
      <p>We curate carefully, so we email sparingly. Every message we send is worth your time.</p>
      <div class="divider"></div>
      <p style="font-size:12px;color:#8C7B5E">Changed your mind? <a href="${unsubUrl}" style="color:#C9A96E">Unsubscribe here.</a></p>
    </div>`),
};

// ── Send Email ───────────────────────────────────────────────────
exports.sendEmail = async ({ to, subject, template, data, html }) => {
  try {
    const htmlContent = html || (templates[template] ? templates[template](data) : '<p>No template found.</p>');
    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || 'Luxiven'}" <${process.env.FROM_EMAIL || 'noreply@luxiven.com'}>`,
      to,
      subject,
      html: htmlContent,
    });
    console.log(`✓ Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`✗ Email failed to ${to}:`, err.message);
    throw err;
  }
};
