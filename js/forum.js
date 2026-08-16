const forumClient = window.getWorSupabase?.();
const categoryLabels = {
    announcements: '团部公告',
    events: '活动安排',
    tactics: '战术讨论',
    chat: '成员交流'
};
const forumState = {
    session: null,
    profile: null,
    record: null,
    isAdmin: false,
    category: 'all',
    offset: 0,
    pageSize: 20,
    posts: [],
    currentPost: null
};
const avatarCache = new Map();

const postList = document.querySelector('#post-list');
const forumStatus = document.querySelector('#forum-status');
const loadMoreButton = document.querySelector('#load-more-posts');
const newPostButton = document.querySelector('#new-post-button');
const loginLink = document.querySelector('#forum-login-link');
const postComposer = document.querySelector('#post-composer');
const threadDialog = document.querySelector('#thread-dialog');
const reportDialog = document.querySelector('#report-dialog');
const postForm = document.querySelector('#post-form');
const commentForm = document.querySelector('#comment-form');
const reportForm = document.querySelector('#report-form');

const requestedCategory = new URLSearchParams(window.location.search).get('category');
if (Object.hasOwn(categoryLabels, requestedCategory)) {
    forumState.category = requestedCategory;
    document.querySelectorAll('[data-category]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.category === requestedCategory);
    });
    document.querySelector('#feed-title').textContent = categoryLabels[requestedCategory];
}

const makeElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
};

const formatDate = (value) => new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(new Date(value));

const formatAuthor = (item) => window.formatWorMemberName?.(item.nickname || '成员', item.current_rank) || item.nickname || '成员';
const initials = (name) => [...(name || '?')].slice(0, 1).join('').toUpperCase();

const getAvatarUrl = async (path) => {
    if (!path || !forumState.profile || forumState.profile.account_status !== 'approved') return null;
    if (avatarCache.has(path)) return avatarCache.get(path);
    const { data, error } = await forumClient.storage.from('member-avatars').createSignedUrl(path, 600);
    const url = error ? null : data?.signedUrl;
    avatarCache.set(path, url);
    return url;
};

const createAvatar = (item) => {
    const avatar = makeElement('span', 'forum-avatar', initials(item.nickname));
    if (item.avatar_path) {
        getAvatarUrl(item.avatar_path).then((url) => {
            if (!url || !avatar.isConnected) return;
            const image = new Image();
            image.src = url;
            image.alt = `${item.nickname || '成员'}的头像`;
            avatar.replaceChildren(image);
        });
    }
    return avatar;
};

const appendLinkedText = (container, text) => {
    const urlPattern = /(https?:\/\/[^\s<]+)/giu;
    let lastIndex = 0;
    for (const match of text.matchAll(urlPattern)) {
        if (match.index > lastIndex) container.append(document.createTextNode(text.slice(lastIndex, match.index)));
        const link = makeElement('a', '', match[0]);
        link.href = match[0];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        container.append(link);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) container.append(document.createTextNode(text.slice(lastIndex)));
};

const setFormBusy = (form, busy) => {
    form.querySelectorAll('button, input, select, textarea').forEach((control) => { control.disabled = busy; });
};

const showDialog = (dialog) => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
};

const closeDialog = (dialog) => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
};

const loadViewer = async () => {
    const { data: { session } } = await forumClient.auth.getSession();
    forumState.session = session;
    if (!session?.user) return;
    const [{ data: profile }, { data: record }] = await Promise.all([
        forumClient.from('profiles').select('nickname, account_status, role').eq('id', session.user.id).maybeSingle(),
        forumClient.from('member_records').select('current_rank, avatar_path').eq('profile_id', session.user.id).maybeSingle()
    ]);
    forumState.profile = profile;
    forumState.record = record;
    forumState.isAdmin = profile?.account_status === 'approved' && ['admin', 'super_admin'].includes(profile?.role);
    if (profile?.account_status === 'approved') {
        newPostButton.hidden = false;
        loginLink.hidden = true;
    } else if (profile) {
        loginLink.textContent = '账户等待审核';
    }
    if (forumState.isAdmin) {
        document.querySelector('#moderation-box').hidden = false;
        await loadReports();
    }
};

