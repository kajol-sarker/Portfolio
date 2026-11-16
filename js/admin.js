import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const config = window.ADMIN_CONFIG || {};
const loginPanel = document.querySelector('#login-panel');
const setupPanel = document.querySelector('#setup-panel');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#login-form');
const loginEmail = document.querySelector('#login-email');
const loginMessage = document.querySelector('#login-message');
const mfaPanel = document.querySelector('#mfa-panel');
const mfaForm = document.querySelector('#mfa-form');
const mfaCode = document.querySelector('#mfa-code');
const mfaMessage = document.querySelector('#mfa-message');
const mfaSecret = document.querySelector('#mfa-secret');
const mfaSecretLabel = document.querySelector('#mfa-secret-label');
const mfaInstructions = document.querySelector('#mfa-instructions');
const entryForm = document.querySelector('#entry-form');
const entryId = document.querySelector('#entry-id');
const entryCategory = document.querySelector('#entry-category');
const entryTitle = document.querySelector('#entry-title');
const entryContent = document.querySelector('#entry-content');
const alarmField = document.querySelector('#alarm-field');
const entryAlarmAt = document.querySelector('#entry-alarm-at');
const entryFile = document.querySelector('#entry-file');
const entryFilePath = document.querySelector('#entry-file-path');
const entryMessage = document.querySelector('#entry-message');
const listMessage = document.querySelector('#list-message');
const alarmMessage = document.querySelector('#alarm-message');
const entryList = document.querySelector('#entry-list');
const saveButton = document.querySelector('#save-entry');
const cancelButton = document.querySelector('#cancel-edit');

const setMessage = (node, message = '', isError = false) => {
  node.textContent = message;
  node.classList.toggle('error', isError);
};

