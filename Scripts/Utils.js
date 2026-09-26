'use strict';
/* ============================================================================
   Utils.js
   Small, pure helper functions used everywhere else in the app.
   Nothing in this file talks to the DOM, the server, or the session.
   ========================================================================= */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Today's date as "YYYY-MM-DD", in the browser's local timezone. */
function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Adds (or subtracts) whole days to an ISO date string. */
function addDaysIso(dateIso, days) {
  return new Date(new Date(dateIso).getTime() + days * 86400000).toISOString().slice(0, 10);
}

/** Whole number of days between two ISO date strings. */
function daysBetween(startIso, endIso) {
  return Math.round((new Date(endIso) - new Date(startIso)) / 86400000);
}

/** Rounds to 2 decimal places (avoids floating-point rounding artifacts). */
function round2(value) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value) {
  return '₹' + (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDate(dateIso) {
  return dateIso ? new Date(dateIso + 'T00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function formatBookingNumber(bookingId) {
  return 'BK' + String(bookingId).padStart(4, '0');
}

/** Escapes text before it is inserted into innerHTML, to prevent HTML/script injection. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
