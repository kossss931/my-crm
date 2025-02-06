// script.js

// Глобальные переменные
let globalData = {};
let incomeChart;
let expenseChart;
let currentEditIncomeId = null;
let currentEditExpenseId = null;
let currentEditTaskId = null;

// Запуск при загрузке
window.addEventListener('load', () => {
  fetchData();
});

// 1. Получение данных
function fetchData() {
  fetch('/api/data')
    .then(res => res.json())
    .then(data => {
      globalData = data;
      renderData();
      renderCharts();
    })
    .catch(err => console.error('Ошибка fetchData:', err));
}

// 2. Отображение данных
function renderData() {
  document.getElementById('currentBudget').textContent = globalData.budget || 0;
  document.getElementById('currentRent').textContent = globalData.monthlyRent || 0;
  document.getElementById('currentGoal').textContent = globalData.goals?.monthlyIncomeGoal || 0;

  renderIncomes();
  renderExpenses();
  renderTasks();
}

// --- Доходы ---
function renderIncomes() {
  const tbody = document.querySelector('#incomesTable tbody');
  tbody.innerHTML = '';
  globalData.incomes.forEach(inc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inc.id}</td>
      <td>${new Date(inc.date).toLocaleString()}</td>
      <td>${inc.amount} грн</td>
      <td>${inc.source}</td>
      <td>
        <button onclick="openEditIncomeModal(${inc.id})">Редактировать</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Расходы ---
function renderExpenses() {
  const tbody = document.querySelector('#expensesTable tbody');
  tbody.innerHTML = '';
  globalData.expenses.forEach(exp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${exp.id}</td>
      <td>${new Date(exp.date).toLocaleString()}</td>
      <td>${exp.amount} грн</td>
      <td>${exp.category}</td>
      <td>
        <button onclick="openEditExpenseModal(${exp.id})">Редактировать</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Задачи ---
function renderTasks() {
  const tbody = document.querySelector('#tasksTable tbody');
  tbody.innerHTML = '';
  globalData.tasks.forEach(task => {
    const statusText = getStatusText(task.status);
    const statusClass = getStatusClass(task.status);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${task.id}</td>
      <td>${task.title}</td>
      <td>${task.description}</td>
      <td>
        <span class="status-cell ${statusClass}">${statusText}</span>
      </td>
      <td>
        <button onclick="updateTaskStatus(${task.id}, 'pending')">В ожидании</button>
        <button onclick="updateTaskStatus(${task.id}, 'in-progress')">В процессе</button>
        <button onclick="updateTaskStatus(${task.id}, 'done')">Выполнено</button>
        <button onclick="openEditTaskModal(${task.id})">Редактировать</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function getStatusText(status) {
  switch (status) {
    case 'pending': return 'В ожидании';
    case 'in-progress': return 'В процессе';
    case 'done': return 'Выполнено';
    default: return '';
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'pending': return 'status-pending';
    case 'in-progress': return 'status-in-progress';
    case 'done': return 'status-done';
    default: return '';
  }
}

// --- Графики (Chart.js) ---
function renderCharts() {
  if (incomeChart) incomeChart.destroy();
  if (expenseChart) expenseChart.destroy();

  const ctxIncome = document.getElementById('incomeChart').getContext('2d');
  const ctxExpense = document.getElementById('expenseChart').getContext('2d');

  const incomeData = globalData.incomes.map(i => i.amount);
  const incomeLabels = globalData.incomes.map(i => `№${i.id}`);
  const expenseData = globalData.expenses.map(e => e.amount);
  const expenseLabels = globalData.expenses.map(e => `№${e.id}`);

  // Доходы
  incomeChart = new Chart(ctxIncome, {
    type: 'bar',
    data: {
      labels: incomeLabels,
      datasets: [{
        label: 'Доход (грн)',
        data: incomeData,
        backgroundColor: '#007aff'
      }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });

  // Расходы
  expenseChart = new Chart(ctxExpense, {
    type: 'bar',
    data: {
      labels: expenseLabels,
      datasets: [{
        label: 'Расход (грн)',
        data: expenseData,
        backgroundColor: '#f0ad4e'
      }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });
}

// --- Обновление Config ---
function updateConfig() {
  const budget = Number(document.getElementById('newBudget').value);
  const rent = Number(document.getElementById('newRent').value);
  const goal = Number(document.getElementById('newGoal').value);

  fetch('/api/updateConfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      budget: budget || undefined,
      monthlyRent: rent || undefined,
      monthlyIncomeGoal: goal || undefined
    })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData.success) {
        globalData = resData.data;
        renderData();
        renderCharts();
        // очищаем поля
        document.getElementById('newBudget').value = '';
        document.getElementById('newRent').value = '';
        document.getElementById('newGoal').value = '';
      }
    })
    .catch(err => console.error('Ошибка updateConfig:', err));
}

// --- Добавление дохода/расхода ---
function addIncome() {
  const amount = Number(document.getElementById('incomeAmount').value);
  const source = document.getElementById('incomeSource').value;
  if (!amount) {
    alert('Введите сумму дохода!');
    return;
  }
  fetch('/api/addIncome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, source })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData.success) {
        globalData = resData.data;
        renderData();
        renderCharts();
        document.getElementById('incomeAmount').value = '';
        document.getElementById('incomeSource').value = '';
      }
    })
    .catch(err => console.error('Ошибка addIncome:', err));
}

function addExpense() {
  const amount = Number(document.getElementById('expenseAmount').value);
  const category = document.getElementById('expenseCategory').value;
  if (!amount) {
    alert('Введите сумму расхода!');
    return;
  }
  fetch('/api/addExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, category })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData.success) {
        globalData = resData.data;
        renderData();
        renderCharts();
        document.getElementById('expenseAmount').value = '';
        document.getElementById('expenseCategory').value = '';
      }
    })
    .catch(err => console.error('Ошибка addExpense:', err));
}

// --- Редактирование дохода/расхода ---
function openEditIncomeModal(id) {
  const income = globalData.incomes.find(i => i.id === id);
  if (!income) return;
  currentEditIncomeId = id;
  document.getElementById('editIncomeAmount').value = income.amount;
  document.getElementById('editIncomeSource').value = income.source;
  showModal('editIncomeModal');
}

function openEditExpenseModal(id) {
  const expense = globalData.expenses.find(e => e.id === id);
  if (!expense) return;
  currentEditExpenseId = id;
  document.getElementById('editExpenseAmount').value = expense.amount;
  document.getElementById('editExpenseCategory').value = expense.category;
  showModal('editExpenseModal');
}

function saveIncomeChanges() {
  const amount = Number(document.getElementById('editIncomeAmount').value);
  const source = document.getElementById('editIncomeSource').value;
  fetch('/api/editIncome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: currentEditIncomeId, amount, source })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData.success) {
        globalData = resData.data;
        renderData();
        renderCharts();
        closeModal('editIncomeModal');
      }
    })
    .catch(err => console.error('Ошибка saveIncomeChanges:', err));
}

