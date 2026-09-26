'use strict';
/* ============================================================================
   BookStayPage.js
   Customer-facing self-service search and booking screen ("audience:
   customer" in Router.js). A customer never picks a guest from a list - they
   ARE the guest, so this file resolves/creates their Guest record from their
   account email (see DataStore.findGuestByEmail) and books straight to it.
   ========================================================================= */

const ROOM_PHOTO_EMOJI = ['🛏️', '🏨', '🌇', '🛁', '🏙️', '🌿'];

function renderBookStayPage() {
  const roomTypeOptions = DataStore.state.roomTypes.map((roomType) => [roomType.id, roomType.name]);
  return `
    <div class="hero">
      <h1>Find your next stay</h1>
      <p>Real-time availability, instant confirmation, pay online or at the desk.</p>
    </div>
    <form id="bookStayForm" class="card grid" novalidate>
      ${buildFieldHtml({ key: 'checkIn', label: 'Check-in', inputType: 'date', required: true, min: todayIso() }, todayIso())}
      ${buildFieldHtml({ key: 'checkOut', label: 'Check-out', inputType: 'date', required: true, min: todayIso() }, addDaysIso(todayIso(), 1))}
      ${buildFieldHtml({ key: 'guests', label: 'Guests', inputType: 'number', required: true, min: 1, max: 10, integerOnly: true }, 2)}
      ${buildFieldHtml({ key: 'roomTypeId', label: 'Room Type (Optional)', inputType: 'select', options: roomTypeOptions, placeholder: 'Any room type' })}
      <div class="fld"><br><button class="btn pri">Search Rooms</button></div>
    </form>
    <p class="fe" id="bookStayError" role="alert"></p>
    <div id="bookStayResults" class="cols"></div>`;
}

function mountBookStayPage() {
  const formElement = qs('#bookStayForm');

  formElement.onsubmit = (event) => {
    event.preventDefault();
    const fieldsToValidate = [
      { key: 'checkIn', label: 'Check-in', required: true },
      { key: 'checkOut', label: 'Check-out', required: true, customValidator: (value, allValues) => value <= allValues.checkIn ? 'Check-out must be after check-in' : '' },
      { key: 'guests', label: 'Guests', inputType: 'number', required: true, min: 1, max: 10, integerOnly: true }
    ];
    if (!validateFields(fieldsToValidate, formElement)) return;

    const searchValues = getFormValues(formElement);
    const guestsCount = +searchValues.guests;
    let availableRooms = DataStore.findAvailableRooms(searchValues.checkIn, searchValues.checkOut, guestsCount);
    if (searchValues.roomTypeId) availableRooms = availableRooms.filter((room) => room.typeId == searchValues.roomTypeId);

    const resultsContainer = qs('#bookStayResults');
    resultsContainer.innerHTML = availableRooms.length
      ? availableRooms.map((room, index) => {
          const roomType = DataStore.getRoomTypeById(room.typeId);
          return `<div class="room-card">
            <div class="photo">${ROOM_PHOTO_EMOJI[index % ROOM_PHOTO_EMOJI.length]}</div>
            <div class="body">
              <h3>${escapeHtml(DataStore.getRoomTypeName(room.typeId))} · Room ${escapeHtml(room.number)}</h3>
              <p class="mu">${escapeHtml(roomType?.description || 'Comfortable stay with all essentials.')}</p>
              <div class="amenities"><span>Fits ${room.capacity} guests</span><span>Free Wi-Fi</span><span>Daily housekeeping</span></div>
              <div class="price">${formatMoney(room.price)} <small class="mu">/ night</small></div>
              <button class="btn pri" data-book="${room.id}">Book Now</button>
            </div>
          </div>`;
        }).join('')
      : renderEmptyState('No rooms are free for these dates. Try different dates, fewer guests, or another room type.');

    qsa('[data-book]', resultsContainer).forEach((button) => button.addEventListener('click', () => {
      startCustomerBooking({ roomId: +button.dataset.book, checkIn: searchValues.checkIn, checkOut: searchValues.checkOut, guestsCount });
    }));
  };
}

/** Makes sure the logged-in customer has a Guest profile (phone + ID are required for check-in later), then books. */
async function startCustomerBooking({ roomId, checkIn, checkOut, guestsCount }) {
  const account = Session.currentUser;
  const existingGuestProfile = DataStore.findGuestByEmail(account.email);
  if (existingGuestProfile) return createCustomerBooking(existingGuestProfile.id, { roomId, checkIn, checkOut, guestsCount });

  openFormModal({
    title: 'Complete Your Guest Profile',
    submitLabel: 'Continue to Book',
    initialValues: { name: account.name, email: account.email },
    fieldConfigs: [
      { key: 'name', label: 'Full Name', required: true, minLength: 2, maxLength: 60, pattern: /^[A-Za-z][A-Za-z .'-]*$/, helpText: "2-60 characters: letters, spaces, apostrophe or hyphen" },
      { key: 'phone', label: 'Phone Number', inputType: 'tel', required: true, minLength: 7, maxLength: 16, pattern: /^[0-9+ -]+$/, helpText: '7-16 characters: digits, spaces, + or -' },
      { key: 'email', label: 'Email', inputType: 'email', required: true, maxLength: 100, pattern: EMAIL_PATTERN },
      { key: 'idType', label: 'ID Type', inputType: 'select', required: true, placeholder: 'Select an ID type',
        options: [['Aadhaar', 'Aadhaar'], ['Passport', 'Passport'], ['Driving licence', 'Driving Licence'], ['Voter ID', 'Voter ID']] },
      { key: 'idNumber', label: 'ID Number', required: true, minLength: 4, maxLength: 24, pattern: /^[A-Za-z0-9 -]+$/, helpText: "4-24 characters: letters, digits, spaces or -. You'll show this at check-in." },
      { key: 'address', label: 'Address (Optional)', inputType: 'textarea', maxLength: 160, pattern: /^[A-Za-z0-9 .,#/()'-]*$/, helpText: "Up to 160 characters" }
    ],
    onSubmit: async (profileValues) => {
      const newGuestProfile = await api('/guests', 'POST', {
        name: profileValues.name, phone: profileValues.phone, email: profileValues.email,
        idType: profileValues.idType, idNumber: profileValues.idNumber, address: profileValues.address
      });
      closeModal();
      await createCustomerBooking(newGuestProfile.id, { roomId, checkIn, checkOut, guestsCount });
    }
  });
}

async function createCustomerBooking(guestId, { roomId, checkIn, checkOut, guestsCount }) {
  const room = DataStore.getRoomById(roomId);
  try {
    await api('/bookings', 'POST', {
      guestId, roomId, checkIn, checkOut, guests: guestsCount,
      status: 'Confirmed', rate: room.price, discount: 0, taxPct: 12, charges: []
    });
    showToast('Booking confirmed! See it under "My Bookings".');
    location.hash = '#/my-bookings';
  } catch (error) { showToast(error.message, 'error'); }
}
