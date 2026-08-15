const companyClient = window.getWorSupabase();
const companyName = document.body.dataset.company;
const loadingPanel = document.querySelector('[data-roster-loading]');
const rosterContent = document.querySelector('[data-roster-content]');
const officerGrid = document.querySelector('[data-officer-grid]');
const guestbook = document.querySelector('[data-guestbook]');
const guestbookForm = document.querySelector('[data-guestbook-form]');
const guestbookStatus = document.querySelector('[data-guestbook-status]');
const guestbookList = document.querySelector('[data-guestbook-list]');

const honorCatalog = {
    '军团兵': '../assets/content/honor-legionnaire.png',
    '骑士': '../assets/content/honor-medal.png',
    '骑士长官': '../assets/content/honor-cross.png',
    '宿营长官': '../assets/content/honor-staff.png',
    '大队军事护民官': '../assets/content/honor-staff.png',
    '参谋军事护民官': '../assets/content/honor-staff.png',
    '军团总务长官': '../assets/content/honor-staff.png',
    '都督': '../assets/content/honor-staff.png'
};
const commandRankWeight = { '上尉': 3, '中尉': 2, '少尉': 1 };

let viewer = null;
let profileMap = new Map();
const avatarUrlCache = new Map();

const makeElement = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
};

const memberDisplayName = (profile, record) => window.formatWorMemberName?.(profile.nickname, record.current_rank) || profile.nickname;

const signedAvatarUrl = async (path) => {
    if (!path) return null;
    if (avatarUrlCache.has(path)) return avatarUrlCache.get(path);
    const { data } = await companyClient.storage.from('member-avatars').createSignedUrl(path, 3600);
    const url = data?.signedUrl ?? null;
    avatarUrlCache.set(path, url);
    return url;
};

const createOfficerCard = async (record) => {
    const card = makeElement('article', 'roster-officer');
    const portrait = makeElement('div', 'roster-officer__portrait');
    const avatarUrl = await signedAvatarUrl(record.avatar_path);
    if (avatarUrl) {
        const image = document.createElement('img');
        image.src = avatarUrl;
        image.alt = `${record.nickname}的头像`;
        portrait.append(image);
    } else {
        portrait.append(makeElement('span', 'roster-officer__monogram', record.nickname.slice(0, 1).toUpperCase()));
    }

    const content = makeElement('div', 'roster-officer__content');
    content.append(makeElement('h3', '', memberDisplayName(record, record)));
    const honors = makeElement('div', 'officer-honors');
    honors.setAttribute('aria-label', '荣誉勋表');
    (record.achievements ?? []).forEach((achievement) => {
        const item = makeElement('figure', 'officer-honor');
        const image = document.createElement('img');
        image.src = honorCatalog[achievement] ?? '../assets/content/honor-medal.png';
        image.alt = achievement;
        image.title = achievement;
        item.append(image, makeElement('figcaption', '', achievement));
        honors.append(item);
    });
    if (!honors.childElementCount) honors.append(makeElement('span', 'officer-honors__empty', '暂无勋表'));
    content.append(honors);
    card.append(portrait, content);
    return card;
};

const loadPublicOfficers = async () => {
    const { data: officers, error } = await companyClient.rpc('get_public_company_officers', { p_company: companyName });
    if (error) {
        loadingPanel.textContent = '指挥官名单暂时无法读取，请稍后重试。';
        return;
    }
    officerGrid.replaceChildren();
    if (officers?.length) {
        const ranks = [...new Set(officers.map((officer) => officer.current_rank))]
            .sort((a, b) => (commandRankWeight[b] ?? 0) - (commandRankWeight[a] ?? 0));
        for (const rank of ranks) {
            const rowOfficers = officers.filter((officer) => officer.current_rank === rank);
            const row = makeElement('div', 'officer-rank-row');
            row.dataset.rank = rank;
            row.append(...await Promise.all(rowOfficers.map(createOfficerCard)));
            officerGrid.append(row);
        }
    } else {
        officerGrid.append(makeElement('p', 'roster-empty', `${companyName} 暂未设置现任指挥官。`));
    }
    loadingPanel.hidden = true;
    rosterContent.hidden = false;
};

