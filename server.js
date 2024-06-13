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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
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
      date TEXT,
      userName TEXT,
      email TEXT,
      payment_method_types TEXT,
      amount_total INTEGER,
      amount_subtotal INTEGER,
      currency TEXT,
      userId TEXT,
      iqValue INTEGER,
      mode TEXT,
      status TEXT,
      subscription_id TEXT
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS beforeCheckout (
      userId TEXT,
      userName TEXT,
      email TEXT,
      date TEXT,
      iqValue INTEGER
    )`
  );
});

const addUser = (
  id,
  date,
  userName,
  email,
  payment_method_types,
  amount_total,
  amount_subtotal,
  currency,
  userId,
  iqValue,
  mode,
  status,
  subscription_id
) => {
  const stmt = db.prepare(
    'INSERT INTO users (id, date, userName, email, payment_method_types, amount_total, amount_subtotal, currency, userId, iqValue, mode, status, subscription_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    err => {
      if (err) {
        console.error('Error preparing statement:', err.message);
      }
    }
  );
  stmt.run(
    id,
    date,
    userName,
    email,
    JSON.stringify(payment_method_types),
    amount_total,
    amount_subtotal,
    currency,
    userId,
    iqValue,
    mode,
    status,
    subscription_id,
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

const addBeforeCheckout = (userId, userName, email, date, iqValue) => {
  const stmt = db.prepare(
    'INSERT INTO beforeCheckout (userId, userName, email, date, iqValue) VALUES (?, ?, ?, ?, ?)',
    err => {
      if (err) {
        console.error('Error preparing statement:', err.message);
      }
    }
  );
  stmt.run(userId, userName, email, date, iqValue, err => {
    if (err) {
      console.error('Error inserting user before checkout:', err.message);
    }
  });
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
    const { email, userId, priceId, iqValue, userName } = req.body;

    const stripe = req.headers.origin.includes('iq-check140.com')
      ? stripeLive
      : stripeDev;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin}/#/thanks`,
      cancel_url: `${req.headers.origin}/#/paywall`,
      customer_email: email,
    });

    console.log('Created session:', session);

    // Сохранение данных пользователя в базу данных
    const date = new Date().toISOString();
    addUser(
      session.id,
      date,
      userName,
      email,
      session.payment_method_types,
      session.amount_total,
      session.amount_subtotal,
      session.currency,
      userId,
      iqValue,
      session.mode,
      session.status,
      session.subscription
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
      const stripe = request.headers.origin.includes('iq-check140.com')
        ? stripeLive
        : stripeDev;

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

// Endpoint to save before checkout data
app.post('/before-checkout', (req, res) => {
  const { userId, userName, email, date, iqValue } = req.body;

  addBeforeCheckout(userId, userName, email, date, iqValue);

  res.status(200).send('User data saved before checkout');
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
