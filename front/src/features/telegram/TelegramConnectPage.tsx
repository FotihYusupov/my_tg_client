import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';

export const TelegramConnectPage: React.FC = () => {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const user = useAuthStore((state) => state.user);
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      if (!user?.telegramId) {
        setCheckingSession(false);
        return;
      }
      
      try {
        const { data } = await api.get('/telegram/check-session');
        if (data.valid) {
          navigate('/dashboard');
        } else {
          setCheckingSession(false);
        }
      } catch (err) {
        setCheckingSession(false);
      }
    };
    
    checkSession();
  }, [user, navigate]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/telegram/send-code', { phoneNumber });
      setStep('code');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/telegram/verify-code', { phoneNumber, code, password });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-slate-400">Checking Telegram session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full glass p-8 rounded-2xl shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-2">Connect Telegram</h1>
        <p className="text-slate-400 text-center mb-8">
          {step === 'phone' 
            ? 'Enter your phone number to link your account.' 
            : 'Enter the code sent to your Telegram app.'}
        </p>

        {step === 'phone' ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number (International format)</label>
              <input
                type="text"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none transition-all"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">2FA Password (If enabled)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-violet-600 text-white font-bold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Connect'}
            </button>
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full text-slate-400 text-sm hover:underline"
            >
              Change phone number
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