const formatDate = (value) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));

const loadMessages = async () => {
    const { data: messages, error } = await companyClient.from('company_messages')
        .select('id, author_id, company, message, created_at')
        .eq('company', companyName)
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) {
        guestbookList.replaceChildren(makeElement('p', 'roster-empty', '留言暂时无法读取。'));
        return;
    }
    if (!messages?.length) {
        guestbookList.replaceChildren(makeElement('p', 'roster-empty', '还没有留言，来写下第一条吧。'));
        return;
    }
    const entries = await Promise.all(messages.map(async (message) => {
        const author = profileMap.get(message.author_id);
        const record = author?.memberRecord ?? {};
        const item = makeElement('article', 'guestbook-entry');
        const header = makeElement('header');
        const authorBlock = makeElement('div', 'guestbook-entry__author');
        const avatar = makeElement('div', 'guestbook-entry__avatar');
        const avatarUrl = await signedAvatarUrl(record.avatar_path);
        if (avatarUrl) {
            const image = document.createElement('img');
            image.src = avatarUrl;
            image.alt = author ? `${author.nickname}的头像` : '';
            avatar.append(image);
        } else {
            avatar.textContent = author?.nickname?.slice(0, 1).toUpperCase() || '—';
        }
        authorBlock.append(avatar, makeElement('strong', '', author ? memberDisplayName(author, record) : '已离队成员'));
        header.append(authorBlock, makeElement('time', '', formatDate(message.created_at)));
        item.append(header, makeElement('p', '', message.message));
        if (['admin', 'super_admin'].includes(viewer.role)) {
            const deleteButton = makeElement('button', 'guestbook-delete', '删除');
            deleteButton.type = 'button';
            deleteButton.addEventListener('click', async () => {
                if (!window.confirm('确定删除这条留言吗？')) return;
                deleteButton.disabled = true;
                const { error: deleteError } = await companyClient.from('company_messages').delete().eq('id', message.id);
                if (deleteError) {
                    deleteButton.disabled = false;
                    window.alert('留言删除失败，请重试。');
                    return;
                }
                await loadMessages();
            });
            item.append(deleteButton);
        }
        return item;
    }));
    guestbookList.replaceChildren(...entries);
};

guestbookForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!viewer) return;
    const textarea = guestbookForm.elements.message;
    const message = textarea.value.trim();
    if (!message) return;
    const button = guestbookForm.querySelector('button');
    button.disabled = true;
    guestbookStatus.textContent = '正在发布……';
    const { error } = await companyClient.from('company_messages').insert({ author_id: viewer.id, company: companyName, message });
    button.disabled = false;
    if (error) {
        guestbookStatus.textContent = '留言没有发布，请稍后重试。';
        return;
    }
    textarea.value = '';
    guestbookStatus.textContent = '留言已发布。';
    await loadMessages();
});

const loadMemberGuestbook = async () => {
    const { data: { session } } = await companyClient.auth.getSession();
    if (!session?.user) return;
    const { data: currentProfile } = await companyClient.from('profiles')
        .select('id, nickname, account_status, role')
        .eq('id', session.user.id)
        .maybeSingle();
    if (!currentProfile || currentProfile.account_status !== 'approved') return;

    viewer = currentProfile;
    const { data: records, error } = await companyClient.rpc('get_company_roster');
    if (error) return;
    profileMap = new Map((records ?? []).map((record) => [record.profile_id, {
        id: record.profile_id,
        nickname: record.nickname,
        role: record.member_role,
        memberRecord: record
    }]));
    guestbook.hidden = false;
    await loadMessages();
};

const initializeCompany = async () => {
    await loadPublicOfficers();
    await loadMemberGuestbook();
};

initializeCompany();