const renderPostCard = (post) => {
    const card = makeElement('button', `post-card${post.is_pinned ? ' is-pinned' : ''}`);
    card.type = 'button';
    card.dataset.postId = post.id;
    card.append(createAvatar(post));
    const content = makeElement('span', 'post-card__content');
    const badges = makeElement('span', 'post-card__badges');
    badges.append(makeElement('span', 'forum-badge', categoryLabels[post.category] || post.category));
    if (post.is_pinned) badges.append(makeElement('span', 'forum-badge forum-badge--pin', '置顶'));
    if (post.is_locked) badges.append(makeElement('span', 'forum-badge', '已锁定'));
    content.append(badges, makeElement('h3', '', post.title));
    content.append(makeElement('span', 'post-card__excerpt', post.body.replace(/\s+/g, ' ').slice(0, 110)));
    content.append(makeElement('span', 'post-card__meta', `${formatAuthor(post)} · ${formatDate(post.created_at)}`));
    card.append(content, makeElement('span', 'post-card__count', `${post.comment_count || 0} 回复`));
    return card;
};

const loadPosts = async ({ reset = true } = {}) => {
    if (!forumClient) {
        forumStatus.textContent = '论坛服务暂时无法连接。';
        return;
    }
    if (reset) {
        forumState.offset = 0;
        forumState.posts = [];
        postList.replaceChildren();
    }
    forumStatus.hidden = false;
    forumStatus.textContent = '正在读取论坛……';
    loadMoreButton.disabled = true;
    const { data, error } = await forumClient.rpc('get_forum_posts', {
        p_category: forumState.category === 'all' ? null : forumState.category,
        p_offset: forumState.offset,
        p_limit: forumState.pageSize
    });
    loadMoreButton.disabled = false;
    if (error) {
        forumStatus.textContent = error.message.includes('get_forum_posts')
            ? '论坛数据库尚未启用，请管理员先运行论坛 SQL 文件。'
            : `读取失败：${error.message}`;
        return;
    }
    const posts = data || [];
    forumState.posts.push(...posts);
    posts.forEach((post) => postList.append(renderPostCard(post)));
    forumState.offset += posts.length;
    forumStatus.hidden = forumState.posts.length > 0;
    if (!forumState.posts.length) forumStatus.textContent = '这个版块还没有主题，来发布第一篇吧。';
    loadMoreButton.hidden = posts.length < forumState.pageSize;
};

const renderThreadPost = (post) => {
    const container = document.querySelector('#thread-post');
    container.replaceChildren();
    const article = makeElement('section', 'thread-post');
    const badges = makeElement('div', 'post-card__badges');
    badges.append(makeElement('span', 'forum-badge', categoryLabels[post.category] || post.category));
    if (post.is_pinned) badges.append(makeElement('span', 'forum-badge forum-badge--pin', '置顶'));
    if (post.is_locked) badges.append(makeElement('span', 'forum-badge', '已锁定'));
    article.append(badges, makeElement('h2', '', post.title));
    const author = makeElement('div', 'thread-post__author');
    const authorCopy = makeElement('div');
    authorCopy.append(makeElement('strong', '', formatAuthor(post)), makeElement('p', 'thread-meta', formatDate(post.created_at)));
    author.append(createAvatar(post), authorCopy);
    article.append(author);
    const body = makeElement('div', 'thread-post__body');
    appendLinkedText(body, post.body);
    article.append(body);
    if (forumState.profile?.account_status === 'approved') {
        const footer = makeElement('div', 'thread-post__footer');
        const report = makeElement('button', 'forum-text-button', '举报主题');
        report.type = 'button';
        report.dataset.reportType = 'post';
        report.dataset.reportId = post.id;
        footer.append(report);
        article.append(footer);
    }
    container.append(article);

    const adminActions = document.querySelector('#thread-admin-actions');
    adminActions.replaceChildren();
    adminActions.hidden = !forumState.isAdmin;
    if (forumState.isAdmin) {
        const pin = makeElement('button', '', post.is_pinned ? '取消置顶' : '置顶');
        pin.type = 'button'; pin.dataset.moderate = 'pin';
        const lock = makeElement('button', '', post.is_locked ? '解除锁定' : '锁定回复');
        lock.type = 'button'; lock.dataset.moderate = 'lock';
        const remove = makeElement('button', '', '删除主题');
        remove.type = 'button'; remove.dataset.moderate = 'delete';
        adminActions.append(pin, lock, remove);
    }
};

