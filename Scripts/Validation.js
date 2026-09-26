'use strict';
/* ============================================================================
   Validation.js
   The generic form engine used by every add/edit form in the app.

   A "field" is a plain object describing one input:
     key            name of the field (matches the API's JSON property)
     label          text shown to the user
     inputType      'text' (default) | 'email' | 'tel' | 'password' | 'number'
                    | 'date' | 'select' | 'textarea'
     required       true/false
     minLength      minimum characters (text fields)
     maxLength      maximum characters (text fields) -> also sets HTML maxlength
     min, max       minimum/maximum value (number fields) -> also sets HTML min/max
     integerOnly    true if a number field must be a whole number
     pattern        RegExp of the characters/format that are allowed
     helpText       shown under the field, explaining the length/character rules
     options        array of [value, label], or a function returning that array
     placeholder    shown as the first, empty <option> of a select
     autocomplete   HTML autocomplete hint
     customValidator(value, allFormValues, editingItemId) -> '' | 'error message'
     alwaysValidate run customValidator even when the field is empty
     onChangeSideEffect(formElement, newValue) -> called when this field changes,
                    used e.g. to auto-fill price/capacity from a selected room type

   buildFieldHtml()   turns one field config into a <label> block
   getFormValues()    reads a <form> into a plain { key: value } object
   validateFields()   checks every field, writes error text into the form,
                      and returns true only if every field is valid
   openFormModal()    opens a modal, wires up validation + submit for you
   ========================================================================= */

function buildFieldHtml(field, currentValue = '') {
  const resolvedOptions = typeof field.options === 'function' ? field.options() : (field.options || []);
  const sharedAttributes = `name="${field.key}" id="field_${field.key}"`;
  const currentValueText = escapeHtml(currentValue ?? '');

  let inputHtml;
  if (field.inputType === 'select') {
    const optionsHtml = resolvedOptions
      .map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}"${String(optionValue) === String(currentValue) ? ' selected' : ''}>${escapeHtml(optionLabel)}</option>`)
      .join('');
    inputHtml = `<select ${sharedAttributes}>${field.placeholder ? `<option value="">${escapeHtml(field.placeholder)}</option>` : ''}${optionsHtml}</select>`;
  } else if (field.inputType === 'textarea') {
    inputHtml = `<textarea ${sharedAttributes} rows="3"${field.maxLength ? ` maxlength="${field.maxLength}"` : ''}>${currentValueText}</textarea>`;
  } else {
    const lengthAndRangeAttributes =
      (field.minLength != null ? ` minlength="${field.minLength}"` : '') +
      (field.maxLength != null ? ` maxlength="${field.maxLength}"` : '') +
      (field.min != null ? ` min="${field.min}"` : '') +
      (field.max != null ? ` max="${field.max}"` : '') +
      (field.step ? ` step="${field.step}"` : '') +
      (field.autocomplete ? ` autocomplete="${field.autocomplete}"` : '');
    inputHtml = `<input ${sharedAttributes} type="${field.inputType || 'text'}" value="${currentValueText}"${lengthAndRangeAttributes}>`;
  }

  return `<label class="fld">
    <span>${escapeHtml(field.label)}${field.required ? ' *' : ''}</span>
    ${inputHtml}
    ${field.helpText ? `<small class="note">${escapeHtml(field.helpText)}</small>` : ''}
    <small class="fe" data-e="${field.key}"></small>
  </label>`;
}

function getFormValues(formElement) {
  const values = {};
  new FormData(formElement).forEach((value, key) => {
    values[key] = formElement.elements[key]?.type === 'password' ? value : String(value).trim();
  });
  return values;
}

/** Validates every field in fieldConfigs against the current value of formElement. Writes error text into the form. */
function validateFields(fieldConfigs, formElement, editingItemId) {
  const allValues = getFormValues(formElement);
  let everyFieldValid = true;

  fieldConfigs.forEach((field) => {
    const rawValue = allValues[field.key] ?? '';
    let errorMessage = '';

    if (field.required && !rawValue) {
      errorMessage = `${field.label} is required`;
    } else if (rawValue) {
      if (field.inputType === 'number') {
        const numericValue = Number(rawValue);
        if (Number.isNaN(numericValue)) errorMessage = 'Enter a valid number';
        else if (field.integerOnly && !Number.isInteger(numericValue)) errorMessage = 'Enter a whole number';
        else if (field.min != null && numericValue < field.min) errorMessage = `Minimum value is ${field.min}`;
        else if (field.max != null && numericValue > field.max) errorMessage = `Maximum value is ${field.max}`;
      } else {
        if (!errorMessage && field.minLength != null && rawValue.length < field.minLength) errorMessage = `Minimum ${field.minLength} characters`;
        if (!errorMessage && field.maxLength != null && rawValue.length > field.maxLength) errorMessage = `Maximum ${field.maxLength} characters`;
        if (!errorMessage && field.pattern && !field.pattern.test(rawValue)) errorMessage = field.helpText || 'This value contains characters that are not allowed';
      }
    }

    if (!errorMessage && field.customValidator && (rawValue || field.alwaysValidate)) {
      errorMessage = field.customValidator(rawValue, allValues, editingItemId) || '';
    }

    const errorElement = qs(`[data-e="${field.key}"]`, formElement);
    if (errorElement) errorElement.textContent = errorMessage;
    formElement.elements[field.key]?.classList.toggle('bad', !!errorMessage);
    if (errorMessage) everyFieldValid = false;
  });

  return everyFieldValid;
}

/**
 * Opens a modal add/edit form and wires up validation + submission.
 *   title, fieldConfigs, initialValues, editingItemId, submitLabel
 *   onSubmit(values) - called with the validated form values; throw an Error to show it in the form
 */
function openFormModal({ title, fieldConfigs, initialValues = {}, editingItemId, submitLabel = 'Save', onSubmit }) {
  const modalElement = openModal(`
    <h2>${escapeHtml(title)}</h2>
    <form novalidate>
      ${fieldConfigs.map((field) => buildFieldHtml(field, initialValues[field.key])).join('')}
      <p class="fe" id="formSubmitError" role="alert"></p>
      <div class="row end">
        <button type="button" class="btn" data-x>Cancel</button>
        <button class="btn pri">${escapeHtml(submitLabel)}</button>
      </div>
    </form>`);

  const formElement = qs('form', modalElement);
  formElement.dataset.editing = editingItemId ? '1' : '';
  let hasAttemptedSubmit = false;

  formElement.addEventListener('input', (event) => {
    if (hasAttemptedSubmit) validateFields(fieldConfigs, formElement, editingItemId);
  });
  formElement.addEventListener('change', (event) => {
    fieldConfigs.find((field) => field.key === event.target.name)?.onChangeSideEffect?.(formElement, event.target.value);
  });

  formElement.onsubmit = async (event) => {
    event.preventDefault();
    hasAttemptedSubmit = true;
    if (!validateFields(fieldConfigs, formElement, editingItemId)) { qs('.bad', formElement)?.focus(); return; }

    const submitButton = qs('.pri', formElement);
    submitButton.disabled = true;
    qs('#formSubmitError', modalElement).textContent = '';
    try {
      await onSubmit(getFormValues(formElement));
    } catch (error) {
      qs('#formSubmitError', modalElement).textContent = error.message || 'Something went wrong. Please try again.';
      submitButton.disabled = false;
    }
  };

  return modalElement;
}
