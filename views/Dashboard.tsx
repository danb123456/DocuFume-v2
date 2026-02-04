
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
    
    const confirmed = window.confirm(`DANGER: Are you sure you want to permanently delete "${name}"? This will remove the legal record from the Registry and purge all physical files from Supabase Cloud Storage.`);
    
    if (!confirmed) return;

    setIsDeleting(id);
    try {
      await db.deleteEnvelope(id);
      setEnvelopes(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      console.error('Delete action failed:', err);
      alert(`Deletion Failed!\n\nReason: ${err.message || 'Check your Supabase RLS policies.'}`);
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
    const current = env.recipients?.find(r => r.order === env.currentOrder);
    return current ? current.email : "Unknown";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-16 shimmer rounded-2xl w-full"></div>
        <div className="h-64 shimmer rounded-[3rem] w-full"></div>
      </div>
    );
  }

  if (connectionStatus && !connectionStatus.connected) {
    return <SupabaseSetupGuide error={connectionStatus.error} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end px-4">
        <div>
          <h2 className="text-4xl inter-black text-slate-900 tracking-tight">Legal Registry</h2>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <p className="text-slate-500 font-medium text-sm">Supabase Infrastructure Active</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="bg-white border border-slate-200 px-6 py-3 rounded-2xl text-center shadow-sm">
            <span className="block text-2xl font-black text-slate-900">{envelopes.filter(e => e.status === DocStatus.COMPLETED).length}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Completed</span>
          </div>
          <div className="bg-white border border-slate-200 px-6 py-3 rounded-2xl text-center shadow-sm">
            <span className="block text-2xl font-black text-blue-600">{envelopes.filter(e => e.status === DocStatus.PENDING).length}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">In Workflow</span>
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
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-medium">
                  Registry is currently empty.
                </td>
              </tr>
            ) : envelopes.map((env) => (
              <tr key={env.id} className={`hover:bg-slate-50/50 transition-all ${isDeleting === env.id ? 'opacity-40 bg-red-50' : ''}`}>
                <td className="px-8 py-6">
                  <span className="font-bold text-slate-900">{env.name}</span>
                </td>
                <td className="px-8 py-6">
                  <span className="text-slate-600 font-medium">{getCurrentSigner(env)}</span>
                </td>
                <td className="px-8 py-6">
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(env.status)}`}>
                    {env.status}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <span className="text-slate-400 text-sm font-medium">{new Date(env.createdAt).toLocaleDateString()}</span>
                </td>
                <td className="px-8 py-6">
                  <div className="flex gap-4 items-center">
                    {env.status !== DocStatus.COMPLETED ? (
                      <button 
                        disabled={!!isDeleting}
                        onClick={() => {
                          const url = getPublicSignLink(env.id);
                          navigator.clipboard.writeText(url);
                          alert('Smart Link copied!');
                        }}
                        className="text-blue-600 font-bold text-xs hover:underline disabled:opacity-50"
                      >
                        Copy Link
                      </button>
                    ) : (
                      <a href={env.archiveUrl} target="_blank" rel="noreferrer" className="text-emerald-600 font-bold text-xs hover:underline">
                        View Executed
                      </a>
                    )}
                    <button 
                      disabled={!!isDeleting}
                      onClick={() => handleDelete(env.id, env.name)}
                      className="text-red-400 hover:text-red-600 font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      {isDeleting === env.id ? 'Purging...' : 'Delete'}
                    </button>
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
  const isMissingColumns = error?.toLowerCase().includes('currentorder') || error?.toLowerCase().includes('column');

  const repairSql = `
-- REPAIR SCRIPT: Run this in the Supabase SQL Editor
alter table if exists public.envelopes 
  add column if not exists "currentOrder" integer not null default 1,
  add column if not exists recipients jsonb not null default '[]'::jsonb,
  add column if not exists fields jsonb not null default '[]'::jsonb,
  add column if not exists "archiveUrl" text;

-- Ensure RLS is active
alter table public.envelopes enable row level security;
drop policy if exists "Enable all for anon" on public.envelopes;
create policy "Enable all for anon" on public.envelopes
  for all to anon using (true) with check (true);
`.trim();

  const fullSchema = `
-- FULL TABLE RESET (Run this to start from scratch)
drop table if exists public.envelopes;

create table public.envelopes (
  id text primary key,
  name text not null,
  status text not null,
  "createdAt" timestamp with time zone default now(),
  recipients jsonb not null default '[]'::jsonb,
  "currentOrder" integer not null default 1,
  "documentUrl" text not null,
  fields jsonb not null default '[]'::jsonb,
  "archiveUrl" text
);

alter table public.envelopes enable row level security;
create policy "Enable all for anon" on public.envelopes for all to anon using (true) with check (true);
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
        
        <div className="bg-red-500/10 p-6 rounded-2xl mb-8 border border-red-500/20">
          <p className="text-red-400 font-mono text-sm mb-2 font-bold uppercase tracking-wider">Error Details:</p>
          <p className="text-white font-mono text-xs opacity-80">{error || "Missing structure in Supabase."}</p>
        </div>

        {isMissingColumns ? (
          <div className="space-y-6">
            <div className="bg-blue-600/10 border border-blue-500/30 p-8 rounded-[2rem] flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl mb-4 font-black">!</div>
              <h3 className="text-xl font-bold mb-2">Column Conflict Identified</h3>
              <p className="text-slate-400 text-sm mb-8 max-w-md">Your database table is missing the columns required for multi-signer workflows. Run the repair script below to fix it instantly.</p>
              
              <div className="w-full bg-black/40 p-4 rounded-xl text-left mb-6">
                <pre className="text-[10px] text-blue-300 overflow-x-auto font-mono">{repairSql}</pre>
              </div>

              <button 
                onClick={() => { navigator.clipboard.writeText(repairSql); alert('Repair SQL Copied!'); }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/40"
              >
                Copy Repair SQL
              </button>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
             <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 flex flex-col">
              <h3 className="text-lg font-bold mb-2">Repair Existing</h3>
              <p className="text-slate-400 text-xs mb-6 flex-grow">Add missing columns to your current envelopes table.</p>
              <button 
                onClick={() => { navigator.clipboard.writeText(repairSql); alert('Repair SQL Copied!'); }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all"
              >
                Copy Repair Script
              </button>
            </div>
            
            <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 flex flex-col">
              <h3 className="text-lg font-bold mb-2">Full Migration</h3>
              <p className="text-slate-400 text-xs mb-6 flex-grow">Rebuild the table from scratch (Deletes existing data).</p>
              <button 
                onClick={() => { navigator.clipboard.writeText(fullSchema); alert('Full SQL Copied!'); }}
                className="bg-slate-700 hover:bg-slate-600 text-white font-black py-4 rounded-2xl transition-all"
              >
                Copy Full Reset
              </button>
            </div>
          </div>
        )}
        
        <div className="mt-10 pt-10 border-t border-white/10 text-center">
            <p className="text-slate-400 text-sm mb-6">1. Run the script in Supabase SQL Editor<br/>2. Refresh this page to reconnect.</p>
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