const renderComment = (comment) => {
    const card = makeElement('article', 'comment-card');
    card.append(createAvatar(comment));
    const content = makeElement('div');
    const top = makeElement('div', 'comment-card__top');
    const who = makeElement('div');
    who.append(makeElement('strong', '', formatAuthor(comment)), makeElement('span', 'thread-meta', ` · ${formatDate(comment.created_at)}`));
    top.append(who);
    if (forumState.profile?.account_status === 'approved') {
        const actions = makeElement('div', 'comment-card__actions');
        if (comment.viewer_owns || forumState.isAdmin) {
            const remove = makeElement('button', '', '删除');
            remove.type = 'button'; remove.dataset.deleteComment = comment.id;
            actions.append(remove);
        }
        if (!comment.viewer_owns) {
            const report = makeElement('button', '', '举报');
            report.type = 'button'; report.dataset.reportType = 'comment'; report.dataset.reportId = comment.id;
            actions.append(report);
        }
        top.append(actions);
    }
    const body = makeElement('div', 'comment-body');
    appendLinkedText(body, comment.body);
    content.append(top, body);
    card.append(content);
    return card;
};

const loadComments = async () => {
    const list = document.querySelector('#comment-list');
    list.replaceChildren(makeElement('p', 'forum-status', '正在读取回复……'));
    const { data, error } = await forumClient.rpc('get_forum_comments', { p_post_id: forumState.currentPost.id });
    list.replaceChildren();
    if (error) {
        list.append(makeElement('p', 'forum-status', `回复读取失败：${error.message}`));
        return;
    }
    (data || []).forEach((comment) => list.append(renderComment(comment)));
    if (!data?.length) list.append(makeElement('p', 'forum-status', '暂无回复。'));
    document.querySelector('#thread-comment-count').textContent = `${data?.length || 0} 条`;
};

const updateCommentGate = () => {
    const canComment = forumState.profile?.account_status === 'approved' && !forumState.currentPost.is_locked;
    commentForm.hidden = !canComment;
    const gate = document.querySelector('#comment-gate');
    gate.hidden = canComment;
    gate.textContent = forumState.currentPost.is_locked
        ? '本主题已被管理员锁定，暂时不能继续回复。'
        : '登录并通过管理员审核后即可参与讨论。';
};

const openThread = async (post) => {
    forumState.currentPost = post;
    renderThreadPost(post);
    updateCommentGate();
    showDialog(threadDialog);
    await loadComments();
};

const openReport = (type, id) => {
    reportForm.reset();
    reportForm.elements['target-type'].value = type;
    reportForm.elements['target-id'].value = id;
    document.querySelector('#report-message').textContent = '';
    showDialog(reportDialog);
};

const loadReports = async () => {
    const { data, error } = await forumClient.rpc('get_forum_reports');
    if (error) return;
    const list = document.querySelector('#report-list');
    list.replaceChildren();
    document.querySelector('#report-count').textContent = data?.length || 0;
    (data || []).forEach((report) => {
        const item = makeElement('article', 'report-item');
        item.append(makeElement('strong', '', report.target_excerpt || '已删除内容'));
        item.append(makeElement('p', '', `${report.reporter_nickname}：${report.reason}`));
        const resolve = makeElement('button', '', '标记已处理');
        resolve.type = 'button'; resolve.dataset.resolveReport = report.id;
        item.append(resolve);
        list.append(item);
    });
    if (!data?.length) list.append(makeElement('p', '', '暂无举报。'));
};

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(button.closest('dialog')));
});

document.querySelector('#forum-categories').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    document.querySelectorAll('[data-category]').forEach((item) => item.classList.toggle('is-active', item === button));
    forumState.category = button.dataset.category;
    document.querySelector('#feed-title').textContent = button.querySelector('span').textContent;
    loadPosts();
});

document.querySelector('#refresh-forum').addEventListener('click', () => loadPosts());
loadMoreButton.addEventListener('click', () => loadPosts({ reset: false }));
newPostButton.addEventListener('click', () => {
    postForm.reset();
    postForm.elements.category.value = forumState.category === 'all' ? 'chat' : forumState.category;
    document.querySelector('#post-form-message').textContent = '';
    showDialog(postComposer);
});

