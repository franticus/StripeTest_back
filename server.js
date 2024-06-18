require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const app = express();
const stripeService = require('./stripeService');

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
    const { email, userId, priceId, iqValue, userName } = req.body;
    const origin = req.headers.origin;

    const session = await stripeService.createCheckoutSession(
      email,
      userId,
      priceId,
      iqValue,
      userName,
      origin
    );

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

    const url = await stripeService.createBillingPortalSession(email, origin);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to check subscription
app.post('/check-subscription', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await stripeService.checkSubscription(email);
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: 'User not found' });
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
      const stripe = origin.includes('iq-check140.com')
        ? stripeLive
        : stripeDev;

      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return response.sendStatus(400);
    }

    stripeService.handleWebhookEvent(event, request.headers.origin);
    response.sendStatus(200);
  }
);

// Endpoint to save before checkout data
app.post('/before-checkout', (req, res) => {
  const { userId, userName, email, date, iqValue } = req.body;
  stripeService.addBeforeCheckout(userId, userName, email, date, iqValue);
  res.status(200).send('User data saved before checkout');
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