function saveExpenseChanges() {
  const amount = Number(document.getElementById('editExpenseAmount').value);
  const category = document.getElementById('editExpenseCategory').value;
  fetch('/api/editExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: currentEditExpenseId, amount, category })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData.success) {
        globalData = resData.data;
        renderData();
        renderCharts();
        closeModal('editExpenseModal');
      }
    })
    .catch(err => console.error('Ошибка saveExpenseChanges:', err));
}

// --- Задачи ---
function addTask() {
  const title = document.getElementById('taskTitle').value;
  const description = document.getElementById('taskDescription').value;
  if (!title) {
    alert('Введите название задачи!');
    return;
  }
  fetch('/api/addTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData.success) {
        globalData = resData.data;
        renderData();
        renderCharts();
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
      }
    })
    .catch(err => console.error('Ошибка addTask:', err));
}

function updateTaskStatus(id, status) {
  fetch('/api/updateTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData.success) {
        globalData = resData.data;
        renderData();
        renderCharts();
      }
    })
    .catch(err => console.error('Ошибка updateTaskStatus:', err));
}

function openEditTaskModal(id) {
  const task = globalData.tasks.find(t => t.id === id);
  if (!task) return;
  currentEditTaskId = id;
  document.getElementById('editTaskTitle').value = task.title;
  document.getElementById('editTaskDescription').value = task.description;
  showModal('editTaskModal');
}

function saveTaskChanges() {
  const title = document.getElementById('editTaskTitle').value;
  const description = document.getElementById('editTaskDescription').value;
  fetch('/api/editTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: currentEditTaskId, title, description })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData.success) {
        globalData = resData.data;
        renderData();
        renderCharts();
        closeModal('editTaskModal');
      }
    })
    .catch(err => console.error('Ошибка saveTaskChanges:', err));
}

// --- Модалки ---
function showModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// --- Экспорт CSV ---
function exportCSV() {
  window.open('/api/export/csv', '_blank');
}
