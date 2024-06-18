const stripeLive = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeDev = require('stripe')(process.env.STRIPE_SECRET_KEY_DEV);

// Stripe functions
const createStripeCustomer = async (email, userName, stripe) => {
  return await stripe.customers.create({
    email: email,
    name: userName,
  });
};

const createStripeSubscription = async (customerId, priceId, stripe) => {
  return await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    promotion_code: 'promo_1PRUDpRrQfUQC5MYRNrD9i5x',
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });
};

const createCheckoutSession = async (
  email,
  userId,
  priceId,
  iqValue,
  userName,
  origin
) => {
  const stripe = origin.includes('iq-check140.com') ? stripeLive : stripeDev;
  const customer = await createStripeCustomer(email, userName, stripe);
  const subscription = await createStripeSubscription(
    customer.id,
    priceId,
    stripe
  );
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    discounts: [{ coupon: '28NLdHOO' }],
    success_url: `${origin}/#/thanks`,
    cancel_url: `${origin}/#/paywall`,
    customer_email: email,
    client_reference_id: subscription.id,
  });

  return session;
};

const createBillingPortalSession = async (email, origin) => {
  const stripe = origin.includes('iq-check140.com') ? stripeLive : stripeDev;

  try {
    const customers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      throw new Error('User not found');
    }

    const customerId = customers.data[0].id;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/#/home`,
    });

    return session.url;
  } catch (error) {
    console.error('Error creating billing portal session: ', error);
    throw error;
  }
};

const checkSubscription = async email => {
  const stripe = email.includes('iq-check140.com') ? stripeLive : stripeDev;
  try {
    const customers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return { hasSubscription: false };
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    return { hasSubscription: subscriptions.data.length > 0 };
  } catch (error) {
    console.error('Error checking subscription status: ', error);
    return { hasSubscription: false };
  }
};

const handleWebhookEvent = async (event, origin) => {
  const stripe = origin.includes('iq-check140.com') ? stripeLive : stripeDev;

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      // Обработка события
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
};

module.exports = {
  createCheckoutSession,
  createBillingPortalSession,
  checkSubscription,
  handleWebhookEvent,
};
