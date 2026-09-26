'use strict';
/* ============================================================================
   MasterDataModules.js
   One generic list+form screen, reused for Room Types, Rooms and Guests.
   To add a brand new master-data screen: add one entry to MASTER_DATA_MODULES
   and one route in Router.js - the list, search box, add/edit form and
   validation are all generated from that entry.

   Each module entry defines:
     title, singularLabel, storeKey, apiPath, searchPlaceholder, emptyMessage
     columns        [ [headerLabel, (item) => cellHtml], ... ]
     fields         field configs, see Validation.js
     permissions    { add, edit, delete } - a ROLE_PERMISSIONS key, or null to
                    allow every logged-in role
     buildPayload(values) -> object sent to the server (converts text to numbers, etc.)
     canDelete(item) -> null if deletion is allowed, or a message explaining why not
   ========================================================================= */

const MASTER_DATA_MODULES = {

  roomTypes: {
    title: 'Room Types', singularLabel: 'Room Type', storeKey: 'roomTypes', apiPath: '/room-types',
    searchPlaceholder: 'Search room types', emptyMessage: 'No room types yet. Add one to start creating rooms.',
    permissions: { add: 'MANAGE_ROOM_TYPES', edit: 'MANAGE_ROOM_TYPES', delete: 'MANAGE_ROOM_TYPES' },
    columns: [
      ['Type', (item) => `<b>${escapeHtml(item.name)}</b>`],
      ['Base Price', (item) => formatMoney(item.price)],
      ['Capacity', (item) => item.capacity],
      ['Rooms of This Type', (item) => DataStore.state.rooms.filter((room) => room.typeId == item.id).length],
      ['Description', (item) => escapeHtml(item.description || '—')]
    ],
    fields: [
      { key: 'name', label: 'Type Name', required: true, minLength: 2, maxLength: 40, pattern: /^[A-Za-z0-9 &-]+$/,
        helpText: '2-40 characters: letters, digits, spaces, & or -',
        customValidator: (value, _all, editingId) => DataStore.state.roomTypes.some((rt) => rt.name.toLowerCase() === value.toLowerCase() && rt.id != editingId) ? 'This room type already exists' : '' },
      { key: 'price', label: 'Base Price (₹)', inputType: 'number', required: true, min: 1, max: 1000000, step: '0.01', helpText: 'Between ₹1 and ₹10,00,000' },
      { key: 'capacity', label: 'Capacity (Guests)', inputType: 'number', required: true, min: 1, max: 10, integerOnly: true, helpText: 'Whole number from 1 to 10' },
      { key: 'description', label: 'Description (Optional)', inputType: 'textarea', maxLength: 120, pattern: /^[A-Za-z0-9 .,()&/'-]*$/, helpText: "Up to 120 characters: letters, digits, spaces or . , ( ) & / ' -" }
    ],
    buildPayload: (values) => ({ name: values.name, price: +values.price, capacity: +values.capacity, description: values.description }),
    canDelete: (item) => DataStore.state.rooms.some((room) => room.typeId == item.id) ? 'Rooms still use this type. Reassign or delete them first.' : null
  },

  rooms: {
    title: 'Rooms', singularLabel: 'Room', storeKey: 'rooms', apiPath: '/rooms',
    searchPlaceholder: 'Search rooms', emptyMessage: 'No rooms yet. Add one to start taking bookings.',
    permissions: { add: 'MANAGE_ROOMS', edit: 'MANAGE_ROOMS', delete: 'MANAGE_ROOMS' },
    columns: [
      ['Room', (item) => `<b>${escapeHtml(item.number)}</b>`],
      ['Type', (item) => escapeHtml(DataStore.getRoomTypeName(item.typeId))],
      ['Capacity', (item) => item.capacity],
      ['Price / Night', (item) => formatMoney(item.price)],
      ['Status', (item) => statusBadgeHtml(item.status)]
    ],
    fields: [
      { key: 'number', label: 'Room Number', required: true, maxLength: 10, pattern: /^[A-Za-z0-9-]+$/,
        helpText: 'Up to 10 characters: letters, digits or -',
        customValidator: (value, _all, editingId) => DataStore.state.rooms.some((room) => room.number.toLowerCase() === value.toLowerCase() && room.id != editingId) ? 'This room number already exists' : '' },
      { key: 'typeId', label: 'Room Type', inputType: 'select', required: true, placeholder: 'Select a room type',
        options: () => DataStore.state.roomTypes.map((roomType) => [roomType.id, roomType.name]),
        onChangeSideEffect: (formElement, selectedTypeId) => {
          if (formElement.dataset.editing) return;     // only auto-fill when adding a new room
          const roomType = DataStore.getRoomTypeById(selectedTypeId);
          if (roomType) { formElement.elements.price.value = roomType.price; formElement.elements.capacity.value = roomType.capacity; }
        } },
      { key: 'price', label: 'Price per Night (₹)', inputType: 'number', required: true, min: 1, max: 1000000, step: '0.01', helpText: 'Between ₹1 and ₹10,00,000' },
      { key: 'capacity', label: 'Capacity (Guests)', inputType: 'number', required: true, min: 1, max: 10, integerOnly: true, helpText: 'Whole number from 1 to 10' },
      { key: 'status', label: 'Status', inputType: 'select', required: true,
        options: [['Available', 'Available'], ['Occupied', 'Occupied'], ['Maintenance', 'Maintenance']],
        helpText: 'Occupied is normally set automatically by check-in / check-out.' }
    ],
    buildPayload: (values) => ({ number: values.number, typeId: +values.typeId, price: +values.price, capacity: +values.capacity, status: values.status || 'Available' }),
    canDelete: (item) => DataStore.state.bookings.some((booking) => booking.roomId == item.id) ? 'This room has bookings. Set it to Maintenance instead of deleting it.' : null
  },

  guests: {
    title: 'Guests', singularLabel: 'Guest', storeKey: 'guests', apiPath: '/guests',
    searchPlaceholder: 'Search name, phone, email or ID', emptyMessage: 'No guests found. Add a guest to start a booking.',
    permissions: { add: null, edit: null, delete: 'DELETE_GUEST' },
    columns: [
      ['Guest', (item) => `<b>${escapeHtml(item.name)}</b>`],
      ['Phone', (item) => escapeHtml(item.phone)],
      ['Email', (item) => escapeHtml(item.email || '—')],
      ['ID', (item) => escapeHtml(`${item.idType} ${item.idNumber}`)],
      ['Stays', (item) => DataStore.state.bookings.filter((booking) => booking.guestId == item.id && booking.status !== 'Cancelled').length]
    ],
    fields: [
      { key: 'name', label: 'Full Name', required: true, minLength: 2, maxLength: 60, pattern: /^[A-Za-z][A-Za-z .'-]*$/,
        helpText: "2-60 characters: letters, spaces, apostrophe or hyphen", autocomplete: 'name' },
      { key: 'phone', label: 'Phone Number', inputType: 'tel', required: true, minLength: 7, maxLength: 16, pattern: /^[0-9+ -]+$/,
        helpText: '7-16 characters: digits, spaces, + or -',
        customValidator: (value, _all, editingId) => DataStore.state.guests.some((guest) => guest.phone.replace(/\D/g, '') === value.replace(/\D/g, '') && guest.id != editingId) ? 'A guest with this phone number already exists' : '' },
      { key: 'email', label: 'Email (Optional)', inputType: 'email', maxLength: 100, pattern: EMAIL_PATTERN, helpText: 'A valid email address, up to 100 characters' },
      { key: 'idType', label: 'ID Type', inputType: 'select', required: true, placeholder: 'Select an ID type',
        options: [['Aadhaar', 'Aadhaar'], ['Passport', 'Passport'], ['Driving licence', 'Driving Licence'], ['Voter ID', 'Voter ID']] },
      { key: 'idNumber', label: 'ID Number', required: true, minLength: 4, maxLength: 24, pattern: /^[A-Za-z0-9 -]+$/, helpText: '4-24 characters: letters, digits, spaces or -' },
      { key: 'address', label: 'Address (Optional)', inputType: 'textarea', maxLength: 160, pattern: /^[A-Za-z0-9 .,#/()'-]*$/, helpText: "Up to 160 characters: letters, digits, spaces or . , # / ( ) ' -" }
    ],
    buildPayload: (values) => ({ name: values.name, phone: values.phone, email: values.email, idType: values.idType, idNumber: values.idNumber, address: values.address }),
    canDelete: (item) => DataStore.state.bookings.some((booking) => booking.guestId == item.id && ACTIVE_BOOKING_STATUSES.includes(booking.status)) ? 'This guest has an active booking. Cancel or complete it first.' : null
  }
};

function renderMasterDataListPage(moduleKey) {
  const moduleDefinition = MASTER_DATA_MODULES[moduleKey];
  const canAddItems = !moduleDefinition.permissions.add || currentUserCan(moduleDefinition.permissions.add);
  const addButtonHtml = canAddItems ? `<button class="btn pri" id="addItemButton">+ Add ${escapeHtml(moduleDefinition.singularLabel)}</button>` : '';

  return renderPageHeader(moduleDefinition.title, addButtonHtml) +
    `<div class="bar"><input type="search" id="searchInput" placeholder="${escapeHtml(moduleDefinition.searchPlaceholder)}" aria-label="Search"></div>` +
    `<div class="tw"><table><thead><tr>${moduleDefinition.columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th></th></tr></thead><tbody id="dataRows"></tbody></table></div>`;
}

function mountMasterDataListPage(moduleKey) {
  const moduleDefinition = MASTER_DATA_MODULES[moduleKey];
  const items = DataStore.state[moduleDefinition.storeKey];
  const canEditItems = !moduleDefinition.permissions.edit || currentUserCan(moduleDefinition.permissions.edit);
  const canDeleteItems = !moduleDefinition.permissions.delete || currentUserCan(moduleDefinition.permissions.delete);

  function renderRows(searchText) {
    const matchingItems = items.filter((item) => !searchText || JSON.stringify(item).toLowerCase().includes(searchText.toLowerCase()));
    qs('#dataRows').innerHTML = matchingItems.length
      ? matchingItems.map((item) => `<tr>
          ${moduleDefinition.columns.map(([label, cellRenderer]) => `<td data-l="${escapeHtml(label)}">${cellRenderer(item)}</td>`).join('')}
          <td class="row end">
            ${canEditItems ? `<button class="btn sm" data-edit="${item.id}">Edit</button>` : ''}
            ${canDeleteItems ? `<button class="btn sm dng" data-delete="${item.id}">Delete</button>` : ''}
          </td>
        </tr>`).join('')
      : `<tr><td colspan="${moduleDefinition.columns.length + 1}">${renderEmptyState(moduleDefinition.emptyMessage)}</td></tr>`;
  }

  renderRows('');
  qs('#searchInput').addEventListener('input', (event) => renderRows(event.target.value));
  qs('#addItemButton')?.addEventListener('click', () => openMasterDataFormModal(moduleKey));
  qs('#dataRows').addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit]');
    const deleteButton = event.target.closest('[data-delete]');
    if (editButton) openMasterDataFormModal(moduleKey, items.find((item) => item.id == editButton.dataset.edit));
    if (deleteButton) await deleteMasterDataItem(moduleKey, deleteButton.dataset.delete);
  });
}

function openMasterDataFormModal(moduleKey, existingItem) {
  const moduleDefinition = MASTER_DATA_MODULES[moduleKey];
  openFormModal({
    title: existingItem ? `Edit ${moduleDefinition.singularLabel}` : `Add ${moduleDefinition.singularLabel}`,
    fieldConfigs: moduleDefinition.fields,
    initialValues: existingItem || { status: 'Available' },
    editingItemId: existingItem?.id,
    onSubmit: async (formValues) => {
      const payload = moduleDefinition.buildPayload(formValues);
      await api(existingItem ? `${moduleDefinition.apiPath}/${existingItem.id}` : moduleDefinition.apiPath, existingItem ? 'PUT' : 'POST', payload);
      closeModal();
      showToast(existingItem ? `${moduleDefinition.singularLabel} updated` : `${moduleDefinition.singularLabel} added`);
      await refreshCurrentPage();
    }
  });
}

async function deleteMasterDataItem(moduleKey, itemId) {
  const moduleDefinition = MASTER_DATA_MODULES[moduleKey];
  const item = DataStore.state[moduleDefinition.storeKey].find((candidate) => candidate.id == itemId);
  const blockReason = moduleDefinition.canDelete?.(item);
  if (blockReason) return showToast(blockReason, 'error');

  const confirmed = await confirmDialog(`Delete this ${moduleDefinition.singularLabel.toLowerCase()}? This cannot be undone.`, 'Delete');
  if (!confirmed) return;
  try {
    await api(`${moduleDefinition.apiPath}/${itemId}`, 'DELETE');
    showToast(`${moduleDefinition.singularLabel} deleted`);
    await refreshCurrentPage();
  } catch (error) { showToast(error.message, 'error'); }
}
