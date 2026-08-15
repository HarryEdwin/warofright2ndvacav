window.WOR_SUPABASE_CONFIG = Object.freeze({
    url: 'https://rynynhoicacsbicyyxry.supabase.co',
    publishableKey: 'sb_publishable_Czvp0Q4vkpezQtTKczGDZg_RAcHE6jq'
});

window.getWorSupabase = () => {
    if (!window.supabase?.createClient) {
        throw new Error('Supabase client is not available.');
    }

    if (!window.worSupabase) {
        const { url, publishableKey } = window.WOR_SUPABASE_CONFIG;
        window.worSupabase = window.supabase.createClient(url, publishableKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
    }

    return window.worSupabase;
};
