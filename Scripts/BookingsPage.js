'use strict';
/* ============================================================================
   BookingsPage.js
   Lists every booking with its invoice total/balance and status, and lets
   the user create, modify or cancel a booking.

   openBookingFormModal() is also used by AvailabilityPage.js when a guest
   books a specific room straight from the search results.
   ========================================================================= */

function renderBookingsPage() {
  return renderPageHeader('Bookings', `<button class="btn pri" id="newBookingButton">+ New Booking</button>`) +
    `<div class="bar"><input type="search" id="searchInput" placeholder="Search guest, room or booking number" aria-label="Search"></div>` +
    `<div class="tw"><table><thead><tr><th>Booking</th><th>Guest</th><th>Room</th><th>Stay</th><th>Guests</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody id="dataRows"></tbody></table></div>`;
}

function mountBookingsPage() {
  const bookings = DataStore.state.bookings;

  function renderRows(searchText) {
    const searchLower = searchText.toLowerCase();
    const matchingBookings = bookings.filter((booking) =>
      !searchText || [DataStore.getGuestName(booking.guestId), DataStore.getRoomNumber(booking.roomId), formatBookingNumber(booking.id)].join(' ').toLowerCase().includes(searchLower));

    qs('#dataRows').innerHTML = matchingBookings.length
      ? matchingBookings.slice().sort((a, b) => b.id - a.id).map((booking) => {
          const invoice = DataStore.computeInvoice(booking);
          const canModify = booking.status === 'Confirmed';
          return `<tr>
            <td data-l="Booking">${formatBookingNumber(booking.id)}</td>
            <td data-l="Guest">${escapeHtml(DataStore.getGuestName(booking.guestId))}</td>
            <td data-l="Room">${escapeHtml(DataStore.getRoomNumber(booking.roomId))}</td>
            <td data-l="Stay">${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}</td>
            <td data-l="Guests">${booking.guests}</td>
            <td data-l="Total">${formatMoney(invoice.grandTotal)}</td>
            <td data-l="Balance">${formatMoney(invoice.balanceDue)}</td>
            <td data-l="Status">${statusBadgeHtml(booking.status)}</td>
            <td class="row end">${canModify ? `<button class="btn sm" data-modify="${booking.id}">Modify</button><button class="btn sm dng" data-cancel="${booking.id}">Cancel</button>` : ''}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="9">${renderEmptyState('No bookings found.')}</td></tr>`;
  }

  renderRows('');
  qs('#searchInput').addEventListener('input', (event) => renderRows(event.target.value));
  qs('#newBookingButton').addEventListener('click', () => openBookingFormModal({}));
  qs('#dataRows').addEventListener('click', async (event) => {
    const modifyButton = event.target.closest('[data-modify]');
    const cancelButton = event.target.closest('[data-cancel]');
    if (modifyButton) openBookingFormModal({ existingBooking: bookings.find((booking) => booking.id == modifyButton.dataset.modify) });
    if (cancelButton) await cancelBooking(cancelButton.dataset.cancel);
  });
}

async function cancelBooking(bookingId) {
  const confirmed = await confirmDialog('Cancel this booking? This cannot be undone.', 'Cancel Booking');
  if (!confirmed) return;
  try {
    await api(`/bookings/${bookingId}`, 'PUT', { status: 'Cancelled' });
    showToast('Booking cancelled');
    await refreshCurrentPage();
  } catch (error) { showToast(error.message, 'error'); }
}

/**
 * Opens the create/modify booking form.
 * options: existingBooking (to modify), or presetRoomId/presetCheckIn/presetCheckOut/
 * presetGuestsCount/presetGuestId to pre-fill a new booking (used by the Availability page).
 */
function openBookingFormModal(options = {}) {
  const { existingBooking = null, presetRoomId, presetCheckIn, presetCheckOut, presetGuestsCount, presetGuestId } = options;
  const isEditing = !!existingBooking;

  const guestOptions = DataStore.state.guests.map((guest) => [guest.id, `${guest.name} (${guest.phone})`]);
  const defaultCheckIn = existingBooking?.checkIn || presetCheckIn || todayIso();
  const defaultCheckOut = existingBooking?.checkOut || presetCheckOut || addDaysIso(defaultCheckIn, 1);
  const defaultGuestsCount = existingBooking?.guests || presetGuestsCount || 1;
  const defaultGuestId = existingBooking?.guestId || presetGuestId || '';

  const modalElement = openModal(`
    <h2>${isEditing ? 'Modify Booking' : 'New Booking'}</h2>
    <form id="bookingForm" novalidate>
      ${buildFieldHtml({ key: 'guestId', label: 'Guest', inputType: 'select', required: true, options: guestOptions, placeholder: 'Select a guest' }, defaultGuestId)}
      ${buildFieldHtml({ key: 'checkIn', label: 'Check-in Date', inputType: 'date', required: true, min: isEditing ? undefined : todayIso() }, defaultCheckIn)}
      ${buildFieldHtml({ key: 'checkOut', label: 'Check-out Date', inputType: 'date', required: true }, defaultCheckOut)}
      ${buildFieldHtml({ key: 'guests', label: 'Number of Guests', inputType: 'number', required: true, min: 1, max: 10, integerOnly: true }, defaultGuestsCount)}
      <label class="fld"><span>Room *</span><select name="roomId" id="roomIdSelect" required></select><small class="fe" data-e="roomId"></small></label>
      <p class="fe" id="bookingFormError" role="alert"></p>
      <div class="row end"><button type="button" class="btn" data-x>Cancel</button><button class="btn pri">Save Booking</button></div>
    </form>`);

  const formElement = qs('#bookingForm', modalElement);

  function refreshAvailableRoomOptions() {
    const checkIn = formElement.elements.checkIn.value;
    const checkOut = formElement.elements.checkOut.value;
    const guestsCount = +formElement.elements.guests.value || 1;
    let candidateRooms = DataStore.findAvailableRooms(checkIn, checkOut, guestsCount, existingBooking?.id);

    // Keep the room already on this booking selectable even though it is "taken" by itself.
    const roomToAlwaysInclude = existingBooking ? DataStore.getRoomById(existingBooking.roomId) : (presetRoomId ? DataStore.getRoomById(presetRoomId) : null);
    if (roomToAlwaysInclude && !candidateRooms.some((room) => room.id == roomToAlwaysInclude.id)) candidateRooms = [roomToAlwaysInclude, ...candidateRooms];

    const roomSelectElement = qs('#roomIdSelect', formElement);
    roomSelectElement.innerHTML = candidateRooms.length
      ? candidateRooms.map((room) => `<option value="${room.id}">Room ${escapeHtml(room.number)} · ${escapeHtml(DataStore.getRoomTypeName(room.typeId))} · ${formatMoney(room.price)}/night</option>`).join('')
      : '<option value="">No rooms available for these dates</option>';

    const roomIdToPreselect = existingBooking?.roomId || presetRoomId;
    if (roomIdToPreselect && [...roomSelectElement.options].some((option) => option.value == roomIdToPreselect)) roomSelectElement.value = roomIdToPreselect;
  }

  refreshAvailableRoomOptions();
  formElement.addEventListener('input', (event) => { if (['checkIn', 'checkOut', 'guests'].includes(event.target.name)) refreshAvailableRoomOptions(); });

  formElement.onsubmit = async (event) => {
    event.preventDefault();
    const fieldsToValidate = [
      { key: 'guestId', label: 'Guest', required: true },
      { key: 'checkIn', label: 'Check-in Date', required: true },
      { key: 'checkOut', label: 'Check-out Date', required: true, customValidator: (value, allValues) => value <= allValues.checkIn ? 'Check-out must be after check-in' : '' },
      { key: 'guests', label: 'Number of Guests', inputType: 'number', required: true, min: 1, max: 10, integerOnly: true }
    ];
    if (!validateFields(fieldsToValidate, formElement)) return;

    const formValues = getFormValues(formElement);
    const selectedRoomId = qs('#roomIdSelect', formElement).value;
    const roomErrorElement = qs('[data-e="roomId"]', formElement);
    if (!selectedRoomId) { roomErrorElement.textContent = 'Select an available room'; return; }
    roomErrorElement.textContent = '';

    const selectedRoom = DataStore.getRoomById(selectedRoomId);
    if (+formValues.guests > selectedRoom.capacity) {
      qs('[data-e="guests"]', formElement).textContent = `Room ${selectedRoom.number} fits up to ${selectedRoom.capacity} guests`;
      return;
    }

    const saveButton = qs('.pri', formElement);
    saveButton.disabled = true;
    const errorBox = qs('#bookingFormError', modalElement);
    errorBox.textContent = '';
    try {
      const bookingPayload = {
        guestId: +formValues.guestId, roomId: +selectedRoomId, checkIn: formValues.checkIn, checkOut: formValues.checkOut, guests: +formValues.guests,
        status: existingBooking?.status || 'Confirmed', rate: selectedRoom.price,
        discount: existingBooking?.discount || 0, taxPct: existingBooking?.taxPct ?? 12, charges: existingBooking?.charges || []
      };
      await api(isEditing ? `/bookings/${existingBooking.id}` : '/bookings', isEditing ? 'PUT' : 'POST', bookingPayload);
      closeModal();
      showToast(isEditing ? 'Booking updated' : 'Booking created');
      await refreshCurrentPage();
    } catch (error) {
      errorBox.textContent = error.message;
      saveButton.disabled = false;
    }
  };
}
