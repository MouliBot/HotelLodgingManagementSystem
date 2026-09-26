'use strict';
/* ============================================================================
   Config.js
   - Config: the only three values you change when pointing the app at a
     different server or database connection.
   - Api.call(): low-level call to the .NET service. It unwraps the service's
     response envelope (and the stored procedure's own envelope inside it) and
     always resolves to a plain array of rows in camelCase, or throws a normal
     Error carrying the backend's own message.
   - api(): a small REST-style adapter used by the rest of the app, e.g.
       api('/rooms')                 -> calls process "RoomList"
       api('/rooms', 'POST', body)   -> calls process "RoomSave"   (insert)
       api('/rooms/12', 'PUT', body) -> calls process "RoomSave"   (update)
       api('/rooms/12', 'DELETE')    -> calls process "RoomDelete"
     Adding a brand new master/detail screen only means adding one line to
     ENTITY_ROUTES below - nothing else in this file needs to change.
   ========================================================================= */

const Config = {
  ApiUrl: 'http://localhost:8085/HotelLMSService/api/v1/process',
  ActionHeader: 'HotelLMS',       // sent as the "Action" header on every call
  NexumHeader: 'H001-101E4EC3'    // sent as the "Nexum" header (DB connection key)
};

const Api = {
  lastMessage: '',

  /** Calls one named process on the service and returns its data as an array of rows. */
  async call(processName, requestData = {}) {
    let response;
    try {
      response = await fetch(Config.ApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Action: Config.ActionHeader, Process: processName, Nexum: Config.NexumHeader },
        body: JSON.stringify(requestData)
      });
    } catch {
      throw new Error('Cannot reach the server. Check your connection and the API URL.');
    }

    const rawText = await response.text();
    let envelope = Api._toLowerCaseKeys(Api._unwrapResultColumn(Api._safeParse(rawText)));

    // The service wraps the stored procedure's own { code, status, data } envelope
    // inside its own { code, status, data } envelope. Drill into the inner one.
    for (let depth = 0; depth < 3; depth++) {
      const innerData = typeof envelope.data === 'string' ? Api._safeParse(envelope.data) : envelope.data;
      const innerLooksLikeEnvelope = innerData && typeof innerData === 'object' && !Array.isArray(innerData)
        && Object.keys(innerData).some((key) => key.toLowerCase() === 'code');
      if (!innerLooksLikeEnvelope) break;
      envelope = Api._toLowerCaseKeys(innerData);
    }

    if (response.ok && Number(envelope.code) === 200) {
      this.lastMessage = envelope.status;
      const rows = typeof envelope.data === 'string' ? Api._safeParse(envelope.data) : envelope.data;
      return Api._toCamelCase(rows == null ? [] : Array.isArray(rows) ? rows : [rows]);
    }

    const backendMessage = [envelope.status, envelope.message, envelope.error, envelope.title, envelope.detail, envelope.description]
      .find((value) => typeof value === 'string' && value.trim());
    throw new Error(backendMessage || (response.ok ? 'Unexpected response from the server.' : `Server error (${response.status}).`));
  },

  _safeParse(text) { try { return JSON.parse(text); } catch { return null; } },

  /** Unwraps SQL's `FOR JSON PATH` result column shape: [{ Result: "{...}" }] or { Result: "..." }. */
  _unwrapResultColumn(value) {
    for (let depth = 0; depth < 3 && value; depth++) {
      if (Array.isArray(value)) value = value[0];
      else if (value.Result !== undefined || value.result !== undefined) value = value.Result ?? value.result;
      else if (typeof value === 'string') value = Api._safeParse(value);
      else break;
    }
    return value;
  },

  _toLowerCaseKeys(sourceObject) {
    const result = {};
    if (sourceObject && typeof sourceObject === 'object') {
      Object.entries(sourceObject).forEach(([key, value]) => { result[key.toLowerCase()] = value; });
    }
    return result;
  },

  /** SQL returns PascalCase column names; the rest of the app reads camelCase properties. */
  _toCamelCase(value) {
    if (Array.isArray(value)) return value.map(Api._toCamelCase);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key.charAt(0).toLowerCase() + key.slice(1), Api._toCamelCase(nested)]));
    }
    return value;
  }
};

/* Maps a REST-style collection name to its process-name prefix and its DataStore key. */
const ENTITY_ROUTES = {
  'rooms': { processPrefix: 'Room', storeKey: 'rooms' },
  'room-types': { processPrefix: 'RoomType', storeKey: 'roomTypes' },
  'guests': { processPrefix: 'Guest', storeKey: 'guests' },
  'bookings': { processPrefix: 'Booking', storeKey: 'bookings' },
  'payments': { processPrefix: 'Payment', storeKey: 'payments' }
};

/** REST-style adapter: translates "/collection[/id]" + an HTTP-style method into a process call. */
async function api(path, method = 'GET', body) {
  const [, collectionName, recordId] = path.split('/');
  const route = ENTITY_ROUTES[collectionName];
  if (!route) throw new Error(`Unknown API path: ${path}`);

  if (method === 'GET') return Api.call(route.processPrefix + 'List');
  if (method === 'DELETE') { await Api.call(route.processPrefix + 'Delete', { id: +recordId }); return { ok: true }; }
  if (method === 'POST') { const [createdRecord] = await Api.call(route.processPrefix + 'Save', body); return createdRecord; }

  // PUT: merge the partial change into the record already held in memory, then save the full record.
  const existingRecord = DataStore.state[route.storeKey].find((item) => item.id == recordId) || {};
  const [updatedRecord] = await Api.call(route.processPrefix + 'Save', { ...existingRecord, ...body, id: +recordId });
  return updatedRecord;
}
