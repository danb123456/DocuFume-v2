
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { Envelope, DocStatus, FieldType, DocField, Recipient } from '../types';
import { GoogleGenAI } from "@google/genai";

declare const pdfjsLib: any;

const EnvelopeEditor: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [documentImage, setDocumentImage] = useState<string | null>(null);
  const [envelopeName, setEnvelopeName] = useState('Service Agreement - ' + new Date().toLocaleDateString());
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: 'r1', name: '', email: '', order: 1, completed: false }
  ]);
  const [fields, setFields] = useState<DocField[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState('r1');
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>(FieldType.SIGNATURE);
  
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize PDF.js Worker to clear deprecation warning
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setIsSaving(true);
    try {
      if (selected.type === 'application/pdf') {
        const arrayBuffer = await selected.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageImages: HTMLCanvasElement[] = [];
        let totalHeight = 0;
        let maxWidth = 0;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.2 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          pageImages.push(canvas);
          totalHeight += viewport.height;
          maxWidth = Math.max(maxWidth, viewport.width);
        }

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = maxWidth;
        finalCanvas.height = totalHeight;
        const ctx = finalCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, maxWidth, totalHeight);
          let currentY = 0;
          pageImages.forEach(canvas => {
            ctx.drawImage(canvas, (maxWidth - canvas.width) / 2, currentY);
            currentY += canvas.height;
          });
        }
        setDocumentImage(finalCanvas.toDataURL('image/jpeg', 0.85));
        setStep(2);
      } else {
        const reader = new FileReader();
        reader.onload = (re) => {
          setDocumentImage(re.target?.result as string);
          setStep(2);
        };
        reader.readAsDataURL(selected);
      }
    } catch (err) {
      alert("Asset Processing Error: Failed to ingest legal document.");
    } finally {
      setIsSaving(false);
    }
  };

  const addRecipient = () => {
    const nextOrder = recipients.length + 1;
    const id = `r${Date.now()}`;
    setRecipients([...recipients, { id, name: '', email: '', order: nextOrder, completed: false }]);
  };

  const updateRecipient = (id: string, key: keyof Recipient, value: any) => {
    setRecipients(recipients.map(r => r.id === id ? { ...r, [key]: value } : r));
  };

  const addField = (e: React.MouseEvent) => {
    if (step !== 3 || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newField: DocField = {
      id: Math.random().toString(36).substr(2, 9),
      type: selectedFieldType,
      recipientId: selectedRecipientId,
      x,
      y
    };
    setFields([...fields, newField]);
  };

  const saveEnvelope = async () => {
    if (!documentImage) return;
    if (recipients.some(r => !r.email)) return alert("All recipients must have an email.");
    if (fields.length === 0) return alert("Please place at least one field.");
    
    setIsSaving(true);
    try {
      const id = Math.random().toString(36).substr(2, 9);
      const cloudUrl = await db.uploadFile(id, 'master_plate.jpg', documentImage);

      const newEnv: Envelope = {
        id,
        name: envelopeName,
        status: DocStatus.PENDING,
        createdAt: new Date().toISOString(),
        recipients,
        currentOrder: 1,
        documentUrl: cloudUrl,
        fields
      };
      await db.saveEnvelope(newEnv);

      // create signing link for first recipient
      await createSigningLink({
      envelopeId: id,
      signerEmail: recipients.find(r => r.order === 1)!.email
      });

      setStep(4);
    } catch (err: any) {
      alert(`Registry Conflict: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getRecipientLabel = (id: string) => {
    const r = recipients.find(rec => rec.id === id);
    return r ? `${r.name || 'Signer'} (${r.order})` : 'Unknown';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in duration-700">
      {isSaving && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xl flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="inter-black text-white text-xl tracking-tight">Syncing Legal Registry...</p>
        </div>
      )}

      {step <= 3 && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${step >= s ? 'bg-blue-600 text-white scale-110 shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                  {s}
                </div>
                {s < 3 && <div className={`w-8 h-0.5 rounded-full ${step > s ? 'bg-blue-600' : 'bg-slate-100'}`}></div>}
              </div>
            ))}
          </div>
          <div className="text-right">
             <h2 className="text-3xl inter-black text-slate-900 leading-none">
                {step === 1 && "Document Ingestion"}
                {step === 2 && "Workflow Protocol"}
                {step === 3 && "Advanced Tagging"}
             </h2>
             <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">DocuFume Enterprise</p>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="bg-white rounded-[4rem] border-2 border-slate-100 p-20 text-center shadow-2xl relative overflow-hidden group">
          <input type="file" onChange={handleFileUpload} className="hidden" id="file-upload" accept="application/pdf,image/*" />
          <label htmlFor="file-upload" className="cursor-pointer block">
            <div className="w-32 h-32 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 group-hover:scale-110 transition-transform shadow-inner">
              <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h3 className="text-3xl inter-black text-slate-900 mb-2">Upload Legal Asset</h3>
            <p className="text-slate-500 font-medium mb-8 max-w-sm mx-auto">Select a PDF to begin the multi-party signing process.</p>
            <span className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl inline-block transition-transform hover:-translate-y-1">Select Document</span>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-4xl mx-auto space-y-8 bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 animate-in slide-in-from-bottom-8">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Contract Designation</label>
            <input 
              value={envelopeName} 
              onChange={(e) => setEnvelopeName(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl p-5 font-bold text-lg text-slate-900 focus:border-blue-500 focus:bg-white transition-all outline-none"
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Signer Sequence</label>
              <button onClick={addRecipient} className="text-blue-600 font-black text-xs uppercase tracking-widest hover:underline">+ Add Recipient</button>
            </div>
            
            {recipients.map((r, idx) => (
              <div key={r.id} className="grid grid-cols-12 gap-4 items-center bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div className="col-span-1 flex flex-col items-center justify-center">
                   <span className="text-[10px] font-black text-slate-400 mb-1">ORDER</span>
                   <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black">{r.order}</div>
                </div>
                <div className="col-span-4">
                  <input 
                    placeholder="Full Name"
                    value={r.name}
                    onChange={(e) => updateRecipient(r.id, 'name', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-6">
                  <input 
                    placeholder="Email Address"
                    value={r.email}
                    onChange={(e) => updateRecipient(r.id, 'email', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-1">
                  {recipients.length > 1 && (
                    <button onClick={() => setRecipients(recipients.filter(rec => rec.id !== r.id))} className="text-red-400 hover:text-red-600 font-bold p-2">×</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setStep(3)} className="w-full bg-slate-900 text-white font-black py-6 rounded-2xl hover:bg-slate-800 transition-all shadow-2xl">Design Signing Fields</button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-3/4 space-y-4">
            <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between px-8 shadow-xl">
                <div className="flex items-center gap-4">
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Master Asset Plate</span>
                   <div className="h-4 w-px bg-white/10"></div>
                   <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Assigning to: {getRecipientLabel(selectedRecipientId)}</span>
                </div>
            </div>
            <div 
              ref={canvasRef}
              onClick={addField}
              className="relative bg-white shadow-2xl rounded-[2.5rem] overflow-hidden cursor-crosshair border border-slate-200"
            >
              <img src={documentImage!} alt="Document" className="w-full block" />
              {fields.map((field) => (
                <div 
                  key={field.id}
                  style={{ left: `${field.x}%`, top: `${field.y}%` }}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 animate-in zoom-in-50 duration-200 group"
                >
                  <div className={`px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 border-2 ${field.recipientId === selectedRecipientId ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-300'}`}>
                    <div className="flex flex-col">
                       <span className="text-[8px] font-black uppercase tracking-tighter opacity-70">R{recipients.findIndex(r => r.id === field.recipientId) + 1} {field.type.replace('_', ' ')}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setFields(fields.filter(f => f.id !== field.id)); }} className="bg-white/10 hover:bg-white/30 w-4 h-4 flex items-center justify-center rounded-full text-[10px]">×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="lg:w-1/4 space-y-6">
            <div className="bg-white border border-slate-100 p-8 rounded-[3rem] shadow-2xl space-y-8 sticky top-24">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">1. Active Recipient</label>
                <div className="space-y-2">
                  {recipients.map(r => (
                    <button 
                      key={r.id}
                      onClick={() => setSelectedRecipientId(r.id)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex justify-between items-center ${selectedRecipientId === r.id ? 'bg-blue-50 border-blue-500 ring-4 ring-blue-50' : 'bg-white border-slate-100'}`}
                    >
                      <span className={`font-bold text-sm ${selectedRecipientId === r.id ? 'text-blue-700' : 'text-slate-600'}`}>
                        {r.name || 'Signer'}
                      </span>
                      <span className="text-[10px] font-black opacity-40">#{r.order}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">2. Field Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { type: FieldType.SIGNATURE, icon: '✍️' },
                    { type: FieldType.NAME, icon: '👤' },
                    { type: FieldType.TITLE, icon: '💼' },
                    { type: FieldType.DATE_SIGNED, icon: '📅' }
                  ].map(f => (
                    <button 
                      key={f.type}
                      onClick={() => setSelectedFieldType(f.type)}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${selectedFieldType === f.type ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-50 text-slate-500'}`}
                    >
                      <div className="text-xl mb-1">{f.icon}</div>
                      <div className="text-[10px] font-black uppercase tracking-tight">{f.type.replace('_', ' ')}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button onClick={saveEnvelope} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black py-5 rounded-2xl transition-all shadow-xl shadow-emerald-100">Finalize & Send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="max-w-3xl mx-auto text-center animate-in zoom-in-95 duration-500">
           <div className="bg-white rounded-[4rem] p-20 shadow-2xl border border-slate-100">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8">
                 <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-5xl inter-black text-slate-900 mb-4 tracking-tighter">Workflow Initiated</h2>
              <p className="text-slate-500 font-medium mb-12 text-lg">The document sequence is now active. Notification emails have been queued for the first recipient.</p>
              
              <div className="bg-slate-50 p-8 rounded-[3rem] text-left border border-slate-100 space-y-6 mb-12">
                 {recipients.map(r => (
                   <div key={r.id} className="flex items-center gap-6">
                      <div className="w-10 h-10 bg-slate-200 text-slate-600 rounded-xl flex items-center justify-center font-black">{r.order}</div>
                      <div>
                        <p className="font-black text-slate-900 leading-none mb-1">{r.name}</p>
                        <p className="text-xs font-medium text-slate-400">{r.email}</p>
                      </div>
                      {r.order === 1 && <span className="ml-auto bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">Up Now</span>}
                   </div>
                 ))}
              </div>

              <button onClick={() => navigate('/')} className="text-slate-400 font-bold hover:text-slate-900 transition-colors uppercase tracking-widest text-xs">Return to Dashboard Registry</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default EnvelopeEditor;