postList.addEventListener('click', (event) => {
    const card = event.target.closest('[data-post-id]');
    if (!card) return;
    const post = forumState.posts.find((item) => String(item.id) === card.dataset.postId);
    if (post) openThread(post);
});

postForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#post-form-message');
    const formData = new FormData(postForm);
    setFormBusy(postForm, true);
    message.textContent = '正在发布……';
    const { error } = await forumClient.from('forum_posts').insert({
        author_id: forumState.session.user.id,
        category: formData.get('category'),
        title: formData.get('title'),
        body: formData.get('body')
    });
    setFormBusy(postForm, false);
    if (error) {
        message.textContent = error.message.includes('wait') ? '发布太频繁，请稍等片刻。' : `发布失败：${error.message}`;
        return;
    }
    closeDialog(postComposer);
    await loadPosts();
});

threadDialog.addEventListener('click', async (event) => {
    const report = event.target.closest('[data-report-type]');
    if (report) return openReport(report.dataset.reportType, report.dataset.reportId);
    const deleteComment = event.target.closest('[data-delete-comment]');
    if (deleteComment) {
        if (!window.confirm('确定删除这条回复吗？')) return;
        const { error } = await forumClient.from('forum_comments').delete().eq('id', deleteComment.dataset.deleteComment);
        if (!error) await loadComments();
        return;
    }
    const action = event.target.closest('[data-moderate]')?.dataset.moderate;
    if (!action || !forumState.isAdmin) return;
    if (action === 'delete') {
        if (!window.confirm('确定删除整个主题及其全部回复吗？此操作无法撤销。')) return;
        const { error } = await forumClient.from('forum_posts').delete().eq('id', forumState.currentPost.id);
        if (!error) {
            closeDialog(threadDialog);
            await loadPosts();
            await loadReports();
        }
        return;
    }
    const changes = action === 'pin'
        ? { is_pinned: !forumState.currentPost.is_pinned }
        : { is_locked: !forumState.currentPost.is_locked };
    const { error } = await forumClient.from('forum_posts').update(changes).eq('id', forumState.currentPost.id);
    if (!error) {
        Object.assign(forumState.currentPost, changes);
        renderThreadPost(forumState.currentPost);
        updateCommentGate();
        await loadPosts();
    }
});

commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#comment-message');
    const body = new FormData(commentForm).get('body');
    setFormBusy(commentForm, true);
    message.textContent = '正在发表……';
    const { error } = await forumClient.from('forum_comments').insert({
        post_id: forumState.currentPost.id,
        author_id: forumState.session.user.id,
        body
    });
    setFormBusy(commentForm, false);
    if (error) {
        message.textContent = error.message.includes('wait') ? '回复太频繁，请稍等片刻。' : `发表失败：${error.message}`;
        return;
    }
    commentForm.reset();
    message.textContent = '';
    await loadComments();
    await loadPosts();
});

reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(reportForm);
    const type = formData.get('target-type');
    const payload = {
        reporter_id: forumState.session.user.id,
        reason: formData.get('reason'),
        post_id: type === 'post' ? formData.get('target-id') : null,
        comment_id: type === 'comment' ? formData.get('target-id') : null
    };
    const message = document.querySelector('#report-message');
    setFormBusy(reportForm, true);
    message.textContent = '正在提交……';
    const { error } = await forumClient.from('forum_reports').insert(payload);
    setFormBusy(reportForm, false);
    if (error) {
        message.textContent = error.code === '23505' ? '你已经举报过这项内容。' : `提交失败：${error.message}`;
        return;
    }
    message.textContent = '举报已提交，管理员会进行处理。';
    setTimeout(() => closeDialog(reportDialog), 800);
    if (forumState.isAdmin) await loadReports();
});

document.querySelector('#report-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-resolve-report]');
    if (!button) return;
    const { error } = await forumClient.from('forum_reports').delete().eq('id', button.dataset.resolveReport);
    if (!error) await loadReports();
});

(async () => {
    if (!forumClient) {
        forumStatus.textContent = '论坛服务暂时无法连接。';
        return;
    }
    await loadViewer();
    await loadPosts();
})();
