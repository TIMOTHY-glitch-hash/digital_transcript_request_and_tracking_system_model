// Registrar console
const tableBody = document.getElementById('rows');
const panel = document.getElementById('panel');
const messageEl = document.getElementById('message');
const filterEl = document.getElementById('status-filter');
let requests = [];
let selectedId = null;

async function loadRequests() {
  try {
    const q = filterEl.value ? '?status=' + encodeURIComponent(filterEl.value) : '';
    const res = await apiFetch(q);
    if (!res.ok) return showError(messageEl, res.body);
    requests = res.body.data;
    renderTable();
    const selected = requests.find((r) => r.id === selectedId);
    selected ? renderPanel(selected) : renderEmptyPanel();
  } catch {
    showMessage(messageEl, SERVER_DOWN);
  }
}

function renderTable() {
  if (!requests.length) {
    tableBody.innerHTML = '<tr><td colspan="3" class="empty">No requests found.</td></tr>';
    return;
  }
  tableBody.innerHTML = requests.map((r) => `
    <tr data-id="${escapeHtml(r.id)}" class="${r.id === selectedId ? 'selected' : ''}">
      <td><button class="link-btn" data-id="${escapeHtml(r.id)}">${escapeHtml(r.fullName)}</button><br><span class="muted">${escapeHtml(r.studentNumber)}</span></td>
      <td>${escapeHtml(r.type === 'official' ? 'Official' : 'Unofficial')}</td>
      <td>${statusChip(r.status)}</td>
    </tr>`).join('');
}

function renderEmptyPanel() {
  panel.innerHTML = '<h2>Request details</h2><p class="muted">Select a request from the queue to review it.</p>';
}

function actionsFor(r) {
  if (r.status === 'submitted')
    return '<button class="btn btn-primary" data-action="review">Start review</button>';
  if (r.status === 'under_review')
    return `
      <h2 style="font-size:14px">Approval checks (all required)</h2>
      <div class="checks">
        <div class="choice"><input type="checkbox" id="identityVerified"><label for="identityVerified">Identity verified</label></div>
        <div class="choice"><input type="checkbox" id="feesCleared"><label for="feesCleared">Fees cleared</label></div>
        <div class="choice"><input type="checkbox" id="eligible"><label for="eligible">Eligible for requested type</label></div>
      </div>
      <label class="label" for="note">Note (required to reject)</label>
      <textarea id="note"></textarea>
      <div class="actions"><button class="btn btn-primary" data-action="approve">Approve</button>
      <button class="btn btn-secondary" data-action="reject">Reject</button></div>`;
  if (r.status === 'approved')
    return '<button class="btn btn-primary" data-action="issue">Mark as issued</button>';
  return '<p class="muted">This request is closed. No further changes are possible.</p>';
}

function renderPanel(r) {
  const history = [...r.history].reverse().map((h) => `
    <li>${statusChip(h.status)}<div><b>${escapeHtml(h.note || STATUS_LABELS[h.status])}</b>
    <span class="muted">${escapeHtml(formatDate(h.at))}</span></div></li>`).join('');
  panel.innerHTML = `
    <div class="card-head"><h2>${escapeHtml(r.fullName)}, ${escapeHtml(r.type)}, ${escapeHtml(r.copies)} copies</h2>${statusChip(r.status)}</div>
    <p style="margin-bottom:18px">${escapeHtml(r.studentStatus === 'finalist' ? 'Finalist' : 'Continuing')} | ${escapeHtml(r.program)} | ${escapeHtml(r.deliveryMethod)}</p>
    ${actionsFor(r)}
    <h2 style="margin-top:24px">History</h2><ul class="history">${history}</ul>`;
}

async function changeStatus(body) {
  hideMessage(messageEl);
  try {
    const res = await apiFetch('/' + encodeURIComponent(selectedId) + '/status', { method: 'PATCH', body: JSON.stringify(body) });
    if (res.ok) {
      await loadRequests();
      showMessage(messageEl, `Status updated to "${STATUS_LABELS[body.status]}".`, 'success');
    } else {
      showError(messageEl, res.body);
      messageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch {
    showMessage(messageEl, SERVER_DOWN);
  }
}

function select(id) {
  selectedId = id;
  hideMessage(messageEl);
  renderTable();
  renderPanel(requests.find((r) => r.id === id));
}

tableBody.addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (row) select(row.dataset.id);
});

panel.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  const noteEl = document.getElementById('note');
  const note = noteEl ? noteEl.value.trim() : '';
  if (action === 'review') changeStatus({ status: 'under_review', note: 'Review started' });
  if (action === 'issue') changeStatus({ status: 'issued', note: 'Ready for collection' });
  if (action === 'reject') changeStatus({ status: 'rejected', note });
  if (action === 'approve') {
    const checks = {
      identityVerified: document.getElementById('identityVerified').checked,
      feesCleared: document.getElementById('feesCleared').checked,
      eligible: document.getElementById('eligible').checked,
    };
    changeStatus({ status: 'approved', checks, note: note || 'Approved' });
  }
});

filterEl.addEventListener('change', loadRequests);
document.getElementById('refresh-btn').addEventListener('click', loadRequests);
loadRequests();
