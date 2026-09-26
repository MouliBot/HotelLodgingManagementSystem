'use strict';
/* ============================================================================
   App.js
   Entry point. Wires up the login/register screen, the theme switch, the
   logout button, the mobile menu, and starts the router once someone is
   signed in. This is the only file that runs automatically on page load.
   ========================================================================= */

const BRAND_NAME = 'InnSync';

document.addEventListener('DOMContentLoaded', () => {
  wireThemeToggle();
  wireLogoutButton();
  wireMobileMenuToggle();
  window.addEventListener('hashchange', handleRouteChange);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  boot();
});

/** Shows the login screen or the app shell, depending on whether a session already exists. */
function boot() {
  const loggedInUser = Session.restore();
  qs('#authScreen').hidden = !!loggedInUser;
  qs('#appShell').hidden = !loggedInUser;

  if (!loggedInUser) return renderAuthScreen('login');

  qs('#currentUserName').textContent = loggedInUser.name;
  qs('#currentUserRole').textContent = loggedInUser.role;
  if (!location.hash) location.hash = '#/' + defaultRouteForCurrentUser();
  handleRouteChange();
}

/**
 * Renders the split-panel sign-in / create-account screen.
 * One login form works for every role (Admin, Receptionist, Customer) - the
 * server tells us the role, and the router sends each role to its own home
 * page (see defaultRouteForCurrentUser in Router.js). Only "Customer" can be
 * created here; Admin/Receptionist accounts are provisioned by the hotel.
 */
function renderAuthScreen(mode, message = '') {
  const isRegisterMode = mode === 'register';

  const fieldConfigs = [
    ...(isRegisterMode ? [{ key: 'name', label: 'Full Name', required: true, minLength: 2, maxLength: 60, pattern: /^[A-Za-z][A-Za-z .'-]*$/, helpText: "2-60 characters: letters, spaces, apostrophe or hyphen", autocomplete: 'name' }] : []),
    { key: 'email', label: 'Email', inputType: 'email', required: true, maxLength: 100, pattern: EMAIL_PATTERN, helpText: 'A valid email address', autocomplete: 'email' },
    { key: 'password', label: 'Password', inputType: 'password', required: true, minLength: 8, maxLength: 64,
      pattern: isRegisterMode ? /^(?=.*[A-Z])(?=.*\d).{8,64}$/ : undefined,
      helpText: isRegisterMode ? '8-64 characters, including an uppercase letter and a number' : undefined,
      autocomplete: isRegisterMode ? 'new-password' : 'current-password' },
    ...(isRegisterMode ? [{ key: 'confirmPassword', label: 'Confirm Password', inputType: 'password', required: true,
      customValidator: (value, allValues) => value !== allValues.password ? 'Passwords do not match' : '' }] : [])
  ];

  qs('#authScreen').innerHTML = `
    <div class="auth-showcase">
      <div>
        <div class="mark">🏨 ${BRAND_NAME}</div>
        <h1>Book your stay, anywhere, anytime.</h1>
        <p class="lead">One account for guests and hotel staff - search live availability, confirm instantly, and manage every booking in one place.</p>
        <div class="auth-perks">
          <div><span class="ic">⚡</span><div><b>Instant confirmation</b><small>No waiting, no phone calls - book in a minute.</small></div></div>
          <div><span class="ic">🔐</span><div><b>Your bookings, always on hand</b><small>View invoices, pay, or cancel from any device.</small></div></div>
          <div><span class="ic">🛎️</span><div><b>Run by real front-desk tools</b><small>The same system our receptionists use to check you in.</small></div></div>
        </div>
      </div>
      <p class="staff-note">Front-desk team? Sign in with your staff email above - you'll land on the operations dashboard automatically.</p>
    </div>
    <div class="auth-form-panel">
      <div class="ac">
        <span class="brand">${BRAND_NAME}</span>
        <p class="sub mu">${isRegisterMode ? 'Create your free account' : 'Welcome back'}</p>
        <div class="auth-tabs" role="tablist">
          <button type="button" role="tab" class="${!isRegisterMode ? 'on' : ''}" id="tabSignIn">Sign In</button>
          <button type="button" role="tab" class="${isRegisterMode ? 'on' : ''}" id="tabRegister">Create Account</button>
        </div>
        ${message ? `<p class="fe">${escapeHtml(message)}</p>` : ''}
        <form id="authForm" novalidate>
          ${fieldConfigs.map((field) => buildFieldHtml(field)).join('')}
          <p class="fe" id="authFormError" role="alert"></p>
          <button class="btn pri" style="width:100%">${isRegisterMode ? 'Create Account' : 'Sign In'}</button>
        </form>
        <p class="note">Demo accounts — Admin: admin@innsync.com / Admin@123 &nbsp;·&nbsp; Receptionist: reception@innsync.com / Recep@123</p>
      </div>
    </div>`;

  qs('#tabSignIn').addEventListener('click', () => { if (isRegisterMode) renderAuthScreen('login'); });
  qs('#tabRegister').addEventListener('click', () => { if (!isRegisterMode) renderAuthScreen('register'); });

  const formElement = qs('#authForm');
  formElement.onsubmit = async (event) => {
    event.preventDefault();
    if (!validateFields(fieldConfigs, formElement)) return;

    const formValues = getFormValues(formElement);
    const submitButton = qs('.pri', formElement);
    submitButton.disabled = true;
    try {
      const [user] = await Api.call(isRegisterMode ? 'Register' : 'Login', { name: formValues.name, email: formValues.email.toLowerCase(), password: formValues.password });
      if (!user || !user.name) throw new Error('Signed in, but the server did not return the account details.');
      Session.save(user);
      showToast(`Welcome, ${user.name}`);
      location.hash = '';
      boot();
    } catch (error) {
      qs('#authFormError').textContent = error.message;
      submitButton.disabled = false;
    }
  };
}

function wireThemeToggle() {
  const themeSelectElement = qs('#themeSelect');
  const darkModeMediaQuery = matchMedia('(prefers-color-scheme: dark)');

  function applyStoredTheme() {
    const storedPreference = localStorage.getItem('hotelLmsTheme') || 'system';
    document.documentElement.dataset.t = storedPreference === 'system' ? (darkModeMediaQuery.matches ? 'dark' : 'light') : storedPreference;
    themeSelectElement.value = storedPreference;
  }

  themeSelectElement.addEventListener('change', (event) => { localStorage.setItem('hotelLmsTheme', event.target.value); applyStoredTheme(); });
  darkModeMediaQuery.addEventListener('change', applyStoredTheme);
  applyStoredTheme();
}

function wireLogoutButton() {
  qs('#logoutButton').addEventListener('click', () => { Session.clear(); location.hash = ''; boot(); });
}

function wireMobileMenuToggle() {
  qs('#mobileMenuButton').addEventListener('click', () => { qs('#sideNav').classList.toggle('open'); qs('#navScrim').classList.toggle('open'); });
  qs('#navScrim').addEventListener('click', () => { qs('#sideNav').classList.remove('open'); qs('#navScrim').classList.remove('open'); });
}
