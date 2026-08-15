const client = window.getWorSupabase();
const gate = document.querySelector('#admin-gate');
const consolePanel = document.querySelector('#admin-console');
const pendingList = document.querySelector('#pending-list');
const memberList = document.querySelector('#member-list');
const refreshButton = document.querySelector('#refresh-members');
const editor = document.querySelector('#member-editor');
const memberForm = document.querySelector('#member-form');
const saveButton = document.querySelector('#save-member');
const editorMessage = document.querySelector('#editor-message');
const roleField = document.querySelector('#role-field');
const companySelect = memberForm.elements.company;
const companyOtherField = document.querySelector('#company-other-field');
const companyOtherInput = memberForm.elements['company-other'];
const rankSelect = memberForm.elements['current-rank'];
const unsavedDialog = document.querySelector('#unsaved-changes-dialog');

let currentAdmin = null;
let profiles = [];
let records = new Map();
let editorSnapshot = '';
let editorCloseInProgress = false;

const statusLabels = { pending: '待审核', approved: '已通过', rejected: '已拒绝', suspended: '已停用' };
const roleLabels = { member: '普通成员', admin: '管理员', super_admin: '主管理员' };

const makeButton = (label, className, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
};

const renderEmpty = (container, text) => {
    const empty = document.createElement('p');
    empty.className = 'member-list__empty';
    empty.textContent = text;
    container.replaceChildren(empty);
};

const updateStatus = async (profile, status) => {
    const { error } = await client.from('profiles').update({ account_status: status }).eq('id', profile.id);
    if (error) {
        window.alert('操作没有保存，请刷新后重试。');
        return;
    }
    if (status === 'approved') {
        await client.from('member_records').upsert({ profile_id: profile.id }, { onConflict: 'profile_id' });
    }
    await loadMembers();
};

const deleteMember = async (profile) => {
    if (currentAdmin.role !== 'super_admin' || profile.id === currentAdmin.id) return;
    const confirmed = window.confirm(`确定永久删除“${profile.nickname}”（QQ ${profile.qq_number}）吗？\n\n账户、登录凭据和成员资料都会被删除，此操作无法撤销。`);
    if (!confirmed) return;

    const { error } = await client.rpc('delete_member_account', { p_target_profile_id: profile.id });
    if (error) {
        window.alert('删除失败。请确认已执行最新的数据库权限更新。');
        return;
    }
    await loadMembers();
};

const deleteMemberAvatar = async (profile) => {
    if (profile.id === currentAdmin.id) return;
    const record = records.get(profile.id);
    if (!record?.avatar_path) return;
    const confirmed = window.confirm(`确定移除“${profile.nickname}”上传的头像吗？`);
    if (!confirmed) return;

    const { error: storageError } = await client.storage.from('member-avatars').remove([record.avatar_path]);
    const { error: recordError } = storageError
        ? { error: storageError }
        : await client.rpc('clear_member_avatar', { p_target_profile_id: profile.id });
    if (storageError || recordError) {
        window.alert('头像没有移除，请确认已执行最新的头像管理权限更新。');
        return;
    }
    await loadMembers();
};

const makeMemberCard = (profile, includeReviewActions = false) => {
    const card = document.createElement('article');
    card.className = 'member-admin-card';
    const identity = document.createElement('div');
    const nickname = document.createElement('h3');
    const meta = document.createElement('p');
    nickname.textContent = profile.nickname;
    meta.textContent = `QQ ${profile.qq_number} · ${statusLabels[profile.account_status]} · ${roleLabels[profile.role]}`;
    identity.append(nickname, meta);

    const actions = document.createElement('div');
    actions.className = 'member-admin-card__actions';
    const canEditProfile = currentAdmin.role === 'super_admin' || profile.role === 'member';
    if (includeReviewActions && canEditProfile) {
        actions.append(
            makeButton('通过', 'admin-button', () => updateStatus(profile, 'approved')),
            makeButton('拒绝', 'admin-button admin-button--danger', () => updateStatus(profile, 'rejected'))
        );
    }
    if (canEditProfile) {
        actions.append(makeButton('编辑资料', 'admin-button admin-button--quiet', () => openEditor(profile)));
    }
    if (profile.id !== currentAdmin.id && records.get(profile.id)?.avatar_path) {
        actions.append(makeButton('移除头像', 'admin-button admin-button--danger', () => deleteMemberAvatar(profile)));
    }
    if (currentAdmin.role === 'super_admin' && profile.id !== currentAdmin.id) {
        actions.append(makeButton('删除账户', 'admin-button admin-button--danger', () => deleteMember(profile)));
    }
    card.append(identity, actions);
    return card;
};

