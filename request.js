// New request page
const form = document.getElementById('request-form');
const messageEl = document.getElementById('message');
const submitBtn = document.getElementById('submit-btn');
const typeHint = document.getElementById('type-hint');

form.elements.studentStatus.forEach((radio) =>
  radio.addEventListener('change', () => {
    typeHint.textContent =
      form.elements.studentStatus.value === 'continuing'
        ? 'Continuing students can only request an unofficial (provisional) transcript.'
        : '';
  })
);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage(messageEl);

  const data = {
    studentNumber: form.elements.studentNumber.value.trim(),
    fullName: form.elements.fullName.value.trim(),
    email: form.elements.email.value.trim(),
    program: form.elements.program.value.trim(),
    studentStatus: form.elements.studentStatus.value,
    type: form.elements.type.value,
    copies: Number(form.elements.copies.value),
    deliveryMethod: form.elements.deliveryMethod.value,
  };

  submitBtn.disabled = true;
  try {
    const res = await apiFetch('', { method: 'POST', body: JSON.stringify(data) });
    if (res.ok) {
      window.location.href = 'track.html?id=' + encodeURIComponent(res.body.data.id);
    } else {
      showError(messageEl, res.body);
      messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch {
    showMessage(messageEl, SERVER_DOWN);
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('clear-btn').addEventListener('click', () => {
  form.reset();
  hideMessage(messageEl);
  typeHint.textContent = '';
});
