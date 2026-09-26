'use strict';
/* ============================================================================
   CheckInPage.js
   Lists bookings waiting to arrive and lets the receptionist check them in.
   Checking in updates both the booking (status, check-in time, ID verified)
   and the room (status -> Occupied) with two API calls.
   ========================================================================= */

function renderCheckInPage() {
  return renderPageHeader('Check-in') +
    `<div class="tw"><table><thead><tr><th>Booking</th><th>Guest</th><th>Room</th><th>Check-in Date</th><th>Guests</th><th></th></tr></thead><tbody id="dataRows"></tbody></table></div>`;
}

function mountCheckInPage() {
  const today = todayIso();
  const arrivals = DataStore.state.bookings.filter((booking) => booking.status === 'Confirmed').sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  qs('#dataRows').innerHTML = arrivals.length
    ? arrivals.map((booking) => {
        const room = DataStore.getRoomById(booking.roomId);
        const isDueToday = booking.checkIn <= today;
        const isRoomReady = room?.status === 'Available';

        let actionHtml;
        if (!isDueToday) actionHtml = `<span class="mu">Arrives ${formatDate(booking.checkIn)}</span>`;
        else if (!isRoomReady) actionHtml = `<span class="fe">Room ${escapeHtml(room?.number)} is ${escapeHtml(room?.status)}</span>`;
        else actionHtml = `<button class="btn sm pri" data-checkin="${booking.id}">Check In</button>`;

        return `<tr>
          <td data-l="Booking">${formatBookingNumber(booking.id)}</td>
          <td data-l="Guest">${escapeHtml(DataStore.getGuestName(booking.guestId))}</td>
          <td data-l="Room">${escapeHtml(DataStore.getRoomNumber(booking.roomId))}</td>
          <td data-l="Check-in Date">${formatDate(booking.checkIn)}</td>
          <td data-l="Guests">${booking.guests}</td>
          <td class="row end">${actionHtml}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6">${renderEmptyState('No arrivals waiting for check-in.')}</td></tr>`;

  qs('#dataRows').addEventListener('click', async (event) => {
    const checkInButton = event.target.closest('[data-checkin]');
    if (checkInButton) await performCheckIn(checkInButton.dataset.checkin);
  });
}

async function performCheckIn(bookingId) {
  const booking = DataStore.getBookingById(bookingId);
  const confirmed = await confirmDialog(
    `Confirm the guest's ID has been verified and check in <b>${escapeHtml(DataStore.getGuestName(booking.guestId))}</b> to Room ${escapeHtml(DataStore.getRoomNumber(booking.roomId))}?`,
    'Check In');
  if (!confirmed) return;

  try {
    await api(`/bookings/${bookingId}`, 'PUT', { status: 'Checked-in', checkedInAt: todayIso(), idVerified: true });
    await api(`/rooms/${booking.roomId}`, 'PUT', { status: 'Occupied' });
    showToast('Guest checked in');
    await refreshCurrentPage();
  } catch (error) { showToast(error.message, 'error'); }
}
