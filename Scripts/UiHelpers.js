'use strict';
/* ============================================================================
   UiHelpers.js
   Small, reusable building blocks for rendering screens: element lookup,
   toasts, modal dialogs, confirmation dialogs, page headers, empty states,
   data tables and status badges. Every page in Scripts/Pages/ uses these
   instead of repeating the same markup.
   ========================================================================= */

function qs(selector, scope = document) { return scope.querySelector(selector); }
function qsa(selector, scope = document) { return [...scope.querySelectorAll(selector)]; }

/** Shows a small notification in the bottom-right corner. type is '' (success) or 'error'. */
function showToast(message, type = '') {
  const toastElement = document.createElement('div');
  toastElement.className = 'toast ' + (type === 'error' ? 'er' : '');
  toastElement.textContent = message;
  qs('#toastContainer').append(toastElement);
  setTimeout(() => toastElement.remove(), 3800);
}

/** Opens a modal dialog containing innerHtml and returns the modal element. wide=true for larger dialogs (e.g. invoices). */
function openModal(innerHtml, wide = false) {
  closeModal();
  const overlayElement = document.createElement('div');
  overlayElement.className = 'ov';
  overlayElement.innerHTML = `<div class="md ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${innerHtml}</div>`;
  overlayElement.addEventListener('mousedown', (event) => { if (event.target === overlayElement) closeModal(); });
  overlayElement.addEventListener('click', (event) => { if (event.target.closest('[data-x]')) closeModal(); });
  document.body.append(overlayElement);
  (overlayElement.querySelector('input,select,textarea') || overlayElement.querySelector('button'))?.focus();
  return overlayElement;
}

function closeModal() {
  qsa('.ov').forEach((overlay) => overlay.remove());
}

/** Shows a Yes/No confirmation dialog and resolves to true/false. */
function confirmDialog(message, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    const overlayElement = openModal(`
      <h2>${escapeHtml(confirmLabel)}?</h2>
      <p>${message}</p>
      <div class="row end">
        <button type="button" class="btn" id="confirmDialogCancel">Cancel</button>
        <button type="button" class="btn pri" id="confirmDialogConfirm">${escapeHtml(confirmLabel)}</button>
      </div>`);
    qs('#confirmDialogCancel', overlayElement).onclick = () => { closeModal(); resolve(false); };
    qs('#confirmDialogConfirm', overlayElement).onclick = () => { closeModal(); resolve(true); };
  });
}

function renderPageHeader(titleText, actionsHtml = '') {
  return `<div class="hd"><h1>${escapeHtml(titleText)}</h1><div class="acts">${actionsHtml}</div></div>`;
}

function renderEmptyState(messageHtml) {
  return `<div class="empty">${messageHtml}</div>`;
}

/**
 * Renders an HTML table.
 * columns: array of [headerLabel, (row) => cellHtml]
 * rows: array of data objects
 * emptyMessage: shown instead of the table when rows is empty
 */
function renderDataTable(columns, rows, emptyMessage, tableClass = '') {
  if (!rows.length) return renderEmptyState(emptyMessage);
  const headerHtml = columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('');
  const bodyHtml = rows.map((row) => `<tr>${columns.map(([label, cellRenderer]) => `<td data-l="${escapeHtml(label)}">${cellRenderer(row)}</td>`).join('')}</tr>`).join('');
  return `<div class="tw"><table class="${tableClass}"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

/** Maps a status word to one of the badge colour classes already defined in Styles/Site.css. */
const STATUS_BADGE_COLOR = {
  Available: 'ok', Occupied: 'in', Maintenance: 'er',
  Confirmed: 'in', 'Checked-in': 'ok', 'Checked-out': 'mu', Cancelled: 'er',
  Paid: 'ok', Partial: 'wa', Pending: 'er'
};

function statusBadgeHtml(statusText) {
  return `<span class="bd ${STATUS_BADGE_COLOR[statusText] || 'mu'}">${escapeHtml(statusText)}</span>`;
}
