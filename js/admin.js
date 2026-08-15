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

let currentAdmin = null;
let profiles = [];
let records = new Map();

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
    if (includeReviewActions) {
        actions.append(
            makeButton('通过', 'admin-button', () => updateStatus(profile, 'approved')),
            makeButton('拒绝', 'admin-button admin-button--danger', () => updateStatus(profile, 'rejected'))
        );
    }
    actions.append(makeButton('编辑资料', 'admin-button admin-button--quiet', () => openEditor(profile)));
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
    setField('attendance-count', record.attendance_count ?? 0);
    setField('activity-total', record.activity_total ?? 0);
    setField('experience-points', record.experience_points ?? 0);
    setField('training-points', record.training_points ?? 0);
    setField('command-points', record.command_points ?? 0);
    setField('service-points', record.service_points ?? 0);
    setField('achievements', (record.achievements ?? []).join('，'));
    setField('admin-note', '');
    roleField.hidden = currentAdmin.role !== 'super_admin';
    editorMessage.textContent = '';
    editor.showModal();
};

saveButton.addEventListener('click', async () => {
    const profileId = memberForm.elements['profile-id'].value;
    const attendanceCount = numberValue('attendance-count');
    const activityTotal = numberValue('activity-total');
    const nickname = memberForm.elements.nickname.value.trim();
    if (nickname.length < 2 || nickname.length > 24) {
        editorMessage.textContent = '昵称需要 2–24 个字符。';
        return;
    }
    if (attendanceCount > activityTotal) {
        editorMessage.textContent = '累计出勤次数不能高于活动总次数。';
        return;
    }
    const company = companySelect.value === '__other__'
        ? companyOtherInput.value.trim()
        : companySelect.value;
    if (companySelect.value === '__other__' && !company) {
        editorMessage.textContent = '选择“其他连队”后，请填写连队名称。';
        companyOtherInput.focus();
        return;
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
        attendance_count: attendanceCount,
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
        return;
    }
    editor.close();
    await loadMembers();
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
