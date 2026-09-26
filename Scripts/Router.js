'use strict';
/* ============================================================================
   Router.js
   Hash-based navigation (#/dashboard, #/book-stay, ...).

   Every page has an "audience": 'staff' (Admin/Receptionist back-office) or
   'customer' (self-service guest area). A logged-in user only ever sees and
   can open pages that match their audience - Router enforces this on every
   navigation, not just in the sidebar.

   To add a new page: add one entry to PAGE_RENDERERS (render + afterRender +
   audience) and one entry to NAV_ITEMS. Add a "permission" key (matching
   ROLE_PERMISSIONS in Session.js) only if it should be further restricted to
   a single role, e.g. Reports being Admin-only within the staff audience.
   ========================================================================= */

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', audience: 'staff' },
  { key: 'rooms', label: 'Rooms', audience: 'staff' },
  { key: 'room-types', label: 'Room Types', audience: 'staff' },
  { key: 'guests', label: 'Guests', audience: 'staff' },
  { key: 'bookings', label: 'Bookings', audience: 'staff' },
  { key: 'availability', label: 'Availability', audience: 'staff' },
  { key: 'check-in', label: 'Check-in', audience: 'staff' },
  { key: 'check-out', label: 'Check-out', audience: 'staff' },
  { key: 'payments', label: 'Payment / Invoice', audience: 'staff' },
  { key: 'reports', label: 'Reports', audience: 'staff', permission: 'VIEW_REPORTS' },
  { key: 'book-stay', label: 'Book a Stay', audience: 'customer' },
  { key: 'my-bookings', label: 'My Bookings', audience: 'customer' }
];

const PAGE_RENDERERS = {
  'dashboard': { render: renderDashboardPage, afterRender: mountDashboardPage, audience: 'staff' },
  'rooms': { render: () => renderMasterDataListPage('rooms'), afterRender: () => mountMasterDataListPage('rooms'), audience: 'staff' },
  'room-types': { render: () => renderMasterDataListPage('roomTypes'), afterRender: () => mountMasterDataListPage('roomTypes'), audience: 'staff' },
  'guests': { render: () => renderMasterDataListPage('guests'), afterRender: () => mountMasterDataListPage('guests'), audience: 'staff' },
  'bookings': { render: renderBookingsPage, afterRender: mountBookingsPage, audience: 'staff' },
  'availability': { render: renderAvailabilityPage, afterRender: mountAvailabilityPage, audience: 'staff' },
  'check-in': { render: renderCheckInPage, afterRender: mountCheckInPage, audience: 'staff' },
  'check-out': { render: renderCheckOutPage, afterRender: mountCheckOutPage, audience: 'staff' },
  'payments': { render: renderPaymentsPage, afterRender: mountPaymentsPage, audience: 'staff' },
  'reports': { render: renderReportsPage, afterRender: mountReportsPage, audience: 'staff', permission: 'VIEW_REPORTS' },
  'book-stay': { render: renderBookStayPage, afterRender: mountBookStayPage, audience: 'customer' },
  'my-bookings': { render: renderMyBookingsPage, afterRender: mountMyBookingsPage, audience: 'customer' }
};

/* The four-step process shortcut bar shown at the top of staff pages only. */
const PROCESS_STEPS = [['Availability', 'availability'], ['Check-in', 'check-in'], ['Check-out', 'check-out'], ['Payment / Invoice', 'payments']];

let currentRouteKey = 'dashboard';

function currentAudience() { return isStaffRole(Session.currentUser?.role) ? 'staff' : 'customer'; }
function defaultRouteForCurrentUser() { return currentAudience() === 'staff' ? 'dashboard' : 'book-stay'; }

function isRouteAllowed(routeKey) {
  const page = PAGE_RENDERERS[routeKey];
  if (!page) return false;
  if (page.audience !== currentAudience()) return false;
  if (page.permission && !currentUserCan(page.permission)) return false;
  return true;
}

async function handleRouteChange() {
  if (!Session.isLoggedIn()) return;

  const requestedRouteKey = (location.hash.slice(2) || defaultRouteForCurrentUser()).split('?')[0];
  if (PAGE_RENDERERS[requestedRouteKey] && !isRouteAllowed(requestedRouteKey)) {
    showToast("You don't have permission to view that page", 'error');
  }
  currentRouteKey = isRouteAllowed(requestedRouteKey) ? requestedRouteKey : defaultRouteForCurrentUser();

  renderNavigation();
  renderProcessBar();
  document.body.classList.remove('menu-open');
  await renderCurrentPage();
}

async function renderCurrentPage() {
  const mainElement = qs('#mainContent');
  mainElement.innerHTML = renderEmptyState('Loading…');
  closeModal();
  try {
    await DataStore.loadAll();
    const page = PAGE_RENDERERS[currentRouteKey];
    mainElement.innerHTML = await page.render();
    page.afterRender?.();
  } catch (error) {
    mainElement.innerHTML = renderEmptyState(`${escapeHtml(error.message)}<br><br><button class="btn" id="retryButton">Retry</button>`);
    qs('#retryButton')?.addEventListener('click', renderCurrentPage);
  }
}

/** Re-runs the current page (used after any add/edit/delete/save action). */
async function refreshCurrentPage() { await renderCurrentPage(); }

function renderNavigation() {
  qs('#navLinks').innerHTML = NAV_ITEMS
    .filter((item) => item.audience === currentAudience() && (!item.permission || currentUserCan(item.permission)))
    .map((item) => `<a href="#/${item.key}" class="${item.key === currentRouteKey ? 'on' : ''}">${escapeHtml(item.label)}</a>`)
    .join('');
}

function renderProcessBar() {
  const processBarElement = qs('#processSteps').closest('.proc');
  processBarElement.hidden = currentAudience() !== 'staff';
  if (processBarElement.hidden) return;
  qs('#processSteps').innerHTML = PROCESS_STEPS
    .map(([label, routeKey], index) => `<a href="#/${routeKey}" class="${routeKey === currentRouteKey ? 'on' : ''}">${index + 1}. ${escapeHtml(label)}</a>`)
    .join('');
}
