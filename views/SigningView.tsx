
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { Envelope, DocStatus, FieldType, Recipient, DocField } from '../types';

const SigningView: React.FC = () => {
  const { id } = useParams<{ id: string }>(); 
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
      if (!id) return;
      
      // 1. Try resolving as a secure token link first
      const linkData = await db.getSigningLinkByToken(id);
      if (linkData) {
        const envData = await db.getEnvelopeById(linkData.envelope_id);
        if (envData) {
          setEnvelope(envData);
          // Auto-verify if the token matches a specific email
          const matchingRec = envData.recipients.find(r => r.email === linkData.signer_email);
          if (matchingRec) {
            setEmailInput(matchingRec.email);
          }
          return;
        }
      }

      // 2. Fallback to direct Envelope ID (for internal management testing)
      const data = await db.getEnvelopeById(id);
      if (data) setEnvelope(data);
    };
    load();
  }, [id]);

  const verifyIdentity = () => {
    if (!envelope) return;
    const recipient = envelope.recipients.find(r => r.email.toLowerCase().trim() === emailInput.toLowerCase().trim());
    
    if (!recipient) { alert("Email not recognized in this registry."); return; }
    if (recipient.order !== envelope.current_order) { 
      const current = envelope.recipients.find(r => r.order === envelope.current_order);
      alert(`Access Restricted. It is currently ${current?.name || 'another party'}'s turn to sign.`); 
      return; 
    }
    if (recipient.completed) { alert("Execution complete. You have already signed this asset."); return; }

    setCurrentRecipient(recipient);
    setIsVerified(true);
  };

  const getCoordinates = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Adjust for internal canvas resolution vs displayed size (scaling)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: any) => {
    if (e.type === 'touchstart') e.preventDefault();
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
  };

  const draw = (e: any) => {
    if (!isDrawing.current) return;
    if (e.type === 'touchmove') e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
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
      canvas.width = mainImg.width; 
      canvas.height = mainImg.height;
      const ctx = canvas.getContext('2d'); 
      if (!ctx) throw new Error("Canvas init failed");
      ctx.drawImage(mainImg, 0, 0);

      const sigImg = new Image();
      sigImg.src = signatureData;
      await new Promise(r => sigImg.onload = r);

      const updatedFields = envelope.fields.map(f => {
        if (f.recipientId === currentRecipient.id) {
          const x = (f.x / 100) * canvas.width;
          const y = (f.y / 100) * canvas.height;
          if (f.type === FieldType.SIGNATURE) {
            // Draw signature centered on tag
            ctx.drawImage(sigImg, x - 150, y - 75, 300, 150);
            return { ...f, value: '[SIGNED]', signedAt: new Date().toISOString() };
          } else {
            const text = f.type === FieldType.DATE_SIGNED ? new Date().toLocaleDateString() : fieldValues[f.id] || '';
            ctx.font = "bold 42px 'Inter'"; 
            ctx.fillStyle = "#000"; 
            ctx.fillText(text, x - 50, y + 10);
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

      // If there is a next signer, generate their link automatically
      const nextSigner = envelope.recipients.find(r => r.order === nextOrder);
      if (nextSigner) {
        await db.createSigningLink(envelope.id, nextSigner.email);
      }

      setIsCompleted(true);
    } catch (err) { 
      console.error(err);
      alert('Finalization failed. Please check registry connectivity.'); 
    } finally { setIsSaving(false); }
  };

  if (!isVerified) return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <div className="bg-white p-16 rounded-[4rem] shadow-2xl border border-slate-100">
        <h2 className="text-3xl inter-black mb-10">Signer Verification</h2>
        <p className="text-slate-400 text-sm mb-8">Enter your registered email to access the legal asset.</p>
        <input 
          type="email" 
          value={emailInput} 
          onChange={(e) => setEmailInput(e.target.value)} 
          className="w-full bg-slate-50 border-2 rounded-2xl p-5 mb-6 text-center font-bold outline-none focus:border-blue-600" 
          placeholder="email@example.com" 
        />
        <button onClick={verifyIdentity} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-slate-800 transition-all">Verify & Sign</button>
      </div>
    </div>
  );

  if (isCompleted) return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <div className="bg-white p-16 rounded-[4rem] shadow-2xl border border-slate-100">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
           <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-3xl inter-black mb-4">Workflow Complete</h2>
        <p className="text-slate-500 mb-12">Your signature has been registered and flattened onto the legal registry asset.</p>
        <button onClick={() => navigate('/')} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl">Exit Registry</button>
      </div>
    </div>
  );

  if (!envelope || !currentRecipient) return <div className="p-32 text-center text-slate-400 font-black animate-pulse">SYNCING REGISTRY...</div>;

  return (
    <div className="max-w-6xl mx-auto pb-32">
      {isSaving && <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-xl flex flex-col items-center justify-center"><div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-6"></div><p className="inter-black text-white text-xl">Flattening Legal Layers...</p></div>}
      
      <div className="bg-white border p-8 rounded-[3rem] shadow-2xl mb-12 flex justify-between items-center sticky top-4 z-40 backdrop-blur-md">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black">R{currentRecipient.order}</div>
          <div><h2 className="text-2xl inter-black leading-none">{envelope.name}</h2><p className="text-xs text-slate-400 font-bold uppercase mt-1">Signer: {currentRecipient.name}</p></div>
        </div>
        <div className="flex gap-4">
          {!signatureData ? 
            <button onClick={() => setIsAdopting(true)} className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black text-xs uppercase shadow-2xl hover:bg-blue-500 transition-all">Adopt Signature</button> : 
            <button onClick={finishSigning} className="bg-emerald-500 text-slate-900 px-12 py-5 rounded-2xl font-black text-xs uppercase shadow-2xl hover:bg-emerald-400 transition-all">Flatten & Execute</button>
          }
        </div>
      </div>

      <div className="relative bg-white shadow-2xl rounded-[3rem] overflow-hidden border p-12">
        <div className="relative mx-auto max-w-4xl border border-slate-100 shadow-sm">
          <img src={envelope.document_url} alt="Doc" className="w-full block" />
          {envelope.fields.map(field => {
            const isAssigned = field.recipientId === currentRecipient.id;
            return (
              <div key={field.id} style={{ left: `${field.x}%`, top: `${field.y}%` }} className="absolute transform -translate-x-1/2 -translate-y-1/2">
                {field.type === FieldType.SIGNATURE ? (
                  isAssigned && signatureData ? <img src={signatureData} className="w-56" alt="Sig" /> : 
                  <div className={`px-10 py-5 rounded-xl border-2 border-dashed ${isAssigned ? 'border-blue-600 bg-blue-50 text-blue-600 animate-pulse' : 'border-slate-200 bg-slate-50 text-slate-200'} text-[10px] font-black uppercase`}>
                    {isAssigned ? 'Sign Here' : 'Reserved'}
                  </div>
                ) : (
                  isAssigned ? 
                  <input 
                    placeholder={field.type}
                    value={fieldValues[field.id] || ''} 
                    onChange={e => setFieldValues({...fieldValues, [field.id]: e.target.value})} 
                    className="px-6 py-3 border-2 border-blue-600 bg-blue-50 rounded-xl font-bold text-blue-900 outline-none focus:ring-4 focus:ring-blue-100" 
                  /> : 
                  <div className="px-6 py-3 border-2 border-slate-100 bg-slate-50 text-slate-200 rounded-xl text-xs font-bold">{field.type}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isAdopting && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[4rem] p-12 w-full max-w-2xl animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-3xl inter-black">Capture Signature</h3>
              <button onClick={() => setIsAdopting(false)} className="text-slate-400 hover:text-slate-900 font-black text-2xl">×</button>
            </div>
            
            <div className="bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] overflow-hidden mb-12 shadow-inner">
              <canvas 
                ref={canvasRef} 
                width={800} 
                height={400} 
                className="w-full h-[300px] bg-white touch-none cursor-crosshair" 
                onMouseDown={startDrawing} 
                onMouseMove={draw} 
                onMouseUp={stopDrawing} 
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <button 
                onClick={() => {
                  const canvas = canvasRef.current;
                  const ctx = canvas?.getContext('2d');
                  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
                }} 
                className="bg-slate-100 text-slate-400 font-black py-5 rounded-2xl hover:bg-slate-200 transition-all"
              >
                Reset
              </button>
              <button 
                onClick={() => { 
                  setSignatureData(canvasRef.current?.toDataURL() || null); 
                  setIsAdopting(false); 
                }} 
                className="col-span-2 bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-slate-800 transition-all"
              >
                Apply Signature
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SigningView;
