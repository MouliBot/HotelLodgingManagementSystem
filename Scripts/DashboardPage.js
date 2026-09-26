'use strict';
/* ============================================================================
   DashboardPage.js
   Overview screen: room counts, today's arrivals/departures, revenue summary.
   ========================================================================= */

function renderDashboardPage() {
  return renderPageHeader('Dashboard') + `<div id="dashboardContent"></div>`;
}

function mountDashboardPage() {
  const today = todayIso();
  const { rooms, bookings, payments } = DataStore.state;

  const roomCountByStatus = (status) => rooms.filter((room) => room.status === status).length;
  const arrivalsToday = bookings.filter((booking) => booking.checkIn === today && booking.status !== 'Cancelled');
  const departuresToday = bookings.filter((booking) => booking.status === 'Checked-in' && booking.checkOut <= today);
  const sumPayments = (paymentList) => paymentList.reduce((sum, payment) => sum + payment.amount, 0);
  const pendingDuesTotal = bookings
    .filter((booking) => ['Checked-in', 'Checked-out'].includes(booking.status))
    .reduce((sum, booking) => sum + Math.max(0, DataStore.computeInvoice(booking).balanceDue), 0);

  const statCard = (label, value, routeKey) => `<a class="stat" href="#/${routeKey}"><small>${escapeHtml(label)}</small><b>${value}</b></a>`;

  qs('#dashboardContent').innerHTML = `
    <div class="grid">
      ${statCard('Total Rooms', rooms.length, 'rooms')}
      ${statCard('Available', roomCountByStatus('Available'), 'rooms')}
      ${statCard('Occupied', roomCountByStatus('Occupied'), 'rooms')}
      ${statCard("Today's Check-ins", arrivalsToday.length, 'check-in')}
      ${statCard("Today's Check-outs", departuresToday.length, 'check-out')}
    </div>
    <h3>Revenue Summary</h3>
    <div class="grid">
      <div class="chip"><small>Collected Today</small><b>${formatMoney(sumPayments(payments.filter((p) => p.date === today)))}</b></div>
      <div class="chip"><small>Collected This Month</small><b>${formatMoney(sumPayments(payments.filter((p) => p.date.startsWith(today.slice(0, 7)))))}</b></div>
      <div class="chip"><small>Total Collected</small><b>${formatMoney(sumPayments(payments))}</b></div>
      <div class="chip"><small>Pending Dues</small><b>${formatMoney(pendingDuesTotal)}</b></div>
    </div>
    <h3>Room Board</h3>
    <div class="board">${rooms.map((room) => `<a class="tile ${STATUS_BADGE_COLOR[room.status] || 'mu'}" href="#/rooms"><b>${escapeHtml(room.number)}</b><small>${escapeHtml(DataStore.getRoomTypeName(room.typeId))} · ${escapeHtml(room.status)}</small></a>`).join('')}</div>`;
}
