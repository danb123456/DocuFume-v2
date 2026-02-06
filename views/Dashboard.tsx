
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
  const isConstraintError = error?.toLowerCase().includes('constraint') || error?.toLowerCase().includes('status_check');
  const isColumnError = error?.toLowerCase().includes('column') || error?.toLowerCase().includes('current_order');

  const fixConstraintSql = `
-- FIX: Syncing Registry Status Constraints
-- Run this in your Supabase SQL Editor to allow enterprise status values
ALTER TABLE public.envelopes DROP CONSTRAINT IF EXISTS envelopes_status_check;
ALTER TABLE public.envelopes ADD CONSTRAINT envelopes_status_check CHECK (status IN ('DRAFT', 'PENDING', 'COMPLETED'));
`.trim();

  const fullSchema = `
-- FULL TABLE SETUP (Matches your snake_case visualizer)
CREATE TABLE IF NOT EXISTS public.envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'PENDING', 'COMPLETED')),
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

ALTER TABLE public.envelopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access" ON public.envelopes;
CREATE POLICY "Public access" ON public.envelopes FOR ALL TO anon USING (true) WITH CHECK (true);
`.trim();

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-slate-900 text-white p-12 rounded-[3rem] shadow-2xl border border-slate-700">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center border border-red-500/30">
             <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-3xl inter-black">Registry Conflict Detected</h2>
        </div>

        <p className="text-red-400 font-mono text-sm bg-red-500/10 p-4 rounded-xl mb-8 border border-red-500/20">
          {error || "Unknown synchronization issue."}
        </p>

        {isConstraintError ? (
          <div className="space-y-6">
            <div className="bg-blue-600/10 border border-blue-500/30 p-8 rounded-[2rem] text-center">
              <h3 className="text-xl font-bold mb-4">Status Constraint Mismatch</h3>
              <p className="text-slate-400 text-sm mb-8">Your database only accepts specific status strings (likely lowercase). Run this script to update the registry rules.</p>
              <button 
                onClick={() => { navigator.clipboard.writeText(fixConstraintSql); alert('Fix SQL Copied!'); }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg"
              >
                Copy Status Fix SQL
              </button>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 flex flex-col">
              <h3 className="text-lg font-bold mb-2">Partial Repair</h3>
              <p className="text-slate-400 text-xs mb-6 flex-grow">Use this if only certain columns or constraints are missing.</p>
              <button 
                onClick={() => { navigator.clipboard.writeText(fixConstraintSql); alert('Fix SQL Copied!'); }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all"
              >
                Copy Status Fix
              </button>
            </div>
            <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 flex flex-col">
              <h3 className="text-lg font-bold mb-2">Full Schema Sync</h3>
              <p className="text-slate-400 text-xs mb-6 flex-grow">Reset the registry structure to perfectly match the current app version.</p>
              <button 
                onClick={() => { navigator.clipboard.writeText(fullSchema); alert('Full SQL Copied!'); }}
                className="bg-slate-700 hover:bg-slate-600 text-white font-black py-4 rounded-2xl transition-all"
              >
                Copy Full Schema
              </button>
            </div>
          </div>
        )}
        
        <div className="mt-10 pt-10 border-t border-white/10 text-center">
            <p className="text-slate-400 text-sm mb-6">Run the SQL in Supabase Dashboard, then reconnect.</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white text-slate-900 font-black px-12 py-5 rounded-2xl hover:bg-slate-100 transition-all shadow-2xl"
            >
              Reconnect Registry
            </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
