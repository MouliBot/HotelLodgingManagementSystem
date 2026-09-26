'use strict';
/* ============================================================================
   MyBookingsPage.js
   Customer-facing "My Bookings" screen. Reuses cancelBooking() (from
   BookingsPage.js) and openInvoiceModal()/openRecordPaymentModal() (from
   PaymentsPage.js) so the payment and cancellation logic exists in one place
   for both the staff and customer views.
   ========================================================================= */

function renderMyBookingsPage() {
  return renderPageHeader('My Bookings') + `<div id="myBookingsContent"></div>`;
}

function mountMyBookingsPage() {
  const account = Session.currentUser;
  const guestProfile = DataStore.findGuestByEmail(account.email);
  const myBookings = guestProfile ? DataStore.state.bookings.filter((booking) => booking.guestId == guestProfile.id) : [];

  if (!myBookings.length) {
    qs('#myBookingsContent').innerHTML = renderEmptyState('You have no bookings yet. <a href="#/book-stay">Book a stay</a> to get started.');
    return;
  }

  qs('#myBookingsContent').innerHTML = renderDataTable(
    [
      ['Booking', (booking) => formatBookingNumber(booking.id)],
      ['Room', (booking) => escapeHtml(DataStore.getRoomNumber(booking.roomId)) + ' · ' + escapeHtml(DataStore.getRoomTypeName(DataStore.getRoomById(booking.roomId)?.typeId))],
      ['Stay', (booking) => `${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}`],
      ['Total', (booking) => formatMoney(DataStore.computeInvoice(booking).grandTotal)],
      ['Balance', (booking) => formatMoney(DataStore.computeInvoice(booking).balanceDue)],
      ['Status', (booking) => statusBadgeHtml(booking.status)],
      ['', (booking) => {
        const invoice = DataStore.computeInvoice(booking);
        const buttons = [`<button class="btn sm" data-invoice="${booking.id}">Invoice</button>`];
        if (invoice.balanceDue > 0 && booking.status !== 'Cancelled') buttons.push(`<button class="btn sm pri" data-pay="${booking.id}">Pay Now</button>`);
        if (booking.status === 'Confirmed') buttons.push(`<button class="btn sm dng" data-cancel="${booking.id}">Cancel</button>`);
        return `<div class="row end">${buttons.join('')}</div>`;
      }]
    ],
    myBookings.slice().sort((a, b) => b.id - a.id),
    'No bookings found.'
  );

  qs('#myBookingsContent').addEventListener('click', async (event) => {
    const invoiceButton = event.target.closest('[data-invoice]');
    const payButton = event.target.closest('[data-pay]');
    const cancelButton = event.target.closest('[data-cancel]');
    if (invoiceButton) openInvoiceModal(invoiceButton.dataset.invoice);
    if (payButton) openRecordPaymentModal(payButton.dataset.pay);
    if (cancelButton) await cancelBooking(cancelButton.dataset.cancel);
  });
}
