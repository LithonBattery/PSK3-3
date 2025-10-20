/**
 * Extracts and validates transaction form input values.
 * 
 * GRASP: Information Expert — this function is closest to (and "knows")
 * the data it validates, so it is the correct place for this logic.
 * 
 * SRP: This function has a single responsibility — to read + validate input.
 * It does NOT handle DOM events or API logic.
 * 
 * @returns {object|null} A normalized transaction object or null if invalid
 */
function getTransactionData() {
  const amountEl   = document.getElementById('amount');
  const titleEl    = document.getElementById('title');
  const typeEl     = document.getElementById('type');
  const categoryEl = document.getElementById('category');

  // Use Number.parseFloat instead of global parseFloat (code smell fix)
  const amount = Number.parseFloat(amountEl.value);
  const title  = titleEl.value.trim();
  const type   = typeEl.value;
  const category = categoryEl.value;

  // Use Number.isNaN instead of global isNaN (code smell fix)
  if (!title || Number.isNaN(amount)) {
    alert('Please enter a title and valid amount.');
    return null;
  }

  return { amount, title, type, category };
}


/**
 * Wires up the submit handler for the transaction form.
 * 
 * SRP: This function now only handles event binding + workflow logic,
 * leaving validation to getTransactionData() and persistence to authFetch().
 */
function wireUpForm() {
  document.getElementById('transactionForm').addEventListener('submit', async e => {
    e.preventDefault();

    // Delegate validation to the single-purpose helper
    const data = getTransactionData();
    if (!data) return; // Exit early if validation fails

    const { amount, title, type, category } = data;

    // Decide which endpoint to hit based on the type
    const endpoint = type === 'income'
      ? '/httpTriggerAddIncome'
      : '/httpTriggerAddSpending';

    try {
      // Post the transaction data to the proper API endpoint
      const res = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          amount,
          category,
          title,
          ...(type === 'expense' && { type: 'expense' })
        })
      });

      // API-level validation
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || res.statusText);
      }

    } catch (err) {
      console.error('Transaction save failed:', err);
      alert('Could not save transaction: ' + err.message);
      return;
    }

    // Reset form UI and refresh internal data
    e.target.reset();
    await loadData();
    if (window.fetchSpentPerCategory) window.fetchSpentPerCategory();
  });
}
