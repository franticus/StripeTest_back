require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Обслуживание статических файлов из корневой директории
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
            unit_amount: 500, // Сумма в центах (например, $5.00)
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

app.listen(4242, () => console.log('Server is running on port 4242'));
