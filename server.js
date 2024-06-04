// Подключение dotenv для загрузки переменных среды из файла .env
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe');

// Инициализация Stripe с секретным ключом из переменной среды
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeInstance = stripe(stripeSecretKey);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Middleware для проверки API ключа в заголовке Authorization
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers.authorization;

  // Проверка наличия заголовка Authorization
  if (!apiKey) {
    return res.status(401).send('Authorization header is missing');
  }

  // Проверка формата авторизации (Bearer)
  if (!apiKey.startsWith('Bearer ')) {
    return res.status(401).send('Invalid authorization format');
  }

  const apiKeyValue = apiKey.split(' ')[1];

  // Сравнение API ключа с секретным ключом Stripe
  if (apiKeyValue !== stripeSecretKey) {
    return res.status(403).send('Invalid API key');
  }

  // Продолжение выполнения следующих middleware, если API ключ валиден
  next();
};

// Применение middleware для всех маршрутов
app.use(validateApiKey);

// Обслуживание статических файлов из корневой директории
app.use(express.static(path.join(__dirname, '../')));

// Маршрут для создания сессии оплаты
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripeInstance.checkout.sessions.create({
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

// Запуск сервера
app.listen(4242, () => console.log('Server is running on port 4242'));
