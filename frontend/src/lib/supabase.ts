
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Configuração do Supabase em falta.')
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)



export async function testSupabaseConnection() {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: supabasePublishableKey,
      },
    })

    if (!response.ok) {
      console.error(
        'Erro na ligação Supabase:',
        response.status,
        await response.text()
      )
      return false
    }

    console.log('Ligação real ao Supabase confirmada!')
    return true
  } catch (error) {
    console.error('Falha na comunicação com Supabase:', error)
    return false
  }
}