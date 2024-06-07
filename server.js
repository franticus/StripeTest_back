require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY_DEV);
const url = 'https://iq-check140.com';
const urlDEV = 'https://iqmaze.netlify.app';

const app = express();
app.use(cors());
app.use(bodyParser.json());

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

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
