'use strict';
/* ============================================================================
   ReportsPage.js
   Admin-only page (see ROLE_PERMISSIONS.VIEW_REPORTS in Session.js).
   Shows payments collected in a date range and lets the user export them.
   ========================================================================= */

let lastGeneratedReport = null;

function renderReportsPage() {
  return renderPageHeader('Reports') +
    `<div class="bar">
      <label>From <input type="date" id="reportFromDate" value="${todayIso().slice(0, 8)}01"></label>
      <label>To <input type="date" id="reportToDate" value="${todayIso()}"></label>
      <button class="btn pri" id="runReportButton">Run Report</button>
      <button class="btn" id="exportCsvButton">Export CSV</button>
    </div>
    <p class="fe" id="reportError" role="alert"></p>
    <div id="reportResults"></div>`;
}

function mountReportsPage() {
  qs('#runReportButton').addEventListener('click', () => {
    const fromDate = qs('#reportFromDate').value;
    const toDate = qs('#reportToDate').value;
    const errorBox = qs('#reportError');
    errorBox.textContent = '';

    if (!fromDate || !toDate) return errorBox.textContent = 'Choose both a start and an end date.';
    if (fromDate > toDate) return errorBox.textContent = 'The start date must be on or before the end date.';
    if (daysBetween(fromDate, toDate) > 366) return errorBox.textContent = 'Choose a range of one year or less.';

    const paymentsInRange = DataStore.state.payments.filter((payment) => payment.date >= fromDate && payment.date <= toDate);
    const totalCollected = paymentsInRange.reduce((sum, payment) => sum + payment.amount, 0);
    const pendingDuesTotal = DataStore.state.bookings
      .filter((booking) => ['Checked-in', 'Checked-out'].includes(booking.status))
      .reduce((sum, booking) => sum + Math.max(0, DataStore.computeInvoice(booking).balanceDue), 0);

    lastGeneratedReport = {
      columns: ['Date', 'Guest', 'Method', 'Reference', 'Amount'],
      rows: paymentsInRange.map((payment) => [
        payment.date, DataStore.getGuestName(DataStore.getBookingById(payment.bookingId)?.guestId), payment.method, payment.ref || '—', formatMoney(payment.amount)
      ])
    };

    const summaryHtml = `<div class="grid">
      <div class="chip"><small>Payments</small><b>${paymentsInRange.length}</b></div>
      <div class="chip"><small>Total Collected</small><b>${formatMoney(totalCollected)}</b></div>
      <div class="chip"><small>Pending Dues (All Invoices)</small><b>${formatMoney(pendingDuesTotal)}</b></div>
    </div>`;
    const tableHtml = renderDataTable(lastGeneratedReport.columns.map((columnName, index) => [columnName, (row) => escapeHtml(row[index])]), lastGeneratedReport.rows, 'No payments in this date range.');
    qs('#reportResults').innerHTML = summaryHtml + tableHtml;
  });

  qs('#exportCsvButton').addEventListener('click', () => {
    if (!lastGeneratedReport || !lastGeneratedReport.rows.length) return showToast('Run a report with results first', 'error');
    const csvText = [lastGeneratedReport.columns, ...lastGeneratedReport.rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(new Blob([csvText], { type: 'text/csv' }));
    downloadLink.download = `hotel-report-${todayIso()}.csv`;
    downloadLink.click();
  });
}
