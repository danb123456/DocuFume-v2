
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { Envelope, DocStatus, FieldType, Recipient, DocField } from '../types';

const SigningView: React.FC = () => {
  const { id } = useParams<{ id: string }>(); // Using ID for internal bypass or token if implemented
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
      if (id) {
        const data = await db.getEnvelopeById(id);
        if (data) setEnvelope(data);
      }
    };
    load();
  }, [id]);

  const verifyIdentity = () => {
    if (!envelope) return;
    const recipient = envelope.recipients.find(r => r.email.toLowerCase() === emailInput.toLowerCase());
    
    if (!recipient) { alert("Email not recognized."); return; }
    if (recipient.order !== envelope.current_order) { alert(`It is not your turn. Current signer: ${envelope.recipients.find(r => r.order === envelope.current_order)?.email}`); return; }
    if (recipient.completed) { alert("Already completed."); return; }

    setCurrentRecipient(recipient);
    setIsVerified(true);
  };

  const startDrawing = (e: any) => {
    isDrawing.current = true;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 2.5; ctx.strokeStyle = '#000000';
  };

  const draw = (e: any) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y); ctx.stroke();
  };

  const finishSigning = async () => {
    if (!envelope || !currentRecipient || !signatureData) return;
    setIsSaving(true);
    try {
      const mainImg = new Image();
      mainImg.crossOrigin = "anonymous";
      mainImg.src = envelope.document_url;
      await new Promise(r => mainImg.onload = r);
      const canvas = document.createElement('canvas');
      canvas.width = mainImg.width; canvas.height = mainImg.height;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error("Canvas init failed");
      ctx.drawImage(mainImg, 0, 0);

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
            const text = f.type === FieldType.DATE_SIGNED ? new Date().toLocaleDateString() : fieldValues[f.id] || '';
            ctx.font = "bold 42px 'Inter'"; ctx.fillStyle = "#000"; ctx.fillText(text, x - 50, y + 10);
            return { ...f, value: text, signedAt: new Date().toISOString() };
          }
        }
        return f;
      });

      const finalImage = canvas.toDataURL('image/jpeg', 0.9);
      const signedUrl = await db.uploadFile(envelope.id, `executed_order_${currentRecipient.order}.jpg`, finalImage);
      const nextOrder = envelope.current_order + 1;
      const updatedRecipients = envelope.recipients.map(r => r.id === currentRecipient.id ? { ...r, completed: true } : r);
      const isLastSigner = nextOrder > envelope.recipients.length;

      await db.saveEnvelope({
        ...envelope,
        status: isLastSigner ? DocStatus.COMPLETED : DocStatus.SENT,
        current_order: nextOrder,
        document_url: signedUrl,
        recipients: updatedRecipients,
        fields: updatedFields,
        archive_url: isLastSigner ? signedUrl : envelope.archive_url 
      });

      setIsCompleted(true);
    } catch (err) { alert('Finalization failed.'); } finally { setIsSaving(false); }
  };

  if (!isVerified) return <div className="max-w-md mx-auto mt-24 text-center"><div className="bg-white p-16 rounded-[4rem] shadow-2xl border border-slate-100"><h2 className="text-3xl inter-black mb-10">Signer Verification</h2><input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} className="w-full bg-slate-50 border-2 rounded-2xl p-5 mb-6 text-center font-bold" placeholder="Email Address" /><button onClick={verifyIdentity} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl">Verify & Sign</button></div></div>;
  if (isCompleted) return <div className="max-w-md mx-auto mt-24 text-center"><div className="bg-white p-16 rounded-[4rem] shadow-2xl border border-slate-100"><h2 className="text-3xl inter-black mb-4">Workflow Complete</h2><p className="text-slate-500 mb-12">Your signature has been registered and flattened onto the legal registry.</p><button onClick={() => navigate('/')} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl">Exit Registry</button></div></div>;
  if (!envelope || !currentRecipient) return <div className="p-32 text-center text-slate-400 font-black">SYNCING REGISTRY...</div>;

  return (
    <div className="max-w-6xl mx-auto pb-32">
      {isSaving && <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-xl flex flex-col items-center justify-center"><p className="inter-black text-white text-xl">Flattening Legal Layers...</p></div>}
      <div className="bg-white border p-8 rounded-[3rem] shadow-2xl mb-12 flex justify-between items-center sticky top-4 z-40 backdrop-blur-md">
        <div className="flex items-center gap-5"><div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black">R{currentRecipient.order}</div><div><h2 className="text-2xl inter-black">Legal Execution Required</h2></div></div>
        <div className="flex gap-4">{!signatureData ? <button onClick={() => setIsAdopting(true)} className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black text-xs uppercase shadow-2xl">Adopt Signature</button> : <button onClick={finishSigning} className="bg-emerald-500 text-slate-900 px-12 py-5 rounded-2xl font-black text-xs uppercase shadow-2xl">Flatten & Execute</button>}</div>
      </div>
      <div className="relative bg-white shadow-2xl rounded-[3rem] overflow-hidden border p-12"><div className="relative"><img src={envelope.document_url} alt="Doc" className="w-full block" />
        {envelope.fields.map(field => {
          const isAssigned = field.recipientId === currentRecipient.id;
          return <div key={field.id} style={{ left: `${field.x}%`, top: `${field.y}%` }} className="absolute transform -translate-x-1/2 -translate-y-1/2">
            {field.type === FieldType.SIGNATURE ? (isAssigned && signatureData ? <img src={signatureData} className="w-56" alt="Sig" /> : <div className={`px-10 py-5 rounded-xl border-2 border-dashed ${isAssigned ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-200 bg-slate-50 text-slate-200'} text-[10px] font-black uppercase`}>{isAssigned ? 'Sign Here' : 'Reserved'}</div>) : (isAssigned ? <input value={fieldValues[field.id] || ''} onChange={e => setFieldValues({...fieldValues, [field.id]: e.target.value})} className="px-6 py-3 border-2 border-blue-600 bg-blue-50 rounded-xl" /> : <div className="px-6 py-3 border-2 border-slate-100 bg-slate-50 text-slate-200 rounded-xl">{field.type}</div>)}
          </div>;
        })}
      </div></div>
      {isAdopting && <div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-center justify-center p-6"><div className="bg-white rounded-[4rem] p-16 w-full max-w-2xl"><h3 className="text-4xl inter-black mb-12">Capture Signature</h3><div className="bg-slate-50 border rounded-[2.5rem] overflow-hidden mb-12"><canvas ref={canvasRef} width={800} height={400} className="w-full bg-white touch-none" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => isDrawing.current = false} onMouseLeave={() => isDrawing.current = false} /></div><div className="grid grid-cols-3 gap-6"><button onClick={() => canvasRef.current?.getContext('2d')?.clearRect(0,0,800,400)} className="bg-slate-100 text-slate-400 font-black py-5 rounded-2xl">Reset</button><button onClick={() => { setSignatureData(canvasRef.current?.toDataURL() || null); setIsAdopting(false); }} className="col-span-2 bg-slate-900 text-white font-black py-5 rounded-2xl">Apply</button></div></div></div>}
    </div>
  );
};

export default SigningView;
