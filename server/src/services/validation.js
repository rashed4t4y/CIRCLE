export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send a JSON object.');
  return body;
}

export function textField(value, name, { min = 1, max = 500, trim = true } = {}) {
  if (typeof value !== 'string') throw new HttpError(400, name + ' is required.', { [name]: 'Enter text.' });
  const text = trim ? value.trim() : value;
  if (text.length < min || text.length > max) throw new HttpError(400, name + ' must be ' + min + '–' + max + ' characters.', { [name]: 'Use ' + min + '–' + max + ' characters.' });
  return text;
}

export function imageUrl(value, name) {
  if (value === null || value === undefined || value === '') return null;
  const text = textField(value, name, { max: 2048 });
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new HttpError(400, name + ' must be an http or https URL.', { [name]: 'Enter a valid image URL.' });
  }
}

export function username(value) {
  const result = textField(value, 'username', { min: 3, max: 24 }).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(result)) throw new HttpError(400, 'Username may contain letters, numbers, and underscores.', { username: 'Use letters, numbers, or underscores.' });
  return result;
}

export function email(value) {
  const result = textField(value, 'email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Enter a valid email address.', { email: 'Enter a valid email address.' });
  return result;
}

export function password(value) {
  const result = textField(value, 'password', { min: 10, max: 72, trim: false });
  if (Buffer.byteLength(result, 'utf8') > 72) throw new HttpError(400, 'Password must be at most 72 UTF-8 bytes.', { password: 'Use a shorter password.' });
  return result;
}

export function id(value) {
  if (!/^\d+$/.test(String(value))) throw new HttpError(400, 'Invalid record ID.');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 2147483647) throw new HttpError(400, 'Invalid record ID.');
  return result;
}

export function pagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 15 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new HttpError(400, 'Use a page from 1–100000 and a limit from 1–50.');
  return { page, limit, offset: (page - 1) * limit };
}

export function listResult(rows, { page, limit }) {
  return { data: rows.slice(0, limit), pagination: { page, limit, has_more: rows.length > limit } };
}

export function searchTerm(value = '') {
  return textField(value, 'search', { min: 0, max: 100 });
}

export function likePattern(value) {
  return '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
}

