require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY_DEV);

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, '../')));

// Middleware для установки куки с атрибутами SameSite=None и Secure
app.use((req, res, next) => {
  res.cookie('cookieName', 'cookieValue', {
    sameSite: 'None', // Позволяет использовать куки в кросс-сайтовом контексте
    secure: true, // Требует HTTPS для передачи куки
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

app.post('/create-checkout-session', validateApiKey, async (req, res) => {
  try {
    console.log('Creating checkout session');

    const { email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email, // Добавление email клиента в сессию
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'IQTest Results',
            },
            unit_amount: 190,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'https://iq-check140.com/#/thanks',
      cancel_url: 'https://iq-check140.com/#/paywall',
    });

    console.log('Checkout session created successfully');
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
