'use strict';
/* ============================================================================
   AvailabilityPage.js
   Lets the user search for rooms free on a date range and book one directly.
   ========================================================================= */

function renderAvailabilityPage() {
  const roomTypeOptions = DataStore.state.roomTypes.map((roomType) => [roomType.id, roomType.name]);
  return renderPageHeader('Check Availability') +
    `<form id="availabilityForm" class="card grid" novalidate>
      ${buildFieldHtml({ key: 'checkIn', label: 'Check-in Date', inputType: 'date', required: true, min: todayIso() }, todayIso())}
      ${buildFieldHtml({ key: 'checkOut', label: 'Check-out Date', inputType: 'date', required: true, min: todayIso() }, addDaysIso(todayIso(), 1))}
      ${buildFieldHtml({ key: 'guests', label: 'Number of Guests', inputType: 'number', required: true, min: 1, max: 10, integerOnly: true }, 1)}
      ${buildFieldHtml({ key: 'roomTypeId', label: 'Room Type (Optional)', inputType: 'select', options: roomTypeOptions, placeholder: 'Any room type' })}
      <div class="fld"><br><button class="btn pri">Search</button></div>
    </form>
    <p class="fe" id="availabilityError" role="alert"></p>
    <div id="availabilityResults" class="cols"></div>`;
}

function mountAvailabilityPage() {
  const formElement = qs('#availabilityForm');

  formElement.onsubmit = (event) => {
    event.preventDefault();
    const fieldsToValidate = [
      { key: 'checkIn', label: 'Check-in Date', required: true },
      { key: 'checkOut', label: 'Check-out Date', required: true, customValidator: (value, allValues) => value <= allValues.checkIn ? 'Check-out must be after check-in' : '' },
      { key: 'guests', label: 'Number of Guests', inputType: 'number', required: true, min: 1, max: 10, integerOnly: true }
    ];
    if (!validateFields(fieldsToValidate, formElement)) return;

    const formValues = getFormValues(formElement);
    const guestsCount = +formValues.guests;
    let availableRooms = DataStore.findAvailableRooms(formValues.checkIn, formValues.checkOut, guestsCount);
    if (formValues.roomTypeId) availableRooms = availableRooms.filter((room) => room.typeId == formValues.roomTypeId);

    const resultsContainer = qs('#availabilityResults');
    resultsContainer.innerHTML = availableRooms.length
      ? availableRooms.map((room) => `
        <div class="card">
          <h3>Room ${escapeHtml(room.number)}</h3>
          <p class="mu">${escapeHtml(DataStore.getRoomTypeName(room.typeId))} · Fits up to ${room.capacity} guests</p>
          <p><b>${formatMoney(room.price)}</b> / night</p>
          <button class="btn pri" data-book="${room.id}">Book This Room</button>
        </div>`).join('')
      : renderEmptyState('No rooms are available for these dates. Try different dates or fewer guests.');

    qsa('[data-book]', resultsContainer).forEach((button) => button.addEventListener('click', () => {
      openBookingFormModal({ presetRoomId: +button.dataset.book, presetCheckIn: formValues.checkIn, presetCheckOut: formValues.checkOut, presetGuestsCount: guestsCount });
    }));
  };
}
