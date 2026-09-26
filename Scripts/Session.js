'use strict';
/* ============================================================================
   Session.js
   Everything to do with "who is logged in" and "what are they allowed to do".

   Role-based access control (RBAC):
   - ROLES lists the roles that exist in the system.
   - ROLE_PERMISSIONS lists the small number of actions that are restricted to
     specific roles. Anything NOT listed here is allowed for every logged-in
     user - this keeps the list short and easy to audit.
   - currentUserCan(permissionKey) is the single function every page calls
     before showing a button or a page. To add a new restricted action:
       1. Add a key to ROLE_PERMISSIONS with the roles allowed to do it.
       2. Call currentUserCan('YourNewKey') wherever that action is offered.
   Note: this enforces access control in the UI. A production system should
   also check the user's role in the API/stored-procedure layer.
   ========================================================================= */

const ROLES = {
  ADMIN: 'Admin',
  RECEPTIONIST: 'Receptionist',
  CUSTOMER: 'Customer'
};

/** Admin and Receptionist run the front desk; Customer is a self-service guest account. */
function isStaffRole(role) { return role === ROLES.ADMIN || role === ROLES.RECEPTIONIST; }

const ROLE_PERMISSIONS = {
  VIEW_REPORTS: [ROLES.ADMIN],          // Reports page
  MANAGE_ROOM_TYPES: [ROLES.ADMIN],     // add / edit / delete a room type
  MANAGE_ROOMS: [ROLES.ADMIN],          // add / edit / delete a room
  DELETE_GUEST: [ROLES.ADMIN]           // delete a guest record
};

const SESSION_STORAGE_KEY = 'hotelLmsSession';

const Session = {
  currentUser: null,

  /** Reads the logged-in user (if any) back from this browser tab's session storage. */
  restore() {
    try { this.currentUser = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)); }
    catch { this.currentUser = null; }
    return this.currentUser;
  },

  save(user) {
    this.currentUser = user;
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  },

  clear() {
    this.currentUser = null;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  },

  isLoggedIn() { return !!this.currentUser; }
};

/** True if the logged-in user is allowed to do the thing identified by permissionKey. */
function currentUserCan(permissionKey) {
  const allowedRoles = ROLE_PERMISSIONS[permissionKey];
  if (!allowedRoles) return Session.isLoggedIn();               // no restriction defined -> any logged-in user
  return Session.isLoggedIn() && allowedRoles.includes(Session.currentUser.role);
}
