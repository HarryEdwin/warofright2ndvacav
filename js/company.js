const companyClient = window.getWorSupabase();
const companyName = document.body.dataset.company;
const guestPanel = document.querySelector('[data-roster-guest]');
const loadingPanel = document.querySelector('[data-roster-loading]');
const rosterContent = document.querySelector('[data-roster-content]');
const officerGrid = document.querySelector('[data-officer-grid]');
const enlistedGrid = document.querySelector('[data-enlisted-grid]');
const guestbook = document.querySelector('[data-guestbook]');
const guestbookForm = document.querySelector('[data-guestbook-form]');
const guestbookStatus = document.querySelector('[data-guestbook-status]');
const guestbookList = document.querySelector('[data-guestbook-list]');
const memberDetail = document.querySelector('[data-member-detail]');
const memberDetailContent = document.querySelector('[data-member-detail-content]');
const memberDetailClose = document.querySelector('[data-member-detail-close]');

const officerRanks = new Set(['少尉', '中尉', '上尉']);
const rankOrder = ['新兵', '列兵', '二等兵', '一等兵', '准下士', '下士', '马鞍军士', '中士', '勤务军士', '上士', '军需军士', '军士长', '参谋军士长', '随军牧师', '少尉', '中尉', '上尉'];
let viewer = null;
let profileMap = new Map();

const makeElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
};

const memberDisplayName = (profile, record) => window.formatWorMemberName?.(profile.nickname, record.current_rank) || profile.nickname;

const signedAvatarUrl = async (path) => {
    if (!path) return null;
    const { data } = await companyClient.storage.from('member-avatars').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
};

const detailValue = (label, value, formatter = String) => {
    if (value === null || value === undefined || value === '') return null;
    const wrapper = makeElement('div', 'member-detail__field');
    wrapper.append(makeElement('dt', '', label), makeElement('dd', '', formatter(value)));
    return wrapper;
};

const openMemberDetail = async (profile, record) => {
    const isOfficer = officerRanks.has(record.current_rank);
    const heading = makeElement('header', 'member-detail__heading');
    if (isOfficer) {
        const portrait = makeElement('div', 'member-detail__portrait');
        const avatarUrl = await signedAvatarUrl(record.avatar_path);
        if (avatarUrl) {
            const image = document.createElement('img');
            image.src = avatarUrl;
            image.alt = `${profile.nickname}的头像`;
            portrait.append(image);
        } else {
            portrait.append(makeElement('span', '', profile.nickname.slice(0, 1).toUpperCase()));
        }
        heading.append(portrait);
    }
    const identity = makeElement('div');
    identity.append(
        makeElement('p', 'eyebrow', 'Member Record'),
        makeElement('h2', '', memberDisplayName(profile, record)),
        makeElement('p', 'member-detail__rank', record.current_rank || '军衔未设置')
    );
    identity.querySelector('h2').id = 'member-detail-name';
    heading.append(identity);

    const fields = [
        detailValue('所属连队', record.company),
        detailValue('成员状态', record.member_status || '现役'),
        detailValue('QQ 号', record.qq_number),
        detailValue('晋升路线', record.promotion_path),
        detailValue('入队日期', record.joined_on, (value) => formatDate(`${value}T00:00:00`)),
        detailValue('活动总次数', record.activity_total, (value) => `${value} 次`),
        detailValue('经验', record.experience_points),
        detailValue('训练度', record.training_points),
        detailValue('指挥点', record.command_points),
        detailValue('勤务点', record.service_points),
        detailValue('已获成就', record.achievements?.length ? record.achievements.join('、') : null)
    ].filter(Boolean);
    const details = makeElement('dl', 'member-detail__fields');
    details.append(...fields);
    memberDetailContent.replaceChildren(heading, details);
    if (fields.length <= 2) {
        memberDetailContent.append(makeElement('p', 'member-detail__private', '该成员暂未公开更多资料。'));
    }
    memberDetail.showModal();
};

memberDetailClose.addEventListener('click', () => memberDetail.close());
memberDetail.addEventListener('click', (event) => {
    if (event.target === memberDetail) memberDetail.close();
});

