/**
 * server.js
 * Сервер + статика в одной папке, готовое к деплою на Render.
 */
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config(); // Читаем .env (PORT, CRON_ENABLED)

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Путь к файлу базы
const DB_FILE = path.join(__dirname, 'database.json');

// Функции чтения/записи
function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialData = {
        budget: 40000,
        monthlyRent: 10000,
        goals: { monthlyIncomeGoal: 150000 },
        tasks: [],
        expenses: [],
        incomes: [],
        lastIncomeId: 1,
        lastExpenseId: 1,
        lastTaskId: 1
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Ошибка чтения БД:', err);
    return {};
  }
}

function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Ошибка записи в БД:', err);
  }
}

// --- API ---

// Получить все данные
app.get('/api/data', (req, res) => {
  const db = readDatabase();
  res.json(db);
});

// Обновить настройки (бюджет, аренду, цель)
app.post('/api/updateConfig', (req, res) => {
  const db = readDatabase();
  const { budget, monthlyRent, monthlyIncomeGoal } = req.body;

  if (budget !== undefined) db.budget = Number(budget);
  if (monthlyRent !== undefined) db.monthlyRent = Number(monthlyRent);
  if (monthlyIncomeGoal !== undefined) db.goals.monthlyIncomeGoal = Number(monthlyIncomeGoal);

  writeDatabase(db);
  res.json({ success: true, data: db });
});

// Добавить доход
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

// Редактировать доход
app.post('/api/editIncome', (req, res) => {
  const db = readDatabase();
  const { id, amount, source } = req.body;
  const idx = db.incomes.findIndex(i => i.id === id);
  if (idx !== -1) {
    // Вернуть старую сумму в бюджет
    const oldAmount = db.incomes[idx].amount;
    db.budget -= oldAmount;
    // Новые данные
    db.incomes[idx].amount = Number(amount);
    db.incomes[idx].source = source || 'Не указано';
    // Прибавляем заново
    db.budget += db.incomes[idx].amount;
  }
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// Добавить расход
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

// Редактировать расход
app.post('/api/editExpense', (req, res) => {
  const db = readDatabase();
  const { id, amount, category } = req.body;
  const idx = db.expenses.findIndex(e => e.id === id);
  if (idx !== -1) {
    // Вернуть старую сумму
    const oldAmount = db.expenses[idx].amount;
    db.budget += oldAmount;
    // Новые данные
    db.expenses[idx].amount = Number(amount);
    db.expenses[idx].category = category || 'Не указано';
    // Снова вычесть
    db.budget -= db.expenses[idx].amount;
  }
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// Добавить задачу
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

// Обновить статус задачи
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

// Редактировать задачу
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

// Экспорт CSV
app.get('/api/export/csv', (req, res) => {
  const db = readDatabase();
  let csv = 'type,id,amount,category_or_source,date\n';
  db.incomes.forEach(i => {
    csv += `income,${i.id},${i.amount},${i.source},${i.date}\n`;
  });
  db.expenses.forEach(e => {
    csv += `expense,${e.id},${e.amount},${e.category},${e.date}\n`;
  });
  res.setHeader('Content-disposition', 'attachment; filename=crm_data.csv');
  res.set('Content-Type', 'text/csv');
  res.send(csv);
});

// Авто-списание аренды (если CRON_ENABLED=true)
if (process.env.CRON_ENABLED === 'true') {
  // 1 числа каждого месяца в 09:00
  cron.schedule('0 9 1 * *', () => {
    console.log('[CRON] Списываем аренду...');
    const db = readDatabase();
    db.budget -= db.monthlyRent;
    db.expenses.push({
      id: db.lastExpenseId++,
      amount: db.monthlyRent,
      category: 'Аренда (авто)',
      date: new Date().toISOString()
    });
    writeDatabase(db);
  });
}

// --- Раздача статических файлов (index.html, style.css, script.js и т.д.) ---
app.use(express.static(__dirname));

// При обращении к корню отдаём index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен. Порт: ${PORT}.`);
});
