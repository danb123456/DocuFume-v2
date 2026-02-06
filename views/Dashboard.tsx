
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { testConnection } from '../services/supabase';
import { Envelope, DocStatus } from '../types';

const Dashboard: React.FC = () => {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; error: string | null } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const status = await testConnection();
      setConnectionStatus(status);

      if (status.connected) {
        const data = await db.getEnvelopes();
        setEnvelopes(data);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const getPublicSignLink = (id: string) => {
    let base = window.location.href.split('#')[0];
    if (base.startsWith('blob:')) base = base.substring(5);
    if (base.endsWith('index.html')) base = base.substring(0, base.lastIndexOf('/') + 1);
    if (!base.endsWith('/')) base += '/';
    return `${base}#/sign/${id}`;
  };

  const handleDelete = async (id: string, name: string) => {
    if (isDeleting) return;
    const confirmed = window.confirm(`DANGER: Are you sure you want to permanently delete "${name}"?`);
    if (!confirmed) return;

    setIsDeleting(id);
    try {
      await db.deleteEnvelope(id);
      setEnvelopes(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      console.error('Delete action failed:', err);
      alert(`Deletion Failed: ${err.message}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const getStatusColor = (status: DocStatus) => {
    switch (status) {
      case DocStatus.COMPLETED: return 'bg-emerald-100 text-emerald-700';
      case DocStatus.PENDING: return 'bg-amber-100 text-amber-700';
      case DocStatus.DRAFT: return 'bg-slate-100 text-slate-700';
    }
  };

  const getCurrentSigner = (env: Envelope) => {
    if (env.status === DocStatus.COMPLETED) return "All Signed";
    const current = env.recipients?.find(r => r.order === env.current_order);
    return current ? current.email : "Unknown";
  };

  if (loading) return <div className="space-y-6"><div className="h-16 shimmer rounded-2xl w-full"></div><div className="h-64 shimmer rounded-[3rem] w-full"></div></div>;
  if (connectionStatus && !connectionStatus.connected) return <SupabaseSetupGuide error={connectionStatus.error} />;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end px-4">
        <div>
          <h2 className="text-4xl inter-black text-slate-900 tracking-tight">Legal Registry</h2>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <p className="text-slate-500 font-medium text-sm">Registry Sync Active</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 mx-4">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Document</th>
              <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Current Signer</th>
              <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Created</th>
              <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {envelopes.length === 0 ? (
              <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-400">Registry is empty.</td></tr>
            ) : envelopes.map((env) => (
              <tr key={env.id} className={`hover:bg-slate-50/50 transition-all ${isDeleting === env.id ? 'opacity-40 bg-red-50' : ''}`}>
                <td className="px-8 py-6 font-bold text-slate-900">{env.name}</td>
                <td className="px-8 py-6 text-slate-600">{getCurrentSigner(env)}</td>
                <td className="px-8 py-6">
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(env.status)}`}>{env.status}</span>
                </td>
                <td className="px-8 py-6 text-slate-400 text-sm">{new Date(env.created_at).toLocaleDateString()}</td>
                <td className="px-8 py-6">
                  <div className="flex gap-4">
                    {env.status !== DocStatus.COMPLETED ? (
                      <button onClick={() => { navigator.clipboard.writeText(getPublicSignLink(env.id)); alert('Link copied!'); }} className="text-blue-600 font-bold text-xs">Copy Link</button>
                    ) : (
                      <a href={env.archive_url} target="_blank" rel="noreferrer" className="text-emerald-600 font-bold text-xs">View Executed</a>
                    )}
                    <button onClick={() => handleDelete(env.id, env.name)} className="text-red-400 font-bold text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SupabaseSetupGuide: React.FC<{ error: string | null }> = ({ error }) => {
  const fullSchema = `
-- COPY & RUN IN SUPABASE SQL EDITOR
CREATE TABLE IF NOT EXISTS public.envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_order integer NOT NULL DEFAULT 1,
  document_url text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  archive_url text
);

CREATE TABLE IF NOT EXISTS public.signing_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid REFERENCES public.envelopes(id) ON DELETE CASCADE,
  signer_email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.envelopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access" ON public.envelopes;
CREATE POLICY "Public access" ON public.envelopes FOR ALL TO anon USING (true) WITH CHECK (true);
`.trim();

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-slate-900 text-white p-12 rounded-[3rem] shadow-2xl border border-slate-700">
        <h2 className="text-3xl inter-black mb-6">Database Schema Mismatch</h2>
        <p className="text-red-400 font-mono text-sm bg-red-500/10 p-4 rounded-xl mb-8 border border-red-500/20">{error}</p>
        <button onClick={() => { navigator.clipboard.writeText(fullSchema); alert('SQL Copied!'); }} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl mb-6">Copy Correct Schema SQL</button>
        <button onClick={() => window.location.reload()} className="w-full bg-white text-slate-900 font-black py-5 rounded-2xl">Reconnect Registry</button>
      </div>
    </div>
  );
};

export default Dashboard;
