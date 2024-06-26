require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const getStripeConfig = require('./key.js'); // Импорт функции из key.js

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, '../client/build')));

app.use((req, res, next) => {
  res.cookie('cookieName', 'cookieValue', {
    sameSite: 'None',
    secure: true,
  });
  next();
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  next();
});

// Endpoint to retrieve the API key
app.get('/get-api-key', (req, res) => {
  res.json({ apiKey: process.env.MY_API_KEY });
});

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers.authorization;

  if (!apiKey) {
    return res.status(401).send('Authorization header is missing (server)');
  }

  if (!apiKey.startsWith('Bearer ')) {
    return res.status(401).send('Invalid authorization format (server)');
  }

  const apiKeyValue = apiKey.split(' ')[1];

  if (apiKeyValue !== process.env.MY_API_KEY) {
    return res.status(403).send('Invalid API key (server)');
  }

  next();
};

// Endpoint to create a checkout session
app.post('/create-checkout-session', validateApiKey, async (req, res) => {
  try {
    const { email, priceId, userName } = req.body;
    const origin = req.headers.origin;
    const { stripe, idPromo, idCoupon } = getStripeConfig(origin);

    const customer = await stripe.customers.create({
      email: email,
      name: userName,
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      promotion_code: idPromo,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      discounts: [{ coupon: idCoupon }],
      success_url: `${origin}/thanks`,
      cancel_url: `${origin}/paywall`,
      customer_email: email,
      client_reference_id: subscription.id,
    });

    res.json({ id: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to create a billing portal session
app.post('/create-billing-portal-session', validateApiKey, async (req, res) => {
  try {
    const { email } = req.body;
    const origin = req.headers.origin;
    const { stripe } = getStripeConfig(origin);

    const customer = await stripe.customers.list({ email: email });

    if (customer.data.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.data[0].id,
      return_url: `${origin}/home`,
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to check subscription
app.post('/check-subscription', async (req, res) => {
  try {
    const { email } = req.body;
    const { stripe } = getStripeConfig(req.headers.origin);

    const customer = await stripe.customers.list({ email: email });

    if (customer.data.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.data[0].id,
      status: 'active',
    });

    const hasSubscription = subscriptions.data.length > 0;
    res.json({ hasSubscription });
  } catch (error) {
    res.status(404).json({ error: 'User not found' });
  }
});

// Endpoint to cancel subscription
app.post('/cancel-subscription', validateApiKey, async (req, res) => {
  try {
    const { email } = req.body;
    const origin = req.headers.origin;
    const { stripe } = getStripeConfig(origin);

    const customer = await stripe.customers.list({ email: email });

    if (customer.data.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.data[0].id,
      status: 'active',
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json({ error: 'No active subscriptions found' });
    }

    const subscriptionId = subscriptions.data[0].id;
    const deletedSubscription = await stripe.subscriptions.del(subscriptionId);

    res.json({ success: true, subscription: deletedSubscription });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to handle Stripe webhooks
app.post(
  '/webhook',
  bodyParser.raw({ type: 'application/json' }),
  (request, response) => {
    const sig = request.headers['stripe-signature'];

    let event;

    try {
      const origin = request.headers.origin;
      const { stripe } = getStripeConfig(origin);

      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return response.sendStatus(400);
    }

    // Handle the event
    stripeService.handleWebhookEvent(event, request.headers.origin);
    response.sendStatus(200);
  }
);

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
