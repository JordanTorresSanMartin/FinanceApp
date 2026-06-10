// Declaramos la variable Deno para evitar errores de TypeScript en VS Code
declare const Deno: any;

// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: any) => {
  // Eventos de transacciones que Fintoc puede enviar según su versión de API
  const TRANSACTION_EVENTS = [
    'link.new_transactions',
    'account.transactions_updated',
    'link.refresh_intent.succeeded',
  ]

  try {
    const body = await req.json()
    const { type, data, link_id } = body

    console.log('Webhook recibido:', type, 'para link_id:', link_id)

    // Aceptar cualquiera de los posibles nombres del evento de transacciones
    if (TRANSACTION_EVENTS.includes(type)) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      // 1. Buscar a qué usuario pertenece este link_id
      const { data: linkData, error: linkError } = await supabase
        .from('user_bank_links')
        .select('user_id')
        .eq('fintoc_link_id', link_id)
        .single()

      if (linkError || !linkData) {
        console.error('Link no encontrado para link_id:', link_id)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }

      // 2. Insertar las transacciones — adapta los campos a tu tabla real
      const transactions = Array.isArray(data) ? data : []
      const insertData = transactions.map((tx: any) => ({
        user_id: linkData.user_id,
        amount: Math.abs(tx.amount),
        description: tx.description || tx.memo || 'Sin descripción',
        date: tx.post_date || tx.date,
        category: tx.category?.name || 'Uncategorized',
        type: tx.amount < 0 ? 'expense' : 'income'
      }))

      if (insertData.length > 0) {
        const { error } = await supabase.from('transactions').insert(insertData)
        if (error) console.error('Error insertando transacciones:', error)
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err: any) {
    console.error('Webhook error:', err)
    // Siempre devolvemos 200 para que Fintoc no reintente el webhook
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
})
