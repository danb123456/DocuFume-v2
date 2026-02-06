import { supabase } from './supabase'
import { Envelope, DocStatus } from '../types'

export const db = {
  getEnvelopes: async (): Promise<Envelope[]> => {
    const { data, error } = await supabase
      .from('envelopes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching envelopes:', error)
      return []
    }

    return (data || []) as Envelope[]
  },

  getSigningLinkByToken: async (token: string) => {
    const { data, error } = await supabase
      .from('signing_links')
      .select('*')
      .eq('token', token)
      .single()

    if (error) return null
    return data
  },

  uploadFile: async (
    id: string,
    fileName: string,
    dataUrl: string
  ): Promise<string> => {
    const base64Data = dataUrl.split(',')[1]
    const contentType = dataUrl.split(',')[0].split(':')[1].split(';')[0]

    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: contentType })

    const filePath = `${id}/${fileName}`
    const { error } = await supabase.storage
      .from('documents')
      .upload(filePath, blob, {
        upsert: true,
        contentType
      })

    if (error) throw error

    const {
      data: { publicUrl }
    } = supabase.storage.from('documents').getPublicUrl(filePath)

    return publicUrl
  },

  saveEnvelope: async (envelope: Envelope): Promise<void> => {
    const { error } = await supabase.from('envelopes').upsert({
      id: envelope.id,
      name: envelope.name,
      status: envelope.status,
      created_at: envelope.created_at,
      recipients: envelope.recipients,
      currentOrder: envelope.currentOrder,
      documentUrl: envelope.documentUrl,
      fields: envelope.fields,
      archiveUrl: envelope.archiveUrl
    })

    if (error) throw error
  },

  deleteEnvelope: async (id: string): Promise<void> => {
    try {
      const { data: files, error: listError } = await supabase.storage
        .from('documents')
        .list(id)

      if (!listError && files?.length) {
        const filePaths = files.map(f => `${id}/${f.name}`)
        await supabase.storage.from('documents').remove(filePaths)
      }
    } catch (e) {
      console.warn('Storage cleanup non-critical failure:', e)
    }

    const { error } = await supabase.from('envelopes').delete().eq('id', id)

    if (error) throw error
  },

  getEnvelopeById: async (id: string): Promise<Envelope | null> => {
    const { data, error } = await supabase
      .from('envelopes')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return null
    return data as Envelope
  },

  updateStatus: async (id: string, status: DocStatus): Promise<void> => {
    const { error } = await supabase
      .from('envelopes')
      .update({ status })
      .eq('id', id)

    if (error) throw error
  },

  createSigningLink: async (
    envelopeId: string,
    signerEmail: string
  ): Promise<string> => {
    const token = crypto.randomUUID()

    const { error } = await supabase.from('signing_links').insert({
      envelope_id: envelopeId,
      signer_email: signerEmail,
      token,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24)
    })

    if (error) throw error

    return `${window.location.origin}/sign/${token}`
  }
}
