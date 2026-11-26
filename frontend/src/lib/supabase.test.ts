
import { describe, expect, it } from 'vitest'
import { supabase } from './supabase'

describe('Configuração Supabase', () => {
  it('cria o cliente Supabase com a configuração definida', () => {
    expect(supabase).toBeDefined()
    expect(supabase.auth).toBeDefined()
    expect(supabase.from).toBeDefined()
  })
})