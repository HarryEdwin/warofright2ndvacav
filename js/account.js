const authPanel = document.querySelector('#account-auth');
const loadingPanel = document.querySelector('#account-loading');
const sessionPanel = document.querySelector('#account-session');
const sessionName = document.querySelector('#session-name');
const accountStatus = document.querySelector('#account-status');
const memberProfile = document.querySelector('#member-profile');
const adminEntry = document.querySelector('#admin-entry');
const logoutButton = document.querySelector('#account-logout');
const loginForm = document.querySelector('#login-panel');
const registerForm = document.querySelector('#register-panel');
const tabButtons = [...document.querySelectorAll('[data-account-tab]')];
const passwordToggles = [...document.querySelectorAll('[data-password-toggle]')];
const avatarSettings = document.querySelector('#avatar-settings');
const avatarFile = document.querySelector('#avatar-file');
const avatarSave = document.querySelector('#avatar-save');
const avatarPreview = document.querySelector('#avatar-preview');
const avatarMessage = document.querySelector('#avatar-message');

const client = window.getWorSupabase();
const qqPattern = /^[0-9]{5,12}$/;
const qqToEmail = (qq) => `qq-${qq}@accounts.2ndvacav.org`;
const messageTimers = new WeakMap();
let currentUser = null;
let selectedAvatarFile = null;

const setMessage = (form, message, isSuccess = false) => {
    const messageElement = form.querySelector('.account-message');
    const existingTimer = messageTimers.get(form);
    if (existingTimer) window.clearTimeout(existingTimer);
    messageElement.textContent = message;
    messageElement.classList.toggle('is-success', isSuccess);
    if (message && isSuccess) {
        const timer = window.setTimeout(() => {
            if (messageElement.textContent === message) {
                messageElement.textContent = '';
                messageElement.classList.remove('is-success');
            }
            messageTimers.delete(form);
        }, 8000);
        messageTimers.set(form, timer);
    }
};

const setFormBusy = (form, isBusy) => {
    form.querySelectorAll('input, button').forEach((element) => { element.disabled = isBusy; });
};

const updateAccountLinks = (label = '账户') => {
    document.querySelectorAll('[data-account-link]').forEach((link) => {
        link.textContent = label;
        link.setAttribute('aria-label', label === '账户' ? '登录或申请账户' : `当前账户：${label}`);
    });
    window.dispatchEvent(new CustomEvent('wor:account-updated', { detail: { label } }));
};

const selectTab = (tabName) => {
    setMessage(loginForm, '');
    setMessage(registerForm, '');
    tabButtons.forEach((button) => {
        const isActive = button.dataset.accountTab === tabName;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });
    loginForm.hidden = tabName !== 'login';
    registerForm.hidden = tabName !== 'register';
};

passwordToggles.forEach((button) => {
    button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        const shouldShow = input.type === 'password';
        input.type = shouldShow ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(shouldShow));
        button.setAttribute('aria-label', shouldShow ? '隐藏密码' : '显示密码');
        input.focus({ preventScroll: true });
    });
});

const displayValue = (value, fallback = '尚未填写') => value || fallback;

const renderMemberRecord = (record) => {
    const achievements = record?.achievements?.length ? record.achievements.join('、') : '暂无';
    const fields = [
        ['所属连队', displayValue(record?.company)],
        ['当前军衔', displayValue(record?.current_rank)],
        ['晋升路线', displayValue(record?.promotion_path)],
        ['入队日期', displayValue(record?.joined_on)],
        ['成员状态', displayValue(record?.member_status)],
        ['活动总次数', `${record?.activity_total ?? 0} 次`],
        ['经验', record?.experience_points ?? 0],
        ['训练度', record?.training_points ?? 0],
        ['指挥点', record?.command_points ?? 0],
        ['勤务点', record?.service_points ?? 0],
        ['已获成就', achievements]
    ];

    memberProfile.replaceChildren(...fields.map(([term, value]) => {
        const wrapper = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = term;
        dd.textContent = String(value);
        wrapper.append(dt, dd);
        return wrapper;
    }));
    memberProfile.hidden = false;
};

