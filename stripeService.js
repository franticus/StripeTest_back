const stripeLive = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeDev = require('stripe')(process.env.STRIPE_SECRET_KEY_DEV);
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

let dbPath;

if (
  fs.existsSync('/data') &&
  fs.existsSync(path.join('/data', 'database.sqlite'))
) {
  dbPath = path.resolve('/data', 'database.sqlite');
} else {
  dbPath = path.resolve(__dirname, 'data', 'database.sqlite');
}

const db = new sqlite3.Database(dbPath, err => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Functions for interacting with the database
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
  subscription_id,
  customer_id
) => {
  const stmt = db.prepare(
    'INSERT INTO users (id, date, userName, email, payment_method_types, amount_total, amount_subtotal, currency, userId, iqValue, mode, status, subscription_id, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
    customer_id,
    err => {
      if (err) {
        console.error('Error inserting user:', err.message);
      } else {
        console.log('User inserted successfully');
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
    'INSERT INTO beforeCheckout (userId, userName, email, date, iqValue) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(userId, userName, email, date, iqValue, err => {
    if (err) {
      console.error('Error inserting user before checkout:', err.message);
    } else {
      console.log('Before checkout data inserted successfully');
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
    subscription.id,
    customer.id
  );

  return session;
};

const createBillingPortalSession = async (email, origin) => {
  return new Promise((resolve, reject) => {
    getUserByEmail(email, async (err, user) => {
      if (err || !user) {
        return reject('User not found');
      }

      const stripe = origin.includes('iq-check140.com')
        ? stripeLive
        : stripeDev;
      const session = await stripe.billingPortal.sessions.create({
        customer: user.customer_id,
        return_url: `${origin}/#/home`,
      });

      resolve(session.url);
    });
  });
};

const checkSubscription = email => {
  return new Promise((resolve, reject) => {
    getUserByEmail(email, (err, user) => {
      if (err || !user) {
        return reject('User not found');
      }

      const hasSubscription = !!user.subscription_id;
      resolve({ hasSubscription });
    });
  });
};

const handleWebhookEvent = async (event, origin) => {
  const stripe = origin.includes('iq-check140.com') ? stripeLive : stripeDev;

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      getUserByEmail(session.customer_email, (err, user) => {
        if (user) {
          db.run(
            'UPDATE users SET subscription_id = ?, payment_status = ? WHERE email = ?',
            [session.client_reference_id, 'completed', session.customer_email],
            err => {
              if (err) {
                console.error('Error updating user:', err.message);
              } else {
                console.log('User updated successfully');
              }
            }
          );
        } else {
          console.error('User not found');
        }
      });
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
  addBeforeCheckout,
};
