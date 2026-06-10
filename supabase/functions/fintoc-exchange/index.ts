// Declaramos la variable Deno para que TypeScript en VS Code no muestre errores
declare const Deno: any;

// @ts-ignore - Deno uses URL imports which standard TypeScript doesn't understand
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: any) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { public_token, user_id } = await req.json()
    const FINTOC_SECRET = Deno.env.get('FINTOC_SECRET_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!FINTOC_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing environment variables')
    }

    // 1. Intercambiar token con Fintoc
    const response = await fetch('https://api.fintoc.com/v1/links', {
      method: 'POST',
      headers: {
        'Authorization': FINTOC_SECRET,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ public_token })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Fintoc API error: ${response.status} - ${errorText}`)
    }
    
    const data = await response.json()
    // La API de Fintoc devuelve el campo como 'token' (no 'link_token')
    const link_token = data.token || data.link_token

    // 2. Guardar en tu base de datos de Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    const institution_name = data.institution?.name || 'Banco'
    const { error: dbError } = await supabase.from('user_bank_links').insert({
      user_id,
      fintoc_link_token: link_token,
      fintoc_link_id: data.id,
      institution_name
    })

    if (dbError) {
      throw new Error(`Supabase DB error: ${dbError.message}`)
    }

    return new Response(JSON.stringify({ status: 'linked', bank_name: institution_name }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
