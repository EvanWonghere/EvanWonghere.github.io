import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { createHandler } from './core.mjs';
import { assessDetail } from './sdk.ts';
const env = (name: string) => Deno.env.get(name) ?? '';

const handler = createHandler({
    env,
    assessDetail,
    authenticate: async (token: string) => {
        const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
        const auth = await client.auth.getUser(token);
        if (auth.error || !auth.data.user) return { user: false, admin: false };
        const access = await client.rpc('is_app_admin');
        return { user: true, admin: !access.error && access.data === true };
    },
});
Deno.serve(handler);
