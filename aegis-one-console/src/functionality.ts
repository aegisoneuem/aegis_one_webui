/** Frontend actions. Remote operations deliberately stop at a reviewable local draft. */
type Host = { state: Record<string, any>; setState: (value: any) => void; toast: (message: string) => void; go: (page: string) => () => void };
const draftKey = 'aegis-console-action-drafts-v1';
export function downloadFile(name: string, body: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(name: string, rows: Record<string, any>[], keys: string[]) {
  const cell = (v: unknown) => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  downloadFile(name, '\uFEFF' + [keys, ...rows.map(row => keys.map(k => row[k]))].map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
export function showInfo(host: Host, title: string, body: string) {
  host.setState({ modal: { title, body, hasConfirm: false, cancel: 'Close' } });
}
export function readDrafts(): any[] {
  try { const v = JSON.parse(localStorage.getItem(draftKey) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveDraft(host: Host, modal: any) {
  const fields = Object.fromEntries((modal.fields || []).map((f: any) => [f.label, f.value || '']));
  if ((modal.fields || []).some((f: any) => !String(f.value || '').trim())) { host.toast('Please complete every field before saving the draft.'); return; }
  const draft = { id: crypto.randomUUID(), title: modal.title, fields, code: modal.hasCode ? modal.code : undefined, created: new Date().toISOString(), status: 'Draft — not submitted' };
  try { localStorage.setItem(draftKey, JSON.stringify([...readDrafts(), draft])); }
  catch { host.toast('Browser storage is unavailable. Draft was not saved.'); return; }
  showInfo(host, 'Draft saved locally', 'Your entered values are saved in this browser. No endpoint, account or integration has been changed. Use Help → Export action drafts to download them for backend integration.');
}
export function reviewAction(host: Host, title: string) {
  host.setState({ modal: { title: 'Review action', body: 'Requested operation: ' + title + '\n\nBackend connection required. Save a local draft to record the request; it will not execute on endpoints.', confirmLabel: 'Save action draft', localHandled: true, confirm: () => saveDraft(host, { title }) } });
}
export function enhanceControls(host: Host, values: any) {
  const v = { ...values };
  v.exportCsv = () => csv('Aegis-One-Devices.csv', v.devices, ['id', 'user', 'os', 'status', 'health', 'patch', 'risk', 'dex', 'site', 'seen']);
  v.exportAudit = () => csv('Aegis-One-Audit.csv', v.audit, ['time', 'who', 'action', 'target', 'source', 'result']);
  v.copyToken = async () => {
    const text = host.state.modal?.token || 'AO-ENR-7K3Q-M9XV-2PLR-D8FT';
    try { await navigator.clipboard.writeText(text); host.toast('Displayed demo token copied'); }
    catch { showInfo(host, 'Copy token manually', text + '\n\nClipboard access was denied by your browser.'); }
  };
  v.downloadInstaller = () => showInfo(host, 'Installer unavailable', 'No signed installer binaries are bundled with this frontend. Connect the installer distribution service to enable Windows, macOS and Linux downloads. No token was copied.');
  v.testApi = () => showInfo(host, 'API connection required', host.state.apiMethod + ' ' + host.state.apiPath + '\nNo request was sent. Configure a backend URL and authentication before testing this endpoint.');
  v.enrollMfa = () => showInfo(host, 'Passkey registration unavailable', 'Connect the identity service and WebAuthn challenge endpoint to enroll a real passkey. No account was changed.');
  v.saveMfaPolicy = () => saveDraft(host, { title: 'MFA policy', fields: ['mfaScope', 'mfaGrace', 'mfaTrusted', 'mfaSession'].map(key => ({ label: key, value: host.state[key] })) });
  v.help = () => host.setState({ modal: { title: 'Console help', body: 'Use the sidebar to navigate; Ctrl/Cmd+K searches the console. Filters, tables, Reports and CSV exports run locally. Endpoint actions require the UEM backend. Action drafts remain in this browser and can be exported below.', localHandled: true, confirmLabel: 'Export action drafts', confirm: () => downloadFile('Aegis-One-Action-Drafts.json', JSON.stringify(readDrafts(), null, 2)) } });
  for (const key of ['runAction', 'moreActions', 'bulkMore', 'bulkAction']) v[key] = () => host.setState({ actionDrawer: true });
  const filterKeys = ['dq', 'dOS', 'dStatus', 'dRisk', 'dHealth', 'dView', 'advancedFilters'];
  v.saveView = () => host.setState({ modal: { title: 'Save Current View', body: 'Save these device filters in this browser.', localHandled: true, fields: [{ label: 'View name', value: '' }], confirmLabel: 'Save View', confirm: () => {
    const name = host.state.modal.fields[0].value.trim();
    if (!name) { host.toast('Enter a view name'); return; }
    const filter = Object.fromEntries(filterKeys.map(k => [k, host.state[k] ?? (k === 'advancedFilters' ? [] : k === 'dq' ? '' : k === 'dView' ? 'All Devices' : 'All')]));
    const views = [...(host.state.savedViews || []).filter((x: any) => x.name !== name), { name, filter }];
    try { localStorage.setItem('aegis-saved-device-views', JSON.stringify(views)); } catch { host.toast('Cannot save: browser storage unavailable'); return; }
    host.setState({ savedViews: views, modal: null }); host.toast('View saved');
  } } });
  v.views = [...v.views, ...(host.state.savedViews || []).map((view: any) => ({ label: view.name, bg: '#fff', c: '#20262E', set: () => host.setState({ ...view.filter, tblPage: 1 }) }))];
  v.moreFilters = () => host.setState({ modal: { title: 'Advanced Device Filters', body: 'Match Health, Aegis Zone and Patch Status. Leave a field blank to include all values.', localHandled: true, fields: ['Health', 'Aegis Zone', 'Patch Status'].map((label, i) => ({ label, value: host.state.advancedFilters?.[i] || '' })), confirmLabel: 'Apply Filters', confirm: () => host.setState({ advancedFilters: host.state.modal.fields.map((f: any) => f.value.trim()), tblPage: 1, modal: null }) } });
  const oldClear = v.clearAll;
  v.clearAll = () => { oldClear(); host.setState({ advancedFilters: [], tblPage: 1 }); };
  if (host.state.advancedFilters?.some(Boolean)) {
    v.hasChips = true;
    v.chips = [...v.chips, ...host.state.advancedFilters.flatMap((value: string, i: number) => value ? [{ l: ['Health', 'Zone', 'Patch'][i] + ': ' + value, x: () => host.setState({ advancedFilters: host.state.advancedFilters.map((x: string, n: number) => n === i ? '' : x), tblPage: 1 }) }] : [])];
  }
  v.viewLicense = () => showInfo(host, 'License details', 'The Licensing screen displays the approved demonstration license. Production entitlement verification requires the licensing service.');
  v.uploadLicense = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.lic';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      showInfo(host, 'License selected', file.name + ' (' + file.size + ' bytes). Signature verification and license activation require the backend. The current license was not changed.');
    }; input.click();
  };
  v.genBundle = () => downloadFile('Aegis-One-Frontend-Diagnostics.json', JSON.stringify({ generated: new Date().toISOString(), scope: 'Frontend only; no agent logs or signatures', page: host.state.page, userAgent: navigator.userAgent }, null, 2));
  if (v.modalOpen) {
    const modal = host.state.modal;
    v.modal = { ...v.modal, fields: (v.modal.fields || []).map((f: any, i: number) => ({ ...f, value: f.value ?? '', change: (event: any) => host.setState({ modal: { ...host.state.modal, fields: host.state.modal.fields.map((field: any, index: number) => index === i ? { ...field, value: event.target.value } : field) } }) })) };
    v.modal.codeChange = (event: any) => host.setState({ modal: { ...host.state.modal, code: event.target.value } });
    if (!modal.localHandled && (modal.fields?.length || modal.hasCode)) {
      v.modal.body += '\n\nLocal draft only. Backend integration is required to activate this configuration.';
      v.modal.confirmLabel = 'Save draft';
      v.modal.confirm = () => saveDraft(host, host.state.modal);
    }
    if (modal.stepUp) {
      v.modal.body += '\n\nDemonstration only: no passkey or identity verification is performed.';
      v.modal.confirmLabel = 'Continue simulation';
    }
  }
  return v;
}
