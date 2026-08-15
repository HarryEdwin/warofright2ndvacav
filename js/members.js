const directoryClient = window.getWorSupabase();
const directoryGate = document.querySelector('[data-directory-gate]');
const directoryLoading = document.querySelector('[data-directory-loading]');
const directoryBoard = document.querySelector('[data-directory-board]');

const rankOrder = ['新兵', '列兵', '二等兵', '一等兵', '准下士', '下士', '马鞍军士', '中士', '勤务军士', '上士', '军需军士', '军士长', '参谋军士长', '随军牧师', '少尉', '中尉', '上尉'];
const officerRanks = new Set(['少尉', '中尉', '上尉']);
const ncoRanks = new Set(['下士', '马鞍军士', '中士', '勤务军士', '上士', '军需军士', '军士长', '参谋军士长', '随军牧师']);

const text = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
};

const displayValue = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const formatDate = (value) => value
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(`${value}T00:00:00`))
    : '—';

const memberGroup = (record) => {
    if (officerRanks.has(record.current_rank)) return '军官';
    if (ncoRanks.has(record.current_rank)) return '军士';
    return '士兵';
};

const sortMembers = (a, b) => rankOrder.indexOf(b.current_rank) - rankOrder.indexOf(a.current_rank)
    || a.nickname.localeCompare(b.nickname, 'zh-CN');

const createMemberTable = (label, records) => {
    const section = text('section', 'directory-group');
    section.append(text('h3', '', label));
    const scroll = text('div', 'directory-table-scroll');
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['QQ', '军衔', '昵称', '成就', '活动次数', '经验', '训练度', '指挥点', '勤务点', '晋升路线', '入队日期', '状态'].forEach((heading) => {
        headRow.append(text('th', '', heading));
    });
    head.append(headRow);
    const body = document.createElement('tbody');
    records.forEach((record) => {
        const row = document.createElement('tr');
        const values = [
            displayValue(record.qq_number),
            displayValue(record.current_rank, '未设置'),
            record.nickname,
            record.achievements?.length ? record.achievements.join('、') : '—',
            record.activity_total ?? 0,
            record.experience_points ?? 0,
            record.training_points ?? 0,
            record.command_points ?? 0,
            record.service_points ?? 0,
            displayValue(record.promotion_path),
            formatDate(record.joined_on),
            displayValue(record.member_status, '现役')
        ];
        values.forEach((value, index) => row.append(text('td', index === 2 ? 'directory-name' : '', String(value))));
        body.append(row);
    });
    table.append(head, body);
    scroll.append(table);
    section.append(scroll);
    return section;
};

const createCompanySection = (company, records) => {
    const section = text('article', 'directory-company');
    const heading = text('header', 'directory-company__heading');
    heading.append(text('p', 'eyebrow', 'Company Roll'), text('h2', '', company));
    section.append(heading);
    const grouped = new Map([
        ['军官', records.filter((record) => memberGroup(record) === '军官')],
        ['军士', records.filter((record) => memberGroup(record) === '军士')],
        ['士兵', records.filter((record) => memberGroup(record) === '士兵')]
    ]);
    grouped.forEach((members, label) => {
        if (members.length) section.append(createMemberTable(label, members.sort(sortMembers)));
    });
    return section;
};

const companySort = (a, b) => {
    const priority = (company) => {
        if (/团部|staff/i.test(company)) return 0;
        if (company === 'A 连') return 1;
        if (company === 'SC 连') return 2;
        if (!company) return 99;
        return 10;
    };
    return priority(a) - priority(b) || a.localeCompare(b, 'zh-CN');
};

const initializeDirectory = async () => {
    const { data: { session } } = await directoryClient.auth.getSession();
    if (!session?.user) return;
    const { data: profile } = await directoryClient.from('profiles')
        .select('account_status')
        .eq('id', session.user.id)
        .maybeSingle();
    if (profile?.account_status !== 'approved') return;

    directoryGate.hidden = true;
    directoryLoading.hidden = false;
    const { data: records, error } = await directoryClient.rpc('get_company_roster');
    if (error) {
        directoryLoading.textContent = '成员列表暂时无法读取，请确认已执行最新数据库更新。';
        return;
    }

    const companies = new Map();
    (records ?? []).forEach((record) => {
        const company = record.company || '未编制成员';
        if (!companies.has(company)) companies.set(company, []);
        companies.get(company).push(record);
    });
    const sections = [...companies.keys()].sort(companySort).map((company) => createCompanySection(company, companies.get(company)));
    directoryBoard.replaceChildren(...sections);
    if (!sections.length) directoryBoard.append(text('p', 'directory-empty', '目前还没有已审核的成员资料。'));
    directoryLoading.hidden = true;
    directoryBoard.hidden = false;
};

initializeDirectory();
