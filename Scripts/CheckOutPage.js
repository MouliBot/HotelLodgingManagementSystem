'use strict';
/* ============================================================================
   CheckOutPage.js
   Lists currently checked-in guests, lets the receptionist add extra charges,
   record a payment, and check the guest out once the balance is cleared.
   Checking out updates the booking (status, checkout time) and the room
   (status -> Available) with two API calls.
   ========================================================================= */

function renderCheckOutPage() {
  return renderPageHeader('Check-out') +
    `<div class="tw"><table><thead><tr><th>Booking</th><th>Guest</th><th>Room</th><th>Nights</th><th>Total</th><th>Balance</th><th>Payment</th><th></th></tr></thead><tbody id="dataRows"></tbody></table></div>`;
}

function mountCheckOutPage() {
  const stayingGuests = DataStore.state.bookings.filter((booking) => booking.status === 'Checked-in');

  qs('#dataRows').innerHTML = stayingGuests.length
    ? stayingGuests.map((booking) => {
        const invoice = DataStore.computeInvoice(booking);
        const canCheckOut = invoice.balanceDue <= 0;
        return `<tr>
          <td data-l="Booking">${formatBookingNumber(booking.id)}</td>
          <td data-l="Guest">${escapeHtml(DataStore.getGuestName(booking.guestId))}</td>
          <td data-l="Room">${escapeHtml(DataStore.getRoomNumber(booking.roomId))}</td>
          <td data-l="Nights">${invoice.nightsCount}</td>
          <td data-l="Total">${formatMoney(invoice.grandTotal)}</td>
          <td data-l="Balance">${formatMoney(invoice.balanceDue)}</td>
          <td data-l="Payment">${statusBadgeHtml(DataStore.getPaymentStatus(booking))}</td>
          <td class="row end">
            <button class="btn sm" data-charges="${booking.id}">Charges</button>
            <button class="btn sm" data-pay="${booking.id}">Record Payment</button>
            <button class="btn sm pri" data-checkout="${booking.id}" ${canCheckOut ? '' : 'disabled title="Clear the pending balance first"'}>Check Out</button>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8">${renderEmptyState('No guests are currently checked in.')}</td></tr>`;

  qs('#dataRows').addEventListener('click', async (event) => {
    const chargesButton = event.target.closest('[data-charges]');
    const payButton = event.target.closest('[data-pay]');
    const checkoutButton = event.target.closest('[data-checkout]');
    if (chargesButton) openExtraChargesModal(chargesButton.dataset.charges);
    if (payButton) openRecordPaymentModal(payButton.dataset.pay);
    if (checkoutButton) await performCheckOut(checkoutButton.dataset.checkout);
  });
}

function openExtraChargesModal(bookingId) {
  const booking = DataStore.getBookingById(bookingId);
  const existingCharges = booking.charges || [];

  const modalElement = openModal(`
    <h2>Extra Charges — ${formatBookingNumber(booking.id)}</h2>
    <div class="tw" id="chargesTable">${renderChargesTable(existingCharges)}</div>
    <div class="row" style="margin-top:12px">
      <input id="chargeDescriptionInput" placeholder="Description (e.g. Minibar)" maxlength="60" style="flex:2;min-width:120px" aria-label="Charge description">
      <input id="chargeAmountInput" type="number" min="0.01" max="1000000" step="0.01" placeholder="Amount" style="flex:1;min-width:90px" aria-label="Charge amount">
      <button class="btn" id="addChargeButton">Add</button>
    </div>
    <p class="fe" id="chargeFormError" role="alert"></p>
    <div class="row end" style="margin-top:12px"><button class="btn" data-x>Close</button></div>`);

  function saveCharges(updatedCharges) {
    return api(`/bookings/${bookingId}`, 'PUT', { charges: updatedCharges });
  }

  qs('#addChargeButton', modalElement).addEventListener('click', async () => {
    const description = qs('#chargeDescriptionInput', modalElement).value.trim();
    const amount = Number(qs('#chargeAmountInput', modalElement).value);
    const errorBox = qs('#chargeFormError', modalElement);

    if (!/^[A-Za-z0-9 .,'&()/-]{2,60}$/.test(description)) { errorBox.textContent = "Description: 2-60 characters (letters, digits, spaces or . , ' & ( ) / -)"; return; }
    if (!(amount >= 0.01 && amount <= 1000000)) { errorBox.textContent = 'Amount must be between ₹0.01 and ₹10,00,000'; return; }

    try {
      await saveCharges([...existingCharges, { desc: description, amount }]);
      showToast('Charge added');
      closeModal();
      await refreshCurrentPage();
    } catch (error) { errorBox.textContent = error.message; }
  });

  qsa('[data-remove-charge]', modalElement).forEach((button) => button.addEventListener('click', async () => {
    try {
      await saveCharges(existingCharges.filter((_, index) => index != button.dataset.removeCharge));
      showToast('Charge removed');
      closeModal();
      await refreshCurrentPage();
    } catch (error) { showToast(error.message, 'error'); }
  }));
}

function renderChargesTable(charges) {
  if (!charges.length) return '<p class="mu">No extra charges added yet.</p>';
  return `<table class="s">${charges.map((charge, index) => `<tr><td>${escapeHtml(charge.desc)}</td><td>${formatMoney(charge.amount)}</td><td><button class="btn sm dng" data-remove-charge="${index}">Remove</button></td></tr>`).join('')}</table>`;
}

async function performCheckOut(bookingId) {
  const booking = DataStore.getBookingById(bookingId);
  const invoice = DataStore.computeInvoice(booking);
  if (invoice.balanceDue > 0) return showToast(`Clear the pending balance of ${formatMoney(invoice.balanceDue)} before checking out`, 'error');

  const confirmed = await confirmDialog(`Check out <b>${escapeHtml(DataStore.getGuestName(booking.guestId))}</b> from Room ${escapeHtml(DataStore.getRoomNumber(booking.roomId))}?`, 'Check Out');
  if (!confirmed) return;

  try {
    const actualCheckOutDate = booking.checkOut > todayIso() ? booking.checkOut : todayIso();
    await api(`/bookings/${bookingId}`, 'PUT', { status: 'Checked-out', checkedOutAt: todayIso(), actualOut: actualCheckOutDate });
    await api(`/rooms/${booking.roomId}`, 'PUT', { status: 'Available' });
    showToast('Guest checked out');
    await refreshCurrentPage();
  } catch (error) { showToast(error.message, 'error'); }
}
