require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(bodyParser.json());

const stripeLive = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeDev = require('stripe')(process.env.STRIPE_SECRET_KEY_DEV);

app.use(express.static(path.join(__dirname, '../')));

app.use((req, res, next) => {
  res.cookie('cookieName', 'cookieValue', {
    sameSite: 'None',
    secure: true,
  });
  next();
});

// Endpoint to retrieve the API key
app.get('/get-api-key', (req, res) => {
  console.log('Request received to get API key');
  res.json({ apiKey: process.env.MY_API_KEY });
});

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers.authorization;

  if (!apiKey) {
    console.error('Authorization header is missing (server)');
    return res.status(401).send('Authorization header is missing (server)');
  }

  if (!apiKey.startsWith('Bearer ')) {
    console.error('Invalid authorization format (server)');
    return res.status(401).send('Invalid authorization format (server)');
  }

  const apiKeyValue = apiKey.split(' ')[1];

  if (apiKeyValue !== process.env.MY_API_KEY) {
    console.error('Invalid API key (server)');
    return res.status(403).send('Invalid API key (server)');
  }

  console.log('API key validated successfully');
  next();
};

// Endpoint to create a payment intent
app.post('/create-payment-intent', validateApiKey, async (req, res) => {
  try {
    const { amount, currency } = req.body;

    const stripe = req.headers.origin.includes('iq-check140.com')
      ? stripeLive
      : stripeDev;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      payment_method_types: ['card'],
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Error creating payment intent:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to create a checkout session
app.post('/create-checkout-session', validateApiKey, async (req, res) => {
  try {
    const { amount, email } = req.body;

    const stripe = req.headers.origin.includes('iq-check140.com')
      ? stripeLive
      : stripeDev;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'IQ Test Results - Single Purchase',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/#/thanks`,
      cancel_url: `${req.headers.origin}/#/paywall`,
      customer_email: email,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
