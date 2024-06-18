const stripeProd = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeDev = require('stripe')(process.env.STRIPE_SECRET_KEY_DEV);

const idPromoProd = 'promo_1PT1GDBbDeRYiB9tDOxSePUF';
const idPromoDev = 'promo_1PRUDpRrQfUQC5MYRNrD9i5x';

const idCouponProd = 'S2cYrdt8';
const idCouponDev = '28NLdHOO';

const getStripeConfig = origin => {
  const isProd = origin.includes('iq-check140.com');
  return {
    stripe: isProd ? stripeProd : stripeDev,
    idPromo: isProd ? idPromoProd : idPromoDev,
    idCoupon: isProd ? idCouponProd : idCouponDev,
  };
};

module.exports = getStripeConfig;
