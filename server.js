require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.use(cors());
app.use(bodyParser.json());

const stripeLive = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeDev = require('stripe')(process.env.STRIPE_SECRET_KEY_DEV);

app.use(express.static(path.join(__dirname, '../client/build')));

app.use((req, res, next) => {
  res.cookie('cookieName', 'cookieValue', {
    sameSite: 'None',
    secure: true,
  });
  next();
});

// Подключение к базе данных SQLite
const dbPath = path.resolve(__dirname, '/data', 'database.sqlite');
const db = new sqlite3.Database(dbPath, err => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      user_id TEXT,
      date TEXT,
      product_data TEXT,
      subscription_id TEXT,
      payment_status TEXT,
      amount INTEGER,
      currency TEXT,
      client_secret TEXT,
      session_id TEXT
    )`
  );
});

const addUser = (
  id,
  email,
  user_id,
  date,
  product_data,
  subscription_id,
  payment_status,
  amount,
  currency,
  client_secret,
  session_id
) => {
  const stmt = db.prepare(
    'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    err => {
      if (err) {
        console.error('Error preparing statement:', err.message);
      }
    }
  );
  stmt.run(
    id,
    email,
    user_id,
    date,
    product_data,
    subscription_id,
    payment_status,
    amount,
    currency,
    client_secret,
    session_id,
    err => {
      if (err) {
        console.error('Error inserting user:', err.message);
      }
    }
  );
  stmt.finalize(err => {
    if (err) {
      console.error('Error finalizing statement:', err.message);
    }
  });
};

const getUserByEmail = (email, callback) => {
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      console.error('Error retrieving user:', err.message);
    }
    callback(err, row);
  });
};

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

// Endpoint to create a checkout session
app.post('/create-checkout-session', validateApiKey, async (req, res) => {
  try {
    const { email, userId } = req.body;

    const stripe = req.headers.origin.includes('iq-check140.com')
      ? stripeLive
      : stripeDev;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: 'price_1PQBhPRrQfUQC5MYqbQ7MyWh',
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin}/#/thanks`,
      cancel_url: `${req.headers.origin}/#/paywall`,
      customer_email: email,
    });

    // Сохранение данных пользователя в базу данных
    const date = new Date().toISOString();
    const product_data = JSON.stringify(session.line_items);
    addUser(
      session.id,
      email,
      userId,
      date,
      product_data,
      session.subscription,
      'pending',
      session.amount_total,
      'usd',
      session.client_secret,
      session.id
    );

    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error.message);
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
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`Webhook signature verification failed.`, err.message);
      return response.sendStatus(400);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        getUserByEmail(session.customer_email, (err, user) => {
          if (user) {
            db.run(
              'UPDATE users SET subscription_id = ?, payment_status = ? WHERE email = ?',
              [session.subscription, 'completed', session.customer_email]
            );
          }
        });
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    response.sendStatus(200);
  }
);

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