if (!config.supabaseUrl || !config.supabaseAnonKey || !config.adminEmail) {
  loginForm.hidden = true;
  loginPanel.hidden = true;
  setupPanel.hidden = false;
} else {
  const allowedEmail = config.adminEmail.trim().toLowerCase();
  loginEmail.value = allowedEmail;
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  let activeFilter = 'all';
  let alarmTimer = null;
  let mfaFactorId = null;
  let mfaChallengeId = null;
  let mfaEnrollment = false;
  let authFlowInProgress = false;
  const resetEditor = () => {
    entryForm.reset();
    entryId.value = '';
    entryFilePath.value = '';
    entryFile.value = '';
    alarmField.hidden = entryCategory.value !== 'alarm';
    saveButton.textContent = 'Save entry';
    cancelButton.hidden = true;
    setMessage(entryMessage);
  };

  const renderEntries = async () => {
    setMessage(listMessage, 'Loading…');
    const { data, error } = await supabase.from('admin_entries').select('id,category,title,content,alarm_at,alarm_fired_at,file_path,created_at,updated_at').order('updated_at', { ascending: false });
    if (error) {
      entryList.replaceChildren();
      setMessage(listMessage, `Could not load entries: ${error.message}`, true);
      return;
    }
    entryList.replaceChildren();
    const visibleItems = data.filter((item) => activeFilter === 'all' || item.category === activeFilter);
    setMessage(listMessage, visibleItems.length ? '' : 'No items in this view yet.');
    for (const item of visibleItems) {
      const card = document.createElement('article');
      card.className = 'entry';
      const body = document.createElement('div');
      const category = document.createElement('div');
      category.className = 'entry-meta';
      const categoryNames = { note: 'Private note', alarm: 'Alarm / reminder', message: 'Private message', academic: 'Academic record', industry: 'Industry / job record', document: 'Private document' };
      category.textContent = categoryNames[item.category] || item.category;
      const title = document.createElement('h3');
      title.textContent = item.title;
      const content = document.createElement('p');
      content.textContent = item.content;
      body.append(category, title);
      if (item.alarm_at) {
        const due = document.createElement('p');
        due.className = 'entry-due';
        due.textContent = `Reminder: ${new Date(item.alarm_at).toLocaleString()}${item.alarm_fired_at ? ' · Notified' : ''}`;
        body.append(due);
      }
      if (item.file_path) {
        const fileButton = document.createElement('button');
        fileButton.className = 'admin-secondary entry-file';
        fileButton.type = 'button';
        fileButton.textContent = `Download private file: ${item.file_path.split('/').pop().replace(/^[0-9a-f-]{36}_/, '')}`;
        fileButton.addEventListener('click', async () => {
          fileButton.disabled = true;
          const { data: fileBlob, error: fileError } = await supabase.storage.from('admin-documents').download(item.file_path);
          if (fileError) setMessage(listMessage, `Could not download file: ${fileError.message}`, true);
          else {
            const objectUrl = URL.createObjectURL(fileBlob);
            const downloadLink = document.createElement('a');
            downloadLink.href = objectUrl;
            downloadLink.download = item.file_path.split('/').pop();
            downloadLink.click();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
          }
          fileButton.disabled = false;
        });
        body.append(fileButton);
      }
      body.append(content);
      const actions = document.createElement('div');
      actions.className = 'entry-actions';
      const edit = document.createElement('button');
      edit.className = 'admin-secondary';
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        entryId.value = item.id;
        entryCategory.value = item.category;
        entryTitle.value = item.title;
        entryContent.value = item.content;
        entryFilePath.value = item.file_path || '';
        entryAlarmAt.value = item.alarm_at
          ? new Date(Date.parse(item.alarm_at) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
          : '';
        alarmField.hidden = item.category !== 'alarm';
        saveButton.textContent = 'Update entry';
        cancelButton.hidden = false;
        entryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const remove = document.createElement('button');
      remove.className = 'admin-secondary';
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
        remove.disabled = true;
        const { error: deleteError } = await supabase.from('admin_entries').delete().eq('id', item.id);
        if (deleteError) setMessage(listMessage, `Could not delete entry: ${deleteError.message}`, true);
        else {
          if (item.file_path) {
            const { error: storageError } = await supabase.storage.from('admin-documents').remove([item.file_path]);
            if (storageError) setMessage(listMessage, `Record deleted, but private file cleanup failed: ${storageError.message}`, true);
          }
          if (entryId.value === item.id) resetEditor();
          await renderEntries();
        }
        remove.disabled = false;
      });
      actions.append(edit, remove);
      card.append(body, actions);
      entryList.append(card);
    }
  };

  const showDashboard = async (session) => {
    if (authFlowInProgress) return;
    authFlowInProgress = true;
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email || email !== allowedEmail) {
      await supabase.auth.signOut();
      dashboard.hidden = true;
      loginPanel.hidden = false;
      mfaPanel.hidden = true;
      setMessage(loginMessage, 'This account is not authorized for the admin area.', true);
      authFlowInProgress = false;
      return;
    }
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) {
      dashboard.hidden = true;
      loginPanel.hidden = true;
      mfaPanel.hidden = false;
      setMessage(mfaMessage, `Could not verify MFA status: ${assuranceError.message}`, true);
      authFlowInProgress = false;
      return;
    }
    if (assurance.currentLevel !== 'aal2') {
      loginPanel.hidden = true;
      dashboard.hidden = true;
      mfaPanel.hidden = false;
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) {
        setMessage(mfaMessage, `Could not load authenticator factors: ${factorError.message}`, true);
        authFlowInProgress = false;
        return;
      }
      const verifiedFactor = factors.totp.find((factor) => factor.status === 'verified');
      if (verifiedFactor) {
        mfaFactorId = verifiedFactor.id;
        mfaEnrollment = false;
        mfaChallengeId = null;
        mfaSecret.hidden = true;
        mfaSecretLabel.hidden = true;
        mfaInstructions.textContent = 'Enter the current six-digit code from your authenticator app.';
        setMessage(mfaMessage);
      } else {
        for (const factor of factors.totp) {
          if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
        const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Portfolio Admin' });
        if (enrollmentError) setMessage(mfaMessage, `Could not set up MFA: ${enrollmentError.message}`, true);
        else {
          mfaFactorId = enrollment.id;
          mfaEnrollment = true;
          mfaSecret.textContent = enrollment.totp.secret;
          mfaSecret.hidden = false;
          mfaSecretLabel.hidden = false;
          mfaInstructions.textContent = 'Add this setup key to an authenticator app or password manager, keep the key private, then enter the generated six-digit code.';
          setMessage(mfaMessage);
        }
      }
      authFlowInProgress = false;
      return;
    }
    loginPanel.hidden = true;
    mfaPanel.hidden = true;
    dashboard.hidden = false;
    document.querySelector('#signed-in-as').textContent = `Signed in as ${email}`;
    setMessage(loginMessage);
    await renderEntries();
    if (!alarmTimer) {
      checkAlarms();
      alarmTimer = window.setInterval(checkAlarms, 30000);
    }
    authFlowInProgress = false;
  };

  const checkAlarms = async () => {
    const { data, error } = await supabase.from('admin_entries').select('id,title,content,alarm_at,alarm_fired_at').eq('category', 'alarm').not('alarm_at', 'is', null).is('alarm_fired_at', null);
    if (error) return;
    const now = Date.now();
    for (const alarm of data) {
      if (new Date(alarm.alarm_at).getTime() > now) continue;
      const firedAt = new Date().toISOString();
      const { error: updateError } = await supabase.from('admin_entries').update({ alarm_fired_at: firedAt }).eq('id', alarm.id).is('alarm_fired_at', null);
      if (updateError) continue;
      const body = alarm.content || 'Your reminder is due.';
      if ('Notification' in window && Notification.permission === 'granted') new Notification(alarm.title, { body });
      setMessage(alarmMessage, `Reminder: ${alarm.title} — ${body}`);
      await renderEntries();
    }
  };

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(loginMessage, 'Sending your sign-in link…');
    const email = loginEmail.value.trim().toLowerCase();
    if (email !== allowedEmail) {
      setMessage(loginMessage, 'That email is not the configured admin account.', true);
      return;
    }
    const redirectTo = new URL('admin.html', window.location.href).href;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    setMessage(loginMessage, error ? `Could not send link: ${error.message}` : 'Check your email for the secure sign-in link.', Boolean(error));
  });

  mfaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = mfaCode.value.trim();
    if (!/^\d{6}$/.test(code) || !mfaFactorId) {
      setMessage(mfaMessage, 'Enter the six-digit code from your authenticator app.', true);
      return;
    }
    setMessage(mfaMessage, 'Verifying…');
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challengeError) {
      setMessage(mfaMessage, `Could not start verification: ${challengeError.message}`, true);
      return;
    }
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code });
    if (error) {
      setMessage(mfaMessage, `Code not accepted: ${error.message}`, true);
      mfaCode.value = '';
      return;
    }
    mfaCode.value = '';
    mfaSecret.hidden = true;
    mfaSecretLabel.hidden = true;
    mfaEnrollment = false;
    const { data: sessionData } = await supabase.auth.getSession();
    await showDashboard(sessionData.session);
  });

  entryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    setMessage(entryMessage, 'Saving…');
    const record = {
      category: entryCategory.value,
      title: entryTitle.value.trim(),
      content: entryContent.value.trim(),
      alarm_at: entryCategory.value === 'alarm' && entryAlarmAt.value ? new Date(entryAlarmAt.value).toISOString() : null,
      alarm_fired_at: null,
      file_path: entryFilePath.value || null
    };
    if (record.category === 'alarm' && !record.alarm_at) {
      saveButton.disabled = false;
      setMessage(entryMessage, 'Choose a date and time for this alarm.', true);
      return;
    }
    if (record.category === 'alarm' && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    const selectedFile = entryFile.files[0];
    if (selectedFile) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (selectedFile.size > 15 * 1024 * 1024 || !allowedTypes.includes(selectedFile.type)) {
        saveButton.disabled = false;
        setMessage(entryMessage, 'Choose a PDF, image, Word, or text file smaller than 15 MB.', true);
        return;
      }
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uploadedPath = `${crypto.randomUUID()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from('admin-documents').upload(uploadedPath, selectedFile, { contentType: selectedFile.type, upsert: false });
      if (uploadError) {
        saveButton.disabled = false;
        setMessage(entryMessage, `Could not upload private file: ${uploadError.message}`, true);
        return;
      }
      record.file_path = uploadedPath;
    }
    const query = entryId.value
      ? supabase.from('admin_entries').update(record).eq('id', entryId.value)
      : supabase.from('admin_entries').insert(record);
    const { error } = await query;
    saveButton.disabled = false;
    if (error) {
      if (selectedFile && record.file_path !== entryFilePath.value) await supabase.storage.from('admin-documents').remove([record.file_path]);
      setMessage(entryMessage, `Could not save entry: ${error.message}`, true);
      return;
    }
    if (selectedFile && entryFilePath.value && entryFilePath.value !== record.file_path) {
      await supabase.storage.from('admin-documents').remove([entryFilePath.value]);
    }
    resetEditor();
    setMessage(entryMessage, 'Entry saved.');
    await renderEntries();
  });

  cancelButton.addEventListener('click', resetEditor);
  entryCategory.addEventListener('change', () => { alarmField.hidden = entryCategory.value !== 'alarm'; });
  document.querySelectorAll('.entry-filter').forEach((button) => {
    button.addEventListener('click', async () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll('.entry-filter').forEach((filter) => {
        const active = filter === button;
        filter.classList.toggle('active', active);
        filter.setAttribute('aria-pressed', String(active));
      });
      await renderEntries();
    });
  });
  document.querySelector('#sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    if (alarmTimer) window.clearInterval(alarmTimer);
    alarmTimer = null;
    dashboard.hidden = true;
    mfaPanel.hidden = true;
    loginPanel.hidden = false;
    setMessage(loginMessage, 'You’re signed out.');
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) showDashboard(session);
    else {
      if (alarmTimer) window.clearInterval(alarmTimer);
      alarmTimer = null;
      dashboard.hidden = true;
      mfaPanel.hidden = true;
      loginPanel.hidden = false;
    }
  });
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) showDashboard(session);
  });
}
