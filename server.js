/**
 * server.js
 * Улучшенная версия сервера с автоматическим списанием аренды и экспортом CSV.
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config(); // чтение .env

const path = require('path');
const app = express();
app.use(bodyParser.json());
app.use(cors());
app.get('/', (req, res) => {
  res.sendFile(path.join('index.html'));
});


// Путь к базе данных
const DB_FILE = path.join(__dirname, 'database.json');

// --- Функции для чтения/записи JSON-файла ---

function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialData = {
        // Финансы
        budget: 40000,
        monthlyRent: 10000,
        goals: {
          monthlyIncomeGoal: 150000
        },
        // Основные сущности
        tasks: [],
        expenses: [],
        incomes: [],
        // Счётчики ID
        lastIncomeId: 1,
        lastExpenseId: 1,
        lastTaskId: 1
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка чтения БД:', error);
    return {};
  }
}

function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Ошибка записи в БД:', error);
  }
}

// --- Роуты API ---

app.get('/api/data', (req, res) => {
  const db = readDatabase();
  res.json(db);
});

app.post('/api/updateConfig', (req, res) => {
  const db = readDatabase();
  const { budget, monthlyRent, monthlyIncomeGoal } = req.body;

  if (budget !== undefined) db.budget = Number(budget);
  if (monthlyRent !== undefined) db.monthlyRent = Number(monthlyRent);
  if (monthlyIncomeGoal !== undefined) db.goals.monthlyIncomeGoal = Number(monthlyIncomeGoal);

  writeDatabase(db);
  res.json({ success: true, data: db });
});

// --- Доходы ---

app.post('/api/addIncome', (req, res) => {
  const db = readDatabase();
  const { amount, source } = req.body;
  const newIncome = {
    id: db.lastIncomeId++,
    amount: Number(amount),
    source: source || 'Не указано',
    date: new Date().toISOString()
  };
  db.incomes.push(newIncome);
  db.budget += newIncome.amount;
  writeDatabase(db);
  res.json({ success: true, data: db });
});

app.post('/api/editIncome', (req, res) => {
  const db = readDatabase();
  const { id, amount, source } = req.body;
  const idx = db.incomes.findIndex(i => i.id === id);
  if (idx !== -1) {
    // Сначала возвращаем старую сумму в бюджет
    const oldAmount = db.incomes[idx].amount;
    db.budget -= oldAmount;
    // Теперь записываем новые данные
    db.incomes[idx].amount = Number(amount);
    db.incomes[idx].source = source || 'Не указано';
    // Прибавляем новую сумму к бюджету
    db.budget += db.incomes[idx].amount;
  }
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// --- Расходы ---

app.post('/api/addExpense', (req, res) => {
  const db = readDatabase();
  const { amount, category } = req.body;
  const newExpense = {
    id: db.lastExpenseId++,
    amount: Number(amount),
    category: category || 'Не указано',
    date: new Date().toISOString()
  };
  db.expenses.push(newExpense);
  db.budget -= newExpense.amount;
  writeDatabase(db);
  res.json({ success: true, data: db });
});

app.post('/api/editExpense', (req, res) => {
  const db = readDatabase();
  const { id, amount, category } = req.body;
  const idx = db.expenses.findIndex(e => e.id === id);
  if (idx !== -1) {
    // Возвращаем старую сумму
    const oldAmount = db.expenses[idx].amount;
    db.budget += oldAmount;
    // Записываем новые данные
    db.expenses[idx].amount = Number(amount);
    db.expenses[idx].category = category || 'Не указано';
    // Снова списываем из бюджета
    db.budget -= db.expenses[idx].amount;
  }
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// --- Задачи ---

app.post('/api/addTask', (req, res) => {
  const db = readDatabase();
  const { title, description } = req.body;
  const newTask = {
    id: db.lastTaskId++,
    title,
    description,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  db.tasks.push(newTask);
  writeDatabase(db);
  res.json({ success: true, data: db });
});

app.post('/api/updateTask', (req, res) => {
  const db = readDatabase();
  const { id, status } = req.body;
  const idx = db.tasks.findIndex(t => t.id === id);
  if (idx !== -1) {
    db.tasks[idx].status = status;
  }
  writeDatabase(db);
  res.json({ success: true, data: db });
});

app.post('/api/editTask', (req, res) => {
  const db = readDatabase();
  const { id, title, description } = req.body;
  const idx = db.tasks.findIndex(t => t.id === id);
  if (idx !== -1) {
    db.tasks[idx].title = title;
    db.tasks[idx].description = description;
  }
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// --- Экспорт в CSV (пример расширения) ---
app.get('/api/export/csv', (req, res) => {
  const db = readDatabase();
  // Простой пример: выгружаем доходы и расходы
  let csv = 'type,id,amount,category/source,date\n';
  
  // Доходы
  db.incomes.forEach(i => {
    csv += `income,${i.id},${i.amount},${i.source},${i.date}\n`;
  });
  // Расходы
  db.expenses.forEach(e => {
    csv += `expense,${e.id},${e.amount},${e.category},${e.date}\n`;
  });
  // Отправляем файл
  res.setHeader('Content-disposition', 'attachment; filename=crm_data.csv');
  res.set('Content-Type', 'text/csv');
  res.send(csv);
});

// --- Автоматическое списание аренды (node-cron) ---
// Например, списывать 1 числа каждого месяца в 09:00
// * Для теста можно поставить каждую минуту => '* * * * *'
//   Но будь осторожен – тогда аренда будет списываться 60 раз в час!
if (process.env.CRON_ENABLED === 'true') {
  cron.schedule('0 9 1 * *', () => {
    console.log('CRON: списываем аренду...');
    const db = readDatabase();
    db.budget -= db.monthlyRent;
    // Добавляем запись в расходы
    db.expenses.push({
      id: db.lastExpenseId++,
      amount: db.monthlyRent,
      category: 'Аренда (авто-списание)',
      date: new Date().toISOString()
    });
    writeDatabase(db);
  });
}

// --- Отдаём статические файлы (HTML, CSS, JS) из папки "public" ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}. http://localhost:${PORT}`);
});
