/**
 * Returns standard JSON + Authorization headers for API requests.
 * @param {string} token - JWT auth token
 * @param {boolean} [includeContentType=true] - include Content-Type: application/json
 */
export const authHeader = (token, includeContentType = true) =>
    includeContentType
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        : { Authorization: `Bearer ${token}` };
