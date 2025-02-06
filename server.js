/**
 * server.js
 * Вся статика + серверный код в одной папке.
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config(); // Читаем .env (PORT, CRON_ENABLED и т.д.)

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Файл базы данных
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

// Отдаём структуру данных
app.get('/api/data', (req, res) => {
  const db = readDatabase();
  res.json(db);
});

// Обновление общих настроек: бюджет, аренда, цель
app.post('/api/updateConfig', (req, res) => {
  const db = readDatabase();
  const { budget, monthlyRent, monthlyIncomeGoal } = req.body;

  if (budget !== undefined) db.budget = Number(budget);
  if (monthlyRent !== undefined) db.monthlyRent = Number(monthlyRent);
  if (monthlyIncomeGoal !== undefined) db.goals.monthlyIncomeGoal = Number(monthlyIncomeGoal);

  writeDatabase(db);
  res.json({ success: true, data: db });
});

// Добавление дохода
app.post('/api/addIncome', (req, res) => {
  const db = readDatabase();
  const { amount, source } = req.body;
  const newInc = {
    id: db.lastIncomeId++,
    amount: Number(amount),
    source: source || 'Не указано',
    date: new Date().toISOString()
  };
  db.incomes.push(newInc);
  db.budget += newInc.amount;
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// Редактирование дохода
app.post('/api/editIncome', (req, res) => {
  const db = readDatabase();
  const { id, amount, source } = req.body;
  const idx = db.incomes.findIndex(i => i.id === id);
  if (idx !== -1) {
    // Возвращаем старую сумму в бюджет
    const oldAmount = db.incomes[idx].amount;
    db.budget -= oldAmount;
    // Заменяем на новую
    db.incomes[idx].amount = Number(amount);
    db.incomes[idx].source = source || 'Не указано';
    // Прибавляем новую сумму
    db.budget += db.incomes[idx].amount;
  }
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// Добавление расхода
app.post('/api/addExpense', (req, res) => {
  const db = readDatabase();
  const { amount, category } = req.body;
  const newExp = {
    id: db.lastExpenseId++,
    amount: Number(amount),
    category: category || 'Не указано',
    date: new Date().toISOString()
  };
  db.expenses.push(newExp);
  db.budget -= newExp.amount;
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// Редактирование расхода
app.post('/api/editExpense', (req, res) => {
  const db = readDatabase();
  const { id, amount, category } = req.body;
  const idx = db.expenses.findIndex(e => e.id === id);
  if (idx !== -1) {
    // Возвращаем старую сумму
    const oldAmount = db.expenses[idx].amount;
    db.budget += oldAmount;
    // Заменяем на новую
    db.expenses[idx].amount = Number(amount);
    db.expenses[idx].category = category || 'Не указано';
    // Снова вычитаем
    db.budget -= db.expenses[idx].amount;
  }
  writeDatabase(db);
  res.json({ success: true, data: db });
});

// Добавление задачи
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

// Обновление статуса задачи
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

// Редактирование задачи
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

// Авто-списание аренды, если CRON_ENABLED=true в .env
if (process.env.CRON_ENABLED === 'true') {
  // Каждый месяц, 1-го числа в 09:00
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

// --- Раздача статических файлов (index.html, style.css, script.js и т.п.) ---

// 1) Делаем папку проекта статической
app.use(express.static(__dirname));

// 2) Ловим корневой маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// (необязательно) если нужно, чтобы при любом неизвестном пути отдавался index.html:
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'index.html'));
// });

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