const createOfficerCard = async ({ profile, record }) => {
    const card = makeElement('button', 'roster-officer');
    card.type = 'button';
    card.setAttribute('aria-label', `查看${profile.nickname}的成员档案`);
    const portrait = makeElement('div', 'roster-officer__portrait');
    const avatarUrl = await signedAvatarUrl(record.avatar_path);
    if (avatarUrl) {
        const image = document.createElement('img');
        image.src = avatarUrl;
        image.alt = `${profile.nickname}的头像`;
        portrait.append(image);
    } else {
        portrait.append(makeElement('span', 'roster-officer__monogram', profile.nickname.slice(0, 1).toUpperCase()));
    }
    const content = makeElement('div', 'roster-officer__content');
    content.append(
        makeElement('p', 'roster-rank', record.current_rank || '军衔未设置'),
        makeElement('h3', '', memberDisplayName(profile, record)),
        makeElement('p', 'roster-status', record.member_status || '现役')
    );
    const ribbons = makeElement('div', 'ribbon-rack');
    ribbons.setAttribute('aria-label', '荣誉勋表');
    const achievements = record.achievements ?? [];
    if (achievements.length) {
        achievements.forEach((achievement, index) => {
            const ribbon = makeElement('span', `ribbon ribbon--${(index % 5) + 1}`);
            ribbon.title = achievement;
            ribbons.append(ribbon);
        });
    } else {
        ribbons.append(makeElement('span', 'ribbon-rack__empty', '暂无勋表'));
    }
    content.append(ribbons);
    card.append(portrait, content);
    card.addEventListener('click', () => openMemberDetail(profile, record));
    return card;
};

const createEnlistedCard = ({ profile, record }) => {
    const card = makeElement('button', 'roster-enlisted');
    card.type = 'button';
    card.setAttribute('aria-label', `查看${profile.nickname}的成员档案`);
    card.append(
        makeElement('span', 'roster-enlisted__rank', record.current_rank || '军衔未设置'),
        makeElement('strong', '', memberDisplayName(profile, record))
    );
    card.addEventListener('click', () => openMemberDetail(profile, record));
    return card;
};

const renderRoster = async (profiles, records) => {
    const members = records
        .filter((record) => record.company === companyName && profileMap.has(record.profile_id))
        .map((record) => ({ profile: profileMap.get(record.profile_id), record }))
        .sort((a, b) => rankOrder.indexOf(b.record.current_rank) - rankOrder.indexOf(a.record.current_rank)
            || a.profile.nickname.localeCompare(b.profile.nickname, 'zh-CN'));
    const officers = members.filter(({ record }) => officerRanks.has(record.current_rank));
    const enlisted = members.filter(({ record }) => !officerRanks.has(record.current_rank));

    officerGrid.replaceChildren();
    enlistedGrid.replaceChildren();
    if (officers.length) {
        officerGrid.append(makeElement('h3', 'roster-group-title', '军官席'));
        const cards = await Promise.all(officers.map(createOfficerCard));
        officerGrid.append(...cards);
    }
    if (enlisted.length) {
        enlistedGrid.append(makeElement('h3', 'roster-group-title', '士兵名册'));
        enlistedGrid.append(...enlisted.map(createEnlistedCard));
    }
    if (!members.length) {
        enlistedGrid.append(makeElement('p', 'roster-empty', `目前尚未编入 ${companyName} 的成员。`));
    }
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
    guestbookList.replaceChildren(...messages.map((message) => {
        const author = profileMap.get(message.author_id);
        const record = author?.memberRecord ?? {};
        const item = makeElement('article', 'guestbook-entry');
        const header = makeElement('header');
        header.append(
            makeElement('strong', '', author ? memberDisplayName(author, record) : '已离队成员'),
            makeElement('time', '', formatDate(message.created_at))
        );
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
};

guestbookForm.addEventListener('submit', async (event) => {
    event.preventDefault();
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

const initializeCompany = async () => {
    const { data: { session } } = await companyClient.auth.getSession();
    if (!session?.user) return;
    const { data: currentProfile } = await companyClient.from('profiles')
        .select('id, nickname, account_status, role')
        .eq('id', session.user.id)
        .maybeSingle();
    if (!currentProfile || currentProfile.account_status !== 'approved') return;

    viewer = currentProfile;
    guestPanel.hidden = true;
    loadingPanel.hidden = false;
    const { data: rosterRows, error: rosterError } = await companyClient.rpc('get_company_roster');
    if (rosterError) {
        loadingPanel.textContent = '花名册暂时无法读取，请确认已执行最新数据库更新。';
        return;
    }
    const records = rosterRows ?? [];
    profileMap = new Map(records.map((record) => [record.profile_id, {
        id: record.profile_id,
        nickname: record.nickname,
        role: record.member_role,
        memberRecord: record
    }]));
    records.forEach((record) => {
        const profile = profileMap.get(record.profile_id);
        if (profile) profile.memberRecord = record;
    });
    await renderRoster([...profileMap.values()], records);
    loadingPanel.hidden = true;
    rosterContent.hidden = false;
    guestbook.hidden = false;
    await loadMessages();
};

initializeCompany();