const renderMembers = () => {
    const pending = profiles.filter((profile) => profile.account_status === 'pending');
    if (pending.length) pendingList.replaceChildren(...pending.map((profile) => makeMemberCard(profile, true)));
    else renderEmpty(pendingList, '目前没有待审核申请。');

    if (profiles.length) memberList.replaceChildren(...profiles.map((profile) => makeMemberCard(profile)));
    else renderEmpty(memberList, '还没有账户记录。');
};

const loadMembers = async () => {
    refreshButton.disabled = true;
    const [{ data: profileRows, error: profileError }, { data: recordRows, error: recordError }] = await Promise.all([
        client.from('profiles').select('id, qq_number, nickname, account_status, role, created_at').order('created_at', { ascending: false }),
        client.from('member_records').select('*')
    ]);
    refreshButton.disabled = false;

    if (profileError || recordError) {
        gate.hidden = false;
        gate.textContent = '读取成员资料失败，请确认数据库初始化已经完成。';
        return;
    }
    profiles = profileRows ?? [];
    records = new Map((recordRows ?? []).map((record) => [record.profile_id, record]));
    renderMembers();
};

const setField = (name, value = '') => { memberForm.elements[name].value = value ?? ''; };
const numberValue = (name) => Math.max(0, Number.parseInt(memberForm.elements[name].value || '0', 10));
const knownCompanies = new Set(['', 'A 连', 'SC 连']);

const syncCompanyOtherField = () => {
    const usesOtherCompany = companySelect.value === '__other__';
    companyOtherField.hidden = !usesOtherCompany;
    companyOtherInput.required = usesOtherCompany;
};

const setCompanyField = (company = '') => {
    const normalizedCompany = company ?? '';
    if (knownCompanies.has(normalizedCompany)) {
        companySelect.value = normalizedCompany;
        companyOtherInput.value = '';
    } else {
        companySelect.value = '__other__';
        companyOtherInput.value = normalizedCompany;
    }
    syncCompanyOtherField();
};

const setRankField = (rank = '') => {
    rankSelect.querySelector('option[data-existing-rank]')?.remove();
    const normalizedRank = rank ?? '';
    const hasKnownRank = [...rankSelect.options].some((option) => option.value === normalizedRank);
    if (normalizedRank && !hasKnownRank) {
        const existingRank = document.createElement('option');
        existingRank.value = normalizedRank;
        existingRank.textContent = `${normalizedRank}（现有值）`;
        existingRank.dataset.existingRank = '';
        rankSelect.append(existingRank);
    }
    rankSelect.value = normalizedRank;
};

const serializeMemberForm = () => new URLSearchParams(new FormData(memberForm)).toString();
const hasUnsavedChanges = () => serializeMemberForm() !== editorSnapshot;

companySelect.addEventListener('change', syncCompanyOtherField);

const openEditor = (profile) => {
    const record = records.get(profile.id) ?? {};
    setField('profile-id', profile.id);
    setField('qq-number', profile.qq_number);
    setField('nickname', profile.nickname);
    setField('account-status', profile.account_status);
    setField('role', profile.role);
    setCompanyField(record.company);
    setRankField(record.current_rank);
    setField('promotion-path', record.promotion_path);
    setField('joined-on', record.joined_on);
    setField('member-status', record.member_status || '现役');
    setField('activity-total', record.activity_total ?? 0);
    setField('experience-points', record.experience_points ?? 0);
    setField('training-points', record.training_points ?? 0);
    setField('command-points', record.command_points ?? 0);
    setField('service-points', record.service_points ?? 0);
    setField('achievements', (record.achievements ?? []).join('，'));
    setField('admin-note', '');
    roleField.hidden = currentAdmin.role !== 'super_admin' || profile.id === currentAdmin.id;
    editorMessage.textContent = '';
    editorSnapshot = serializeMemberForm();
    editor.showModal();
};

