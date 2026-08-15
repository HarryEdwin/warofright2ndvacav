import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins = new Set([
  'https://2ndvacav.org',
  'https://www.2ndvacav.org',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://2ndvacav.org',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
})

const respond = (origin: string | null, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }
  if (request.method !== 'POST') {
    return respond(origin, 405, { error: 'method_not_allowed' })
  }
  if (!origin || !allowedOrigins.has(origin)) {
    return respond(origin, 403, { error: 'origin_not_allowed' })
  }

  let payload: { qq?: unknown; nickname?: unknown; password?: unknown }
  try {
    payload = await request.json()
  } catch {
    return respond(origin, 400, { error: 'invalid_request' })
  }

  const qq = String(payload.qq ?? '').trim()
  const nickname = String(payload.nickname ?? '').trim()
  const password = String(payload.password ?? '')

  if (!/^[0-9]{5,12}$/.test(qq)) {
    return respond(origin, 400, { error: 'invalid_qq' })
  }
  if (nickname.length < 2 || nickname.length > 24) {
    return respond(origin, 400, { error: 'invalid_nickname' })
  }
  if (password.length < 8 || password.length > 72) {
    return respond(origin, 400, { error: 'invalid_password' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return respond(origin, 500, { error: 'server_not_configured' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('qq_number', qq)
    .maybeSingle()

  if (existingProfile) {
    return respond(origin, 409, { error: 'qq_already_registered' })
  }

  const escapedNickname = nickname.replace(/[\\%_]/g, (character) => `\\${character}`)
  const { data: existingNickname } = await admin
    .from('profiles')
    .select('id')
    .ilike('nickname', escapedNickname)
    .maybeSingle()

  if (existingNickname) {
    return respond(origin, 409, { error: 'nickname_already_registered' })
  }

  const { error } = await admin.auth.admin.createUser({
    email: `qq-${qq}@accounts.2ndvacav.org`,
    password,
    email_confirm: false,
    user_metadata: { qq_number: qq, nickname },
  })

  if (error) {
    const duplicate = /already|registered|exists/i.test(error.message)
    return respond(origin, duplicate ? 409 : 500, {
      error: duplicate ? 'qq_already_registered' : 'registration_failed',
    })
  }

  return respond(origin, 201, { ok: true, status: 'pending' })
})
