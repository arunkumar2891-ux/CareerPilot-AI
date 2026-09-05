import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Rocket, Mail, Chrome, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const { signIn, signUp, signInWithOAuth, signInWithMagicLink, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please enter your email and password'); return; }
    if (mode === 'signup' && !fullName) { toast.error('Please enter your name'); return; }
    const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, fullName);
    if (result.error) toast.error(result.error);
    else { toast.success(mode === 'signin' ? 'Welcome back!' : 'Account created!'); navigate('/'); }
  };

  const handleOAuth = async () => { await signInWithOAuth('google'); };

  const handleMagicLink = async () => {
    if (!email) { toast.error('Enter your email first'); return; }
    const result = await signInWithMagicLink(email);
    if (result.error) toast.error(result.error); else toast.success('Magic link sent to your email');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -right-40 bottom-1/4 h-96 w-96 rounded-full bg-chart-4/20 blur-3xl" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-md px-4">
        <div className="glass-card p-6 sm:p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-4 shadow-xl shadow-primary/30">
              <Rocket className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">CareerPilot AI</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your autonomous AI job search copilot</p>
          </div>

          <div className="mb-6 flex rounded-lg bg-muted p-1">
            <button onClick={() => setMode('signin')} className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>Sign In</button>
            <button onClick={() => setMode('signup')} className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>Sign Up</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2"><Label htmlFor="fullName">Full Name</Label><Input id="fullName" type="text" placeholder="Alex Morgan" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            )}
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" disabled={loading} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or continue with</span><div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleOAuth} className="flex-col gap-1 py-3"><Chrome className="h-5 w-5" /><span className="text-[10px]">Google</span></Button>
            <Button variant="outline" onClick={handleMagicLink} className="flex-col gap-1 py-3"><Mail className="h-5 w-5" /><span className="text-[10px]">Magic</span></Button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /><span>Connected to Supabase — sign up to get started</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