const saveMemberChanges = async () => {
    const profileId = memberForm.elements['profile-id'].value;
    const activityTotal = numberValue('activity-total');
    const nickname = memberForm.elements.nickname.value.trim();
    if (nickname.length < 2 || nickname.length > 24) {
        editorMessage.textContent = '昵称需要 2–24 个字符。';
        return false;
    }
    const company = companySelect.value === '__other__'
        ? companyOtherInput.value.trim()
        : companySelect.value;
    if (companySelect.value === '__other__' && !company) {
        editorMessage.textContent = '选择“其他连队”后，请填写连队名称。';
        companyOtherInput.focus();
        return false;
    }

    saveButton.disabled = true;
    editorMessage.textContent = '正在保存……';
    const profileChanges = {
        nickname,
        account_status: memberForm.elements['account-status'].value
    };
    if (currentAdmin.role === 'super_admin') profileChanges.role = memberForm.elements.role.value;

    const achievements = memberForm.elements.achievements.value
        .split(/[，,]/)
        .map((value) => value.trim())
        .filter(Boolean);
    const memberChanges = {
        profile_id: profileId,
        company,
        current_rank: memberForm.elements['current-rank'].value.trim(),
        promotion_path: memberForm.elements['promotion-path'].value.trim(),
        joined_on: memberForm.elements['joined-on'].value || null,
        member_status: memberForm.elements['member-status'].value.trim() || '现役',
        activity_total: activityTotal,
        experience_points: numberValue('experience-points'),
        training_points: numberValue('training-points'),
        command_points: numberValue('command-points'),
        service_points: numberValue('service-points'),
        achievements
    };

    const profileResult = await client.from('profiles').update(profileChanges).eq('id', profileId);
    const recordResult = profileResult.error
        ? { error: profileResult.error }
        : await client.from('member_records').upsert(memberChanges, { onConflict: 'profile_id' });

    const note = memberForm.elements['admin-note'].value.trim();
    let noteError = null;
    if (!recordResult.error && note) {
        const result = await client.from('admin_notes').insert({ profile_id: profileId, note, created_by: currentAdmin.id });
        noteError = result.error;
    }
    saveButton.disabled = false;

    if (profileResult.error || recordResult.error || noteError) {
        editorMessage.textContent = '部分资料没有保存，请确认权限和填写内容后重试。';
        return false;
    }
    editorSnapshot = serializeMemberForm();
    editor.close();
    await loadMembers();
    return true;
};

saveButton.addEventListener('click', saveMemberChanges);

const requestEditorClose = async () => {
    if (editorCloseInProgress) return;
    if (!hasUnsavedChanges()) {
        editor.close();
        return;
    }
    if (!unsavedDialog.open) unsavedDialog.showModal();
};

document.querySelectorAll('[data-editor-close]').forEach((button) => {
    button.addEventListener('click', requestEditorClose);
});

memberForm.addEventListener('submit', (event) => event.preventDefault());
editor.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestEditorClose();
});

unsavedDialog.querySelectorAll('[data-unsaved-action]').forEach((button) => {
    button.addEventListener('click', async () => {
        const action = button.dataset.unsavedAction;
        unsavedDialog.close();
        if (action === 'continue') return;
        if (action === 'discard') {
            editor.close();
            return;
        }
        editorCloseInProgress = true;
        await saveMemberChanges();
        editorCloseInProgress = false;
    });
});

refreshButton.addEventListener('click', loadMembers);

const initialize = async () => {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) {
        gate.innerHTML = '请先在<a href="account.html">账户页面</a>登录管理员账户。';
        return;
    }
    const { data: profile } = await client.from('profiles').select('id, nickname, account_status, role').eq('id', session.user.id).single();
    if (!profile || profile.account_status !== 'approved' || !['admin', 'super_admin'].includes(profile.role)) {
        gate.textContent = '当前账户没有管理员权限。';
        return;
    }
    currentAdmin = profile;
    gate.hidden = true;
    consolePanel.hidden = false;
    await loadMembers();
};

initialize();
