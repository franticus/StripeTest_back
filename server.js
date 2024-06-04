require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers.authorization;

  if (!apiKey) {
    return res.status(401).send('Authorization header is missing');
  }

  if (!apiKey.startsWith('Bearer ')) {
    return res.status(401).send('Invalid authorization format');
  }

  const apiKeyValue = apiKey.split(' ')[1];

  if (apiKeyValue !== process.env.MY_API_KEY) {
    return res.status(403).send('Invalid API key');
  }

  next();
};

app.use(validateApiKey);

app.use(express.static(path.join(__dirname, '../')));

app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Test Product',
            },
            unit_amount: 500,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'https://stripetestiq.netlify.app/success.html',
      cancel_url: 'https://stripetestiq.netlify.app/cancel.html',
    });
    res.json({ id: session.id });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/get-api-key', (req, res) => {
  res.json({ apiKey: process.env.MY_API_KEY });
});

app.listen(4242, () => console.log('Server is running on port 4242'));
