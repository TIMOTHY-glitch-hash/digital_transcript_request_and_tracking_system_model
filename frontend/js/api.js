// Shared helpers used by every page
const API = '/api/v1/transcript-requests';

const STATUS_LABELS = {
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  issued: 'Issued',
};

async function apiFetch(path = '', options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return { ok: true, status: 204, body: null };
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function statusChip(status) {
  return `<span class="chip chip-${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function hideMessage(el) {
  el.hidden = true;
  el.textContent = '';
}

function showMessage(el, text, type = 'error') {
  el.className = `msg msg-${type}`;
  el.textContent = text;
  el.hidden = false;
}

// Shows the API's error message plus the details list (if any)
function showError(el, body) {
  const err = body && body.error;
  el.className = 'msg msg-error';
  el.textContent = '';
  const title = document.createElement('div');
  title.textContent = err ? err.message : 'Something went wrong. Please try again.';
  el.appendChild(title);
  if (err && Array.isArray(err.details) && err.details.length) {
    const ul = document.createElement('ul');
    err.details.forEach((d) => {
      const li = document.createElement('li');
      li.textContent = d;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }
  el.hidden = false;
}

const SERVER_DOWN = 'Cannot reach the server. Make sure the API is running (npm run dev).';
