
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { Envelope, DocStatus, FieldType, Recipient, DocField } from '../types';

const SigningView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [currentRecipient, setCurrentRecipient] = useState<Recipient | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isAdopting, setIsAdopting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isCompleted, setIsCompleted] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
  const load = async () => {
    if (!token) return;

    // 1. Resolve signing link
    const link = await db.getSigningLinkByToken(token);
    if (!link) {
      alert('This signing link is invalid or expired.');
      return;
    }

    // 2. Load envelope
    const data = await db.getEnvelopeById(link.envelope_id);
    if (data) setEnvelope(data);
  };

  load();
}, [token]);


  const verifyIdentity = () => {
    if (!envelope) return;
    const recipient = envelope.recipients.find(r => r.email.toLowerCase() === emailInput.toLowerCase());
    
    if (!recipient) {
      alert("Email not recognized in this legal workflow.");
      return;
    }

    if (recipient.order !== envelope.currentOrder) {
      alert(`It is not your turn to sign yet. Current signer: ${envelope.recipients.find(r => r.order === envelope.currentOrder)?.name}`);
      return;
    }

    if (recipient.completed) {
      alert("You have already completed your portion of this agreement.");
      return;
    }

    setCurrentRecipient(recipient);
    setIsVerified(true);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDrawing = () => isDrawing.current = false;

  const clearCanvas = () => {
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, 800, 400);
  };

  const adoptSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL());
      setIsAdopting(false);
    }
  };

  const finishSigning = async () => {
    if (!envelope || !currentRecipient || !signatureData) return;
    
    // Check if all assigned fields are filled
    const assignedFields = envelope.fields.filter(f => f.recipientId === currentRecipient.id);
    const unfulfilled = assignedFields.some(f => f.type !== FieldType.SIGNATURE && !fieldValues[f.id]);
    if (unfulfilled) return alert("Please fill in all assigned fields.");

    setIsSaving(true);
    try {
      // Composition Pipeline
      const mainImg = new Image();
      mainImg.crossOrigin = "anonymous";
      mainImg.src = envelope.documentUrl;
      await new Promise(r => mainImg.onload = r);

      const canvas = document.createElement('canvas');
      canvas.width = mainImg.width;
      canvas.height = mainImg.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Composition context failed");

      // Layer 1: Master Plate
      ctx.drawImage(mainImg, 0, 0);

      // Layer 2: Existing completed fields (if any)
      // For now we assume we are flattening sequentially, but we also update DocFields metadata
      
      // Layer 3: New Signature and Text fields for THIS recipient
      const sigImg = new Image();
      sigImg.src = signatureData;
      await new Promise(r => sigImg.onload = r);

      const updatedFields = envelope.fields.map(f => {
        if (f.recipientId === currentRecipient.id) {
          const x = (f.x / 100) * canvas.width;
          const y = (f.y / 100) * canvas.height;

          if (f.type === FieldType.SIGNATURE) {
            ctx.drawImage(sigImg, x - 150, y - 75, 300, 150);
            return { ...f, value: '[SIGNED]', signedAt: new Date().toISOString() };
          } else {
            const text = f.type === FieldType.DATE_SIGNED ? new Date().toLocaleDateString() : fieldValues[f.id];
            ctx.font = "bold 42px 'Inter', sans-serif";
            ctx.fillStyle = "#000000";
            ctx.fillText(text, x - 50, y + 10);
            return { ...f, value: text, signedAt: new Date().toISOString() };
          }
        }
        return f;
      });

      const finalImage = canvas.toDataURL('image/jpeg', 0.9);
      const signedUrl = await db.uploadFile(envelope.id, `executed_order_${currentRecipient.order}.jpg`, finalImage);

      // Update envelope state
      const nextOrder = envelope.currentOrder + 1;
      const updatedRecipients = envelope.recipients.map(r => r.id === currentRecipient.id ? { ...r, completed: true } : r);
      const isLastSigner = nextOrder > envelope.recipients.length;

      await db.saveEnvelope({
        ...envelope,
        status: isLastSigner ? DocStatus.COMPLETED : DocStatus.PENDING,
        currentOrder: nextOrder,
        documentUrl: signedUrl,
        recipients: updatedRecipients,
        fields: updatedFields,
        archiveUrl: isLastSigner ? signedUrl : envelope.archiveUrl 
      });

      setIsCompleted(true);
    } catch (err) {
      alert('Execution Failure: Agreement could not be finalized.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isVerified) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center animate-in zoom-in-95 duration-500">
        <div className="bg-white p-16 rounded-[4rem] shadow-2xl border border-slate-100">
          <div className="w-20 h-20 bg-blue-100 rounded-3xl flex items-center justify-center mx-auto mb-8 text-blue-600 shadow-inner">
             <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h2 className="text-3xl inter-black text-slate-900 mb-2">Secure Verification</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-10">Enter email to access legal workflow</p>
          <input 
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-5 mb-6 font-bold text-center outline-none focus:border-blue-500 transition-all"
            placeholder="yourname@example.com"
          />
          <button 
            onClick={verifyIdentity}
            className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-slate-800 transition-all"
          >
            Access Document
          </button>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center animate-in zoom-in-95 duration-500">
        <div className="bg-white p-16 rounded-[4rem] shadow-2xl border border-slate-100">
          <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-8 text-emerald-600 shadow-inner">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-3xl inter-black text-slate-900 mb-4">Portion Complete</h2>
          <p className="text-slate-500 font-medium mb-12">You have successfully signed. The workflow will now notify the next recipient in the sequence.</p>
          <button onClick={() => navigate('/')} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-slate-800 transition-all">Exit Portal</button>
        </div>
      </div>
    );
  }

  if (!envelope || !currentRecipient) return <div className="p-32 text-center text-slate-400 font-black uppercase tracking-widest text-xs animate-pulse">Syncing...</div>;

  return (
    <div className="max-w-6xl mx-auto pb-32 animate-in fade-in duration-1000">
      {isSaving && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-xl flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="inter-black text-white text-xl">Flattening Document Layers...</p>
        </div>
      )}

      <div className="bg-white/90 border border-slate-100 p-8 rounded-[3rem] shadow-2xl mb-12 flex flex-col md:flex-row justify-between items-center gap-8 sticky top-4 z-40 backdrop-blur-md">
        <div className="flex items-center gap-5">
           <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white font-black text-lg">R{currentRecipient.order}</span>
           </div>
           <div>
              <h2 className="text-2xl inter-black text-slate-900 tracking-tight leading-none mb-1">Signer Action Required</h2>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Active Recipient: <span className="text-slate-900">{currentRecipient.name}</span></p>
           </div>
        </div>
        <div className="flex gap-4">
          {!signatureData ? (
            <button onClick={() => setIsAdopting(true)} className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-blue-500 transition-all">Capture Signature</button>
          ) : (
            <button onClick={finishSigning} className="bg-emerald-500 text-slate-900 px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-emerald-400 transition-all">Submit & Finalize</button>
          )}
        </div>
      </div>

      <div className="relative bg-white shadow-2xl rounded-[3rem] overflow-hidden border border-slate-100 p-4 md:p-12">
        <div className="relative">
          <img src={envelope.documentUrl} alt="Document" className="w-full block rounded-xl" />
          {envelope.fields.map((field) => {
            const isAssigned = field.recipientId === currentRecipient.id;
            
            return (
              <div 
                key={field.id}
                style={{ left: `${field.x}%`, top: `${field.y}%` }}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
              >
                {field.type === FieldType.SIGNATURE ? (
                  !signatureData ? (
                    <div className={`px-12 py-6 rounded-2xl shadow-2xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap backdrop-blur-md border-2 border-dashed ${isAssigned ? 'bg-blue-600/10 border-blue-600 text-blue-600 animate-pulse' : 'bg-slate-100 border-slate-200 text-slate-300'}`}>
                      {isAssigned ? 'Place Signature' : 'Reserved'}
                    </div>
                  ) : (
                    isAssigned ? (
                      <div className="animate-in fade-in zoom-in-75 duration-300">
                         <img src={signatureData} className="w-56 h-28 object-contain pointer-events-none" alt="Signature" />
                         <div className="h-0.5 bg-slate-400 w-full mt-1 opacity-50"></div>
                      </div>
                    ) : (
                      <div className="bg-slate-100 border border-slate-200 text-slate-300 px-12 py-6 rounded-2xl">Reserved</div>
                    )
                  )
                ) : (
                  <div className="relative group">
                    {field.type === FieldType.DATE_SIGNED ? (
                      <div className={`px-6 py-3 rounded-xl border-2 font-bold text-sm ${isAssigned ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                        {isAssigned ? new Date().toLocaleDateString() : 'Auto-Date'}
                      </div>
                    ) : (
                      isAssigned ? (
                        <input 
                          placeholder={field.type.replace('_', ' ')}
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => setFieldValues({ ...fieldValues, [field.id]: e.target.value })}
                          className="px-6 py-3 rounded-xl border-2 border-blue-600 bg-blue-50 text-blue-900 font-bold text-sm outline-none focus:ring-4 ring-blue-100 w-48 shadow-xl"
                        />
                      ) : (
                        <div className="px-6 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-slate-300 font-bold text-sm w-48">
                          {field.type.replace('_', ' ')}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isAdopting && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-[4rem] p-16 w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom-12 duration-300">
            <h3 className="text-4xl inter-black text-slate-900 mb-2">Legal Execution</h3>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-12">Recpient {currentRecipient.order}: {currentRecipient.name}</p>
            
            <div className="bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] overflow-hidden mb-12 shadow-inner group">
              <canvas 
                ref={canvasRef}
                width={800}
                height={400}
                className="w-full cursor-crosshair touch-none bg-white"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={endDrawing}
                onMouseLeave={endDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={endDrawing}
              />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <button onClick={clearCanvas} className="px-8 py-5 bg-slate-100 text-slate-400 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all">Reset</button>
              <button onClick={adoptSignature} className="col-span-2 bg-slate-900 text-white font-black py-5 rounded-2xl hover:bg-slate-800 transition-all shadow-2xl uppercase text-xs tracking-widest">Apply Signature</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SigningView;
