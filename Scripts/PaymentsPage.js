'use strict';
/* ============================================================================
   PaymentsPage.js
   "Payment / Invoice" screen: lists every booking that has an invoice
   (Checked-in or Checked-out), lets the user record a payment, and shows a
   printable invoice.
   openRecordPaymentModal() is also used from the Check-out page.
   ========================================================================= */

function renderPaymentsPage() {
  return renderPageHeader('Payment / Invoice') +
    `<div class="bar"><select id="statusFilter" aria-label="Filter by payment status">
        <option value="">All Payment Statuses</option><option>Pending</option><option>Partial</option><option>Paid</option>
      </select></div>
    <div class="tw"><table><thead><tr><th>Booking</th><th>Guest</th><th>Room</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody id="dataRows"></tbody></table></div>`;
}

function mountPaymentsPage() {
  const invoiceableBookings = DataStore.state.bookings.filter((booking) => ['Checked-in', 'Checked-out'].includes(booking.status));

  function renderRows(statusFilterValue) {
    const matchingBookings = invoiceableBookings.filter((booking) => !statusFilterValue || DataStore.getPaymentStatus(booking) === statusFilterValue);
    qs('#dataRows').innerHTML = matchingBookings.length
      ? matchingBookings.map((booking) => {
          const invoice = DataStore.computeInvoice(booking);
          return `<tr>
            <td data-l="Booking">${formatBookingNumber(booking.id)}</td>
            <td data-l="Guest">${escapeHtml(DataStore.getGuestName(booking.guestId))}</td>
            <td data-l="Room">${escapeHtml(DataStore.getRoomNumber(booking.roomId))}</td>
            <td data-l="Total">${formatMoney(invoice.grandTotal)}</td>
            <td data-l="Paid">${formatMoney(invoice.paidAmount)}</td>
            <td data-l="Balance">${formatMoney(invoice.balanceDue)}</td>
            <td data-l="Status">${statusBadgeHtml(DataStore.getPaymentStatus(booking))}</td>
            <td class="row end">
              ${invoice.balanceDue > 0 ? `<button class="btn sm pri" data-pay="${booking.id}">Record Payment</button>` : ''}
              <button class="btn sm" data-invoice="${booking.id}">View Invoice</button>
            </td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="8">${renderEmptyState('No invoices match this filter.')}</td></tr>`;
  }

  renderRows('');
  qs('#statusFilter').addEventListener('change', (event) => renderRows(event.target.value));
  qs('#dataRows').addEventListener('click', (event) => {
    const payButton = event.target.closest('[data-pay]');
    const invoiceButton = event.target.closest('[data-invoice]');
    if (payButton) openRecordPaymentModal(payButton.dataset.pay);
    if (invoiceButton) openInvoiceModal(invoiceButton.dataset.invoice);
  });
}

function openRecordPaymentModal(bookingId) {
  const booking = DataStore.getBookingById(bookingId);
  const invoice = DataStore.computeInvoice(booking);

  openFormModal({
    title: `Record Payment — ${formatBookingNumber(booking.id)}`,
    submitLabel: 'Record Payment',
    initialValues: { amount: invoice.balanceDue },
    fieldConfigs: [
      { key: 'amount', label: `Amount (Pending ${formatMoney(invoice.balanceDue)})`, inputType: 'number', required: true, min: 0.01, max: invoice.balanceDue, step: '0.01', helpText: `Up to ${formatMoney(invoice.balanceDue)}` },
      { key: 'method', label: 'Payment Method', inputType: 'select', required: true, placeholder: 'Select a method', options: [['Cash', 'Cash'], ['Card', 'Card'], ['UPI', 'UPI']] },
      { key: 'ref', label: 'Reference (Card Last 4 / UPI ID)', maxLength: 40, pattern: /^[A-Za-z0-9@._-]*$/,
        helpText: 'Required for Card and UPI. Letters, digits, @ . _ -', alwaysValidate: true,
        customValidator: (value, allValues) => (allValues.method !== 'Cash' && !value) ? 'Reference is required for Card and UPI' : '' }
    ],
    onSubmit: async (formValues) => {
      await api('/payments', 'POST', { bookingId: +bookingId, amount: +formValues.amount, method: formValues.method, ref: formValues.ref, date: todayIso() });
      closeModal();
      showToast('Payment recorded');
      await refreshCurrentPage();
    }
  });
}

function openInvoiceModal(bookingId) {
  const booking = DataStore.getBookingById(bookingId);
  const invoice = DataStore.computeInvoice(booking);
  const paymentsForBooking = DataStore.state.payments.filter((payment) => payment.bookingId == booking.id);
  const room = DataStore.getRoomById(booking.roomId);

  openModal(`
    <h2>Invoice — ${formatBookingNumber(booking.id)}</h2>
    <p><b>${escapeHtml(DataStore.getGuestName(booking.guestId))}</b><br>
      Room ${escapeHtml(DataStore.getRoomNumber(booking.roomId))} · ${escapeHtml(DataStore.getRoomTypeName(room?.typeId))}<br>
      ${formatDate(booking.checkIn)} to ${formatDate(booking.checkOut)} (${invoice.nightsCount} night${invoice.nightsCount > 1 ? 's' : ''})</p>
    <table class="s">
      <tr><td>Room Charges (${invoice.nightsCount} × ${formatMoney(booking.rate)})</td><td>${formatMoney(invoice.roomCharge)}</td></tr>
      ${(booking.charges || []).map((charge) => `<tr><td>${escapeHtml(charge.desc)}</td><td>${formatMoney(charge.amount)}</td></tr>`).join('')}
      ${invoice.discount ? `<tr><td>Discount</td><td>- ${formatMoney(invoice.discount)}</td></tr>` : ''}
      <tr><td>Tax (${invoice.taxPercent}%)</td><td>${formatMoney(invoice.taxAmount)}</td></tr>
      <tr class="tot"><td>Grand Total</td><td>${formatMoney(invoice.grandTotal)}</td></tr>
      ${paymentsForBooking.map((payment) => `<tr><td>Paid via ${escapeHtml(payment.method)} on ${formatDate(payment.date)}</td><td>- ${formatMoney(payment.amount)}</td></tr>`).join('')}
      <tr class="tot"><td>Balance Due</td><td>${formatMoney(invoice.balanceDue)}</td></tr>
    </table>
    <div class="row end" style="margin-top:14px"><button class="btn" data-x>Close</button><button type="button" class="btn pri no-print" onclick="window.print()">Print</button></div>`,
    true);
}
