'use strict';
/* ============================================================================
   DataStore.js
   Holds the data currently loaded from the server and the business
   calculations that several pages need (room/guest lookups, which rooms are
   free for a date range, and how a booking's invoice is worked out).
   Nothing in this file touches the DOM.
   ========================================================================= */

const ACTIVE_BOOKING_STATUSES = ['Confirmed', 'Checked-in'];

const DataStore = {
  state: { roomTypes: [], rooms: [], guests: [], bookings: [], payments: [] },

  /** Loads every table the app needs in one go. Called before every page render. */
  async loadAll() {
    const [roomTypes, rooms, guests, bookings, payments] = await Promise.all([
      api('/room-types'), api('/rooms'), api('/guests'), api('/bookings'), api('/payments')
    ]);
    Object.assign(this.state, { roomTypes, rooms, guests, bookings, payments });
  },

  getRoomTypeById(id) { return this.state.roomTypes.find((roomType) => roomType.id == id); },
  getRoomById(id) { return this.state.rooms.find((room) => room.id == id); },
  getGuestById(id) { return this.state.guests.find((guest) => guest.id == id); },

  /** Links a logged-in Customer account to their Guest record by matching email (case-insensitive). */
  findGuestByEmail(email) {
    const normalizedEmail = (email || '').toLowerCase();
    return this.state.guests.find((guest) => (guest.email || '').toLowerCase() === normalizedEmail);
  },
  getBookingById(id) { return this.state.bookings.find((booking) => booking.id == id); },

  getRoomTypeName(id) { return this.getRoomTypeById(id)?.name || '—'; },
  getRoomNumber(id) { return this.getRoomById(id)?.number || '?'; },
  getGuestName(id) { return this.getGuestById(id)?.name || '(deleted guest)'; },

  /** True if roomId has no other active (Confirmed/Checked-in) booking that overlaps this date range. */
  isRoomFreeForDates(roomId, checkInDate, checkOutDate, excludeBookingId) {
    return !this.state.bookings.some((booking) =>
      booking.roomId == roomId &&
      booking.id != excludeBookingId &&
      ACTIVE_BOOKING_STATUSES.includes(booking.status) &&
      booking.checkIn < checkOutDate && checkInDate < booking.checkOut
    );
  },

  /** Rooms that are not under maintenance, fit guestCount, and are free for the given dates. */
  findAvailableRooms(checkInDate, checkOutDate, guestCount, excludeBookingId) {
    if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) return [];
    return this.state.rooms.filter((room) =>
      room.status !== 'Maintenance' &&
      room.capacity >= guestCount &&
      this.isRoomFreeForDates(room.id, checkInDate, checkOutDate, excludeBookingId)
    );
  },

  /** Works out the full bill for a booking: room charge, extra charges, discount, tax, amount paid, balance due. */
  computeInvoice(booking) {
    const effectiveCheckOutDate = booking.actualOut || (booking.status === 'Checked-in' && todayIso() > booking.checkOut ? todayIso() : booking.checkOut);
    const nightsCount = Math.max(1, daysBetween(booking.checkIn, effectiveCheckOutDate));
    const roomCharge = nightsCount * booking.rate;
    const extraChargesTotal = (booking.charges || []).reduce((sum, charge) => sum + charge.amount, 0);
    const discount = booking.discount || 0;
    const taxPercent = booking.taxPct == null ? 12 : booking.taxPct;
    const subtotal = Math.max(0, roomCharge + extraChargesTotal - discount);
    const taxAmount = round2(subtotal * taxPercent / 100);
    const grandTotal = round2(subtotal + taxAmount);
    const paidAmount = this.state.payments.filter((payment) => payment.bookingId == booking.id).reduce((sum, payment) => sum + payment.amount, 0);
    return { nightsCount, roomCharge, extraChargesTotal, discount, taxPercent, taxAmount, grandTotal, paidAmount, balanceDue: round2(grandTotal - paidAmount) };
  },

  getPaymentStatus(booking) {
    const invoice = this.computeInvoice(booking);
    if (invoice.balanceDue <= 0) return 'Paid';
    return invoice.paidAmount > 0 ? 'Partial' : 'Pending';
  }
};
