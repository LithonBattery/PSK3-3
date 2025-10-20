function authFetch(path, opts = {}) {
  const token = localStorage.getItem('jwt');
  if (!token) throw new Error('Not authenticated');
  opts.headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(opts.headers || {})
  };
  return fetch(`${API_BASE}${path}`, opts);
}

let transactions = [];
let budgetId = null;
let budget = 0;

async function loadData() {
  console.log('loadData start');
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  console.log('fetching budget for', month, year);
 let bv;
  let budgetJson;
  try {
    const res = await authFetch(
      `/httpTriggerGetBudget?month=${month}&year=${year}`,
      { method: 'GET' }
    );
    console.log('budget response status:', res.status);

    budgetJson = await res.json();
    console.log('budget payload:', budgetJson);

    if (typeof budgetJson.budget === 'number') {
      bv = budgetJson.budget;
    }
    else if (budgetJson.budget && typeof budgetJson.budget.amount === 'number') {
      bv = budgetJson.budget.amount;
    }
    else if (typeof budgetJson.amount === 'number') {
      bv = budgetJson.amount;
    }
    else {
      console.warn('Unrecognized budget shape, defaulting to 0');
      bv = 0;
    }
  } catch (err) {
    console.error('budget fetch failed:', err);
    bv = 0;
    budgetJson = null;
  }

  budget = bv;
  budgetId = budgetJson
    ? (budgetJson.id
       ?? (budgetJson.budget && budgetJson.budget.id)
       ?? null)
    : null;
  console.log('loaded budget =', budget);
  document.getElementById('budgetInput').value = budget;

  const setBtn = document.getElementById('setBudgetBtn');
  const updateBtn = document.getElementById('updateBudgetBtn');
  if (budgetId) {
    setBtn.style.display = "none";
    updateBtn.style.display = "";
  } else {
    setBtn.style.display = "";
    updateBtn.style.display = "none";
  }

  console.log('Fetching incomes...');
  const incRes = await authFetch('/httpTriggerGetIncome', { method: 'GET' });
  console.log('Incomes response status:', incRes.status);
  const incJson = await incRes.json();
  console.log('Incomes payload:', incJson);
  const incomes = Array.isArray(incJson)
    ? incJson
    : incJson.income || [];

  console.log('Fetching expenses...');
  const expRes = await authFetch('/httpTriggerGetSpendings', { method: 'GET' });
  console.log('Expenses response status:', expRes.status);
  const expJson = await expRes.json();
  console.log('Expenses payload:', expJson);
  const expenses = Array.isArray(expJson)
    ? expJson
    : expJson.spendings || [];

  transactions = [
    ...incomes.map(i => ({
      id:         i.id,
      amount:    i.amount,
      desc:      i.desc ?? i.title ?? '',
      category:  i.category,
      type:      'Income',
      timestamp: i.timestamp
    })),
    ...expenses.map(e => ({
      id:         e.id,
      amount:    e.amount,
      desc:      e.desc ?? e.title ?? '',
      category:  e.category,
      type:      'Expense',
      timestamp: e.timestamp
    }))
  ];

  renderTransactions();
  updateSummary();
}

function renderTransactions() {
  const tbody = document.getElementById('transactions');
  tbody.innerHTML = '';
  transactions.forEach((t, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.amount.toFixed(2)}</td>
      <td>${t.desc}</td>
      <td>${t.category}</td>
      <td class="${t.type}">${t.type}</td>      
      <td><button onclick="deleteTransaction(${idx})">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function updateSummary() {
  const incomeTotal  = transactions.filter(t => t.type === 'Income').reduce((sum, t) => sum + t.amount, 0);
  const expenseTotal = transactions.filter(t => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0);

  document.getElementById('totalIncome').textContent  = incomeTotal.toFixed(2);
  document.getElementById('totalExpenses').textContent = expenseTotal.toFixed(2);
  document.getElementById('budget').textContent        = budget.toFixed(2);
  document.getElementById('balance').textContent       = (budget - expenseTotal).toFixed(2);
}

function wireUpBudget() {
  setBudgetBtn.addEventListener('click', async () => {
    const val   = parseFloat(budgetInput.value);
    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    budget      = isNaN(val) ? 0 : val;

    try {
      const res = await authFetch('/httpTriggerAddBudget', {
        method: 'POST',
        body: JSON.stringify({ amount: budget, description: 'Monthly budget', month, year })
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);

      // capture the id from the upsert response
      const saved = await res.json();
      budgetId    = saved.id;
      console.log('Saved budget with id', budgetId);

      updateSummary();

      setBudgetBtn.style.display = "none";
      updateBudgetBtn.style.display = "";
    } catch (e) {
      console.error('Set budget failed', e);
      alert('Could not set budget: ' + e.message);
    }
  });
}



function wireUpUpdateBudget() {
  updateBudgetBtn.addEventListener('click', async () => {
    if (!budgetId) {
      return alert('No existing budget to update. Please click Set Budget first.');
    }

    const val   = parseFloat(budgetInput.value);
    budget      = isNaN(val) ? 0 : val;

    try {
      const res = await authFetch(
        `/httpTriggerUpdateBudget?id=${encodeURIComponent(budgetId)}`,
        { method: 'PUT', body: JSON.stringify({ amount: budget }) }
      );
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);

      console.log('Budget updated');
      updateSummary();
    } catch (e) {
      console.error('Update budget failed', e);
      alert('Could not update budget: ' + e.message);
    }
  });
}



function wireUpForm() {
  document.getElementById('transactionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('amount').value);
    const title  = document.getElementById('title').value.trim();
    const type   = document.getElementById('type').value;
    const category = document.getElementById('category').value;
    const endpoint = type === 'income'
      ? '/httpTriggerAddIncome'
      : '/httpTriggerAddSpending';

    if (!title || isNaN(amount)) {
      return alert('Please enter a title and valid amount.');
    }

    try {
      const res = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          amount,
          category,
          title,
          ...(type === 'expense' && { type: 'expense' })
        })
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || res.statusText);
      }
    } catch (err) {
      console.error('Transaction save failed:', err);
      return alert('Could not save transaction: ' + err.message);
    }

    e.target.reset();
    await loadData();
    if (window.fetchSpentPerCategory) window.fetchSpentPerCategory();
  });
}

window.deleteTransaction = async idx => {
  const tx = transactions[idx];
  const endpoint = tx.type === 'Income'
    ? '/httpTriggerDeleteIncome'
    : '/httpTriggerDeleteSpending';

  try {
    const res = await authFetch(
      `${endpoint}?id=${encodeURIComponent(tx.id)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `Status ${res.status}`);
    }
  } catch (err) {
    console.error('Delete transaction failed:', err);
    return alert('Could not delete transaction: ' + err.message);
  }
  await loadData();
  if (window.fetchSpentPerCategory) window.fetchSpentPerCategory();
};
window.editTransaction = idx => console.log('Edit transaction', idx);

document.addEventListener('DOMContentLoaded', () => {
  wireUpBudget();
  wireUpUpdateBudget();
  wireUpForm();
  loadData().catch(err => {
    console.error('Initial load failed:', err);
    alert('Load failed');
  });
});