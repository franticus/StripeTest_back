const stripeProd = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeDev = require('stripe')(process.env.STRIPE_SECRET_KEY_DEV);

const idPromoProd = process.env.ID_PROMO_PROD;
const idPromoDev = process.env.ID_PROMO_DEV;

const idCouponProd = process.env.ID_COUPON_PROD;
const idCouponDev = process.env.ID_COUPON_DEV;

const getStripeConfig = origin => {
  const isProd = origin.includes('iq-check140.com');
  return {
    stripe: isProd ? stripeProd : stripeDev,
    idPromo: isProd ? idPromoProd : idPromoDev,
    idCoupon: isProd ? idCouponProd : idCouponDev,
  };
};

module.exports = getStripeConfig;