const showAvatar = async (path) => {
    if (!path) {
        avatarPreview.hidden = true;
        avatarPreview.removeAttribute('src');
        return;
    }
    const { data } = await client.storage.from('member-avatars').createSignedUrl(path, 3600);
    if (data?.signedUrl) {
        avatarPreview.src = data.signedUrl;
        avatarPreview.hidden = false;
    }
};

avatarFile.addEventListener('change', () => {
    const file = avatarFile.files?.[0] ?? null;
    selectedAvatarFile = file;
    avatarMessage.textContent = '';
    avatarSave.disabled = !file;
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        selectedAvatarFile = null;
        avatarSave.disabled = true;
        avatarMessage.textContent = '图片不能超过 2 MB。';
        return;
    }
    avatarPreview.src = URL.createObjectURL(file);
    avatarPreview.hidden = false;
});

avatarSave.addEventListener('click', async () => {
    if (!currentUser || !selectedAvatarFile) return;
    const extension = selectedAvatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${currentUser.id}/avatar.${extension}`;
    avatarSave.disabled = true;
    avatarMessage.textContent = '正在上传头像……';
    const { error: uploadError } = await client.storage
        .from('member-avatars')
        .upload(path, selectedAvatarFile, { upsert: true, contentType: selectedAvatarFile.type });
    const { error: recordError } = uploadError
        ? { error: uploadError }
        : await client.rpc('set_own_avatar_path', { p_avatar_path: path });
    if (uploadError || recordError) {
        avatarMessage.textContent = '头像没有保存，请确认已执行最新数据库更新。';
        avatarSave.disabled = false;
        return;
    }
    selectedAvatarFile = null;
    avatarFile.value = '';
    avatarMessage.textContent = '头像已保存。';
    await showAvatar(path);
});

const showSignedOut = () => {
    loadingPanel.hidden = true;
    sessionPanel.hidden = true;
    authPanel.hidden = false;
    adminEntry.hidden = true;
    memberProfile.hidden = true;
    avatarSettings.hidden = true;
    currentUser = null;
    loginForm.reset();
    registerForm.reset();
    setMessage(loginForm, '');
    setMessage(registerForm, '');
    selectTab('login');
    updateAccountLinks();
};

const loadSignedInAccount = async (user) => {
    currentUser = user;
    loadingPanel.hidden = false;
    authPanel.hidden = true;
    sessionPanel.hidden = true;

    const { data: profile, error } = await client
        .from('profiles')
        .select('id, qq_number, nickname, account_status, role')
        .eq('id', user.id)
        .single();

    if (error || !profile) {
        loadingPanel.textContent = '账户资料尚未建立。请先完成数据库初始化，或稍后刷新页面。';
        return;
    }

    loadingPanel.hidden = true;
    sessionPanel.hidden = false;
    sessionName.textContent = profile.nickname;
    adminEntry.hidden = !['admin', 'super_admin'].includes(profile.role) || profile.account_status !== 'approved';
    memberProfile.hidden = true;
    accountStatus.className = `account-status account-status--${profile.account_status}`;

    const statusCopy = {
        pending: ['申请待审核', '管理员正在依据 QQ 号核验身份。审核通过后即可查看完整成员资料。'],
        rejected: ['申请未通过', '本次申请未获批准。如有疑问，请联系连队管理员核对 QQ 号与身份。'],
        suspended: ['账户已停用', '此账户当前无法使用成员功能，请联系管理员。'],
        approved: ['账户已通过', `身份：${profile.role === 'member' ? '普通成员' : profile.role === 'admin' ? '管理员' : '主管理员'}`]
    };
    const [title, body] = statusCopy[profile.account_status] ?? ['账户状态异常', '请联系管理员处理。'];
    accountStatus.replaceChildren();
    const heading = document.createElement('strong');
    const paragraph = document.createElement('p');
    heading.textContent = title;
    paragraph.textContent = body;
    accountStatus.append(heading, paragraph);

    if (profile.account_status === 'approved') {
        const { data: record } = await client.from('member_records').select('*').eq('profile_id', user.id).maybeSingle();
        const displayName = window.formatWorMemberName?.(profile.nickname, record?.current_rank) || profile.nickname;
        sessionName.textContent = displayName;
        updateAccountLinks(displayName);
        renderMemberRecord(record);
        avatarSettings.hidden = false;
        await showAvatar(record?.avatar_path);
    } else {
        updateAccountLinks(profile.nickname);
    }
};

tabButtons.forEach((button) => {
    button.addEventListener('click', () => selectTab(button.dataset.accountTab));
});

[loginForm, registerForm].forEach((form) => {
    form.addEventListener('input', () => setMessage(form, ''));
});

registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(registerForm, '');

    const qq = registerForm.elements['register-qq'].value.trim();
    const nickname = registerForm.elements['register-name'].value.trim();
    const password = registerForm.elements['register-password'].value;
    const confirmation = registerForm.elements['register-confirm'].value;

    if (!qqPattern.test(qq)) {
        setMessage(registerForm, '请输入 5–12 位数字 QQ 号。');
        return;
    }
    if (nickname.length < 2 || nickname.length > 24) {
        setMessage(registerForm, '社区昵称需要 2–24 个字符。');
        return;
    }
    if (password.length < 8 || password.length > 72) {
        setMessage(registerForm, '密码长度需要在 8–72 个字符之间。');
        return;
    }
    if (password !== confirmation) {
        setMessage(registerForm, '两次输入的密码不一致。');
        return;
    }

    setFormBusy(registerForm, true);
    setMessage(registerForm, '正在提交申请……');
    const { data, error } = await client.functions.invoke('register-qq', {
        body: { qq, nickname, password }
    });
    setFormBusy(registerForm, false);

    if (error) {
        let reason = null;
        try {
            reason = await error.context?.json();
        } catch {
            // Keep the generic message when the function gateway has no JSON response.
        }
        const messages = {
            qq_already_registered: '这个 QQ 号已经申请过账户，请等待审核或联系管理员。',
            nickname_already_registered: '这个昵称已经被使用，请换一个昵称。',
            invalid_qq: '请输入 5–12 位数字 QQ 号。',
            invalid_nickname: '社区昵称需要 2–24 个字符。',
            invalid_password: '密码长度需要在 8–72 个字符之间。',
            origin_not_allowed: '当前页面地址未获准提交账户申请。',
            server_not_configured: '账户申请服务尚未配置完成。'
        };
        setMessage(registerForm, messages[reason?.error] || '账户申请服务暂时不可用，请稍后重试。');
        console.error('QQ registration failed:', reason || error);
        return;
    }

    registerForm.reset();
    setMessage(registerForm, '');
    selectTab('login');
    setMessage(loginForm, data?.status === 'pending'
        ? '申请已经提交，请于QQ通知管理员，管理员审核通过后，请使用 QQ 号和密码登录。'
        : '申请已经提交，请等待管理员审核。', true);
});

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(loginForm, '');

    const qq = loginForm.elements['login-qq'].value.trim();
    const password = loginForm.elements['login-password'].value;
    if (!qqPattern.test(qq) || !password) {
        setMessage(loginForm, '请输入正确的 QQ 号和密码。');
        return;
    }

    setFormBusy(loginForm, true);
    setMessage(loginForm, '正在登录……');
    const { data, error } = await client.auth.signInWithPassword({ email: qqToEmail(qq), password });
    setFormBusy(loginForm, false);

    if (error || !data.user) {
        setMessage(loginForm, 'QQ 号或密码不正确。');
        return;
    }
    loginForm.reset();
    await loadSignedInAccount(data.user);
});

logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    await client.auth.signOut();
    logoutButton.disabled = false;
    showSignedOut();
});

client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) showSignedOut();
});

const initialize = async () => {
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) await loadSignedInAccount(session.user);
    else showSignedOut();
};

initialize();
